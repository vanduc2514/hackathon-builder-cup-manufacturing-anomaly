"""API Routes: Simulation controls and defect injection trigger."""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Response

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
) -> SimulationInjectResponse:
    """Injects the scenario's defect burst into the simulator and starts the incident workflow.

    DEPRECATED: Direct HTTP defect injection via /api/simulation/inject is deprecated in favor of
    the event-driven Google Cloud Pub/Sub ingestion pipeline (topic: kaizen-quality-events) and
    the factory simulator ingress (/api/factory/inject).
    """
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
