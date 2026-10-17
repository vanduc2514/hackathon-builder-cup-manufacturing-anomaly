"""API Routes: Simulation controls and defect injection trigger."""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Header, HTTPException, Response, status

from backend.agents.orchestrator import orchestrator
from backend.core.config import settings
from backend.core.models import (
    DefectInjectionRequest,
    SimulationInjectResponse,
    SimulationResetResponse,
    SimulationStatusResponse,
)
from backend.tools.bigquery_tool import reset_buffers
from backend.tools.factory_client import factory_client

# Name of the debug header that opts a caller into the legacy HTTP inject path.
# It exists so the route can stay callable from local developer tooling and the
# existing pytest suite while remaining inert against any anonymous caller in
# production. Production deploys simply never set this header (see #309).
DEV_INJECT_HEADER = "X-Kaizen-Dev-Inject"
DEV_INJECT_VALUE = "1"

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/simulation", tags=["simulation"])

# Scenario 2 trigger values used when the caller leaves the CNC defaults untouched.
_IM_DAMP_MATERIAL_DEFAULTS: Dict[str, Any] = {
    "machine_id": "IM-05",
    "tool_id": "MOLD-03",
    "defect_type": "short_fill",
    "defect_rate": 0.081,
}


def _resolve_trigger(req: DefectInjectionRequest) -> DefectInjectionRequest:
    """Fills scenario-specific machine/tool/defect values the caller did not set."""
    if req.scenario != "im_damp_material":
        return req
    unset = {k: v for k, v in _IM_DAMP_MATERIAL_DEFAULTS.items() if k not in req.model_fields_set}
    return req.model_copy(update=unset)


@router.post("/inject", response_model=SimulationInjectResponse, deprecated=True)
async def inject_defect(
    req: DefectInjectionRequest = DefectInjectionRequest(),
    response: Response = Response(),
    x_kaizen_dev_inject: str | None = Header(default=None, alias=DEV_INJECT_HEADER),
) -> SimulationInjectResponse:
    """Injects the scenario's defect burst into the simulator and starts the incident workflow.

    DEPRECATED: Direct HTTP defect injection via /api/simulation/inject is deprecated in favor of
    the event-driven Google Cloud Pub/Sub ingestion pipeline (topic: kaizen-quality-events) and
    the factory simulator ingress (/api/factory/inject).

    Dev-only gating (#309): this route is a back door that calls
    ``orchestrator.start_incident()`` directly, bypassing the Pub/Sub data plane that
    production traffic follows. Any caller with a valid user token could otherwise fabricate
    an incident from a single REST call, which is a footgun for both reviewers and future
    contributors. To keep the route callable from the local dev tooling and the existing
    pytest suite while making it inert against any anonymous caller in production, every
    request must satisfy **both** of the following:

    1. Send the debug header ``X-Kaizen-Dev-Inject: 1``.
    2. Originate from a non-production environment (``APP_ENV != production``).

    When either condition is missing, the endpoint responds with ``410 Gone`` and a body
    explaining the rationale. Production deploys therefore cannot trigger an incident via
    this route even if a valid JWT is presented; the canonical production path remains
    the Pub/Sub quality-events topic (or the factory simulator's ``/api/factory/inject``).
    """
    if x_kaizen_dev_inject != DEV_INJECT_VALUE or settings.is_production:
        logger.warning(
            "BLOCKED dev-inject attempt: POST /api/simulation/inject requires header %s=%s and APP_ENV!=production "
            "(received header=%r, app_env=%r). Use the Pub/Sub quality-events pipeline or /api/factory/inject.",
            DEV_INJECT_HEADER,
            DEV_INJECT_VALUE,
            x_kaizen_dev_inject,
            settings.app_env,
            extra={
                "endpoint": "/api/simulation/inject",
                "header_present": x_kaizen_dev_inject is not None,
                "header_value": x_kaizen_dev_inject,
                "app_env": settings.app_env,
                "is_production": settings.is_production,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail=(
                "Endpoint /api/simulation/inject is dev-only and gated by header "
                f"'{DEV_INJECT_HEADER}: {DEV_INJECT_VALUE}' together with APP_ENV!=production. "
                "Production traffic must use the Pub/Sub quality-events pipeline (topic: "
                f"{settings.pubsub_quality_events_topic}) or POST /api/factory/inject. "
                "See issue #309 for the rationale."
            ),
        )

    logger.warning(
        "DEPRECATED ENDPOINT ACCESSED: POST /api/simulation/inject is deprecated and will be removed in a future release. "
        "Production defect triggers must be published via Google Cloud Pub/Sub pipeline (topic: %s) "
        "or POST /api/factory/inject.",
        settings.pubsub_quality_events_topic,
        extra={
            "endpoint": "/api/simulation/inject",
            "successor": "/api/factory/inject",
            "pubsub_topic": settings.pubsub_quality_events_topic,
            "scenario": req.scenario,
            "machine_id": req.machine_id,
            "app_env": settings.app_env,
        },
    )
    response.headers["Deprecation"] = "true"
    response.headers["Link"] = '</api/factory/inject>; rel="successor-version"'

    # 1. Reject if incident already running before making any external calls
    if orchestrator.is_running:
        raise HTTPException(status_code=409, detail="An incident workflow is already running")

    trigger = _resolve_trigger(req)
    if trigger.scenario == "im_damp_material":
        burst = {
            "scenario": "im_damp_material",
            "machine_id": trigger.machine_id,
            "tool_id": trigger.tool_id,
            "dew_point_target": "-18.5°C",
            "dew_point_nominal": "-40.0°C",
            "defect_type": trigger.defect_type,
            "spc_target_rate": f"{trigger.defect_rate:.1%}",
            "severity": trigger.severity,
        }
        message = (
            f"Scenario 2 defect burst injected: {trigger.machine_id} mold cavity #3 short fill "
            "& sink marks, dryer dew point rising to -18°C. ADK orchestrator workflow started."
        )
    else:
        burst = {
            "scenario": "cnc_tool_wear",
            "machine_id": trigger.machine_id,
            "tool_id": trigger.tool_id,
            "vibration_delta": "+35%",
            "current_delta": "+12%",
            "defect_type": trigger.defect_type,
            "spc_target_rate": f"{trigger.defect_rate:.1%}",
            "severity": trigger.severity,
        }
        message = (
            f"Scenario 1 defect burst injected: {trigger.machine_id}/{trigger.tool_id} spindle "
            "vibration spike (+35%) and vertical scratches exceeding UCL. ADK orchestrator workflow started."
        )

    duration = (
        trigger.duration_seconds
        if trigger.duration_seconds is not None
        else (8.0 if trigger.mode == "fast" else 90.0)
    )

    # 2. Claim the single-flight slot on the orchestrator FIRST (synchronous)
    started = orchestrator.start_incident(trigger)
    if not started:
        raise HTTPException(status_code=409, detail="An incident workflow is already running")

    # 3. Call factory simulator to inject anomaly (skip quality event dispatch)
    factory_sync = await factory_client.inject_anomaly(
        scenario=trigger.scenario,
        machine_id=trigger.machine_id,
        severity=trigger.severity,
        mode=trigger.mode,
        dispatch_quality_event=False,
    )

    return SimulationInjectResponse(
        status="triggered",
        scenario=trigger.scenario,
        mode=trigger.mode,
        duration_seconds=duration,
        defect_type=trigger.defect_type,
        target_machine=trigger.machine_id,
        target_tool=trigger.tool_id,
        burst_telemetry=burst,
        message=message,
        factory_sync=factory_sync,
    )


@router.post("/reset", response_model=SimulationResetResponse)
async def reset_simulation() -> SimulationResetResponse:
    """Cancels the running workflow, then restores the Blackboard, simulator and BigQuery buffers."""
    state = await orchestrator.reset()
    bq_reset = reset_buffers()
    factory_sync = await factory_client.reset_factory()
    state_dict = state.model_dump() if hasattr(state, "model_dump") else state
    return SimulationResetResponse(
        status="reset",
        message="Simulation reset to pristine baseline (Blackboard and BigQuery buffers restored)",
        state=state_dict,
        bigquery=bq_reset,
        factory_sync=factory_sync,
    )


@router.get("/status", response_model=SimulationStatusResponse)
async def get_simulation_status() -> SimulationStatusResponse:
    """Returns the running incident trigger and elapsed time."""
    return orchestrator.status()
