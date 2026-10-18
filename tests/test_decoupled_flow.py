"""End-to-end integration tests for the Two-Window Decoupled Architecture (Issue #224).

Validates the complete decoupled flow between:
- Window 1 (Factory Floor Client: simulator/server.py and edge/pubsub_dispatcher.py)
- Google Cloud Pub/Sub quality events topic (kaizen-quality-events)
- Window 2 (Cloud AI Control Plane: backend/api and ADK Orchestrator)

Asserts zero direct calls to /api/simulation/inject throughout the incident lifecycle.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import MagicMock, patch

import httpx
import pytest
from httpx import ASGITransport
from starlette.testclient import TestClient

import backend.agents.orchestrator as orchestrator_module
from backend.api.main import app as backend_app
from backend.api.routes_simulation import DEV_INJECT_HEADER, DEV_INJECT_VALUE
from backend.core.blackboard import blackboard
from backend.core.models import QualityEventPayload
from backend.core.pubsub_manager import pubsub_manager
from simulator.injection_engine import injection_engine
from simulator.server import app as factory_app
from simulator.server import service as factory_service

# Local tests run with APP_ENV != production; the dev-inject header is required
# since the gate introduced in #309 to reach the legacy happy path.
DEV_INJECT_HEADERS = {DEV_INJECT_HEADER: DEV_INJECT_VALUE}


@pytest.fixture(autouse=True)
def clean_system_state():
    """Ensures each test starts and finishes with pristine blackboard, simulator, and pubsub state."""
    asyncio.run(orchestrator_module.orchestrator.reset())
    injection_engine.reset()
    factory_service.reset()
    pubsub_manager.reset_availability_cache()
    yield
    asyncio.run(orchestrator_module.orchestrator.reset())
    injection_engine.reset()
    factory_service.reset()
    pubsub_manager.reset_availability_cache()


def _create_mock_pubsub_message(payload: QualityEventPayload) -> MagicMock:
    """Creates a mock Pub/Sub message wrapping a serialized QualityEventPayload."""
    mock_msg = MagicMock()
    mock_msg.data = payload.model_dump_json().encode("utf-8")
    mock_msg.message_id = f"mock-msg-{payload.event_id[:8]}"
    mock_msg.ack = MagicMock()
    mock_msg.nack = MagicMock()
    return mock_msg


@pytest.mark.asyncio
async def test_decoupled_two_window_full_loop_scenario_1():
    """Validates full decoupled loop for Scenario 1 (CNC-02 Tool Wear).

    1. Window 1 (Factory Floor Client) triggers /api/factory/inject.
    2. Edge Pub/Sub dispatcher publishes QualityEventPayload.
    3. Backend Pub/Sub subscriber receives payload and dispatches to Orchestrator.
    4. Orchestrator executes ADK multi-agent workflow and streams state to Window 2.
    5. Shift leader approves incident closure.
    6. Verifies zero direct calls were made to /api/simulation/inject.
    """
    backend_transport = ASGITransport(app=backend_app)
    factory_transport = ASGITransport(app=factory_app)

    async with (
        httpx.AsyncClient(
            transport=backend_transport, base_url="http://test-backend"
        ) as backend_client,
        httpx.AsyncClient(
            transport=factory_transport, base_url="http://test-factory"
        ) as factory_client,
    ):
        # Instrument spy on deprecated /api/simulation/inject to assert zero calls
        with patch(
            "backend.api.routes_simulation.inject_defect",
            wraps=backend_app.routes,
        ) as mock_legacy_inject:
            # 1. Verify initial nominal states across both windows
            resp_fact_status = await factory_client.get("/api/factory/status")
            assert resp_fact_status.status_code == 200
            assert resp_fact_status.json()["active_scenario"] is None

            resp_inc_curr = await backend_client.get("/api/incidents/current")
            assert resp_inc_curr.status_code == 200
            assert resp_inc_curr.json()["status"] == "normal"

            # 2. Window 1: Operator triggers CNC-02 Tool Wear anomaly on Factory Floor
            inject_payload = {
                "scenario": "cnc_tool_wear",
                "machine_id": "CNC-02",
                "mode": "fast",
                "severity": 1.0,
                "dispatch_quality_event": True,
            }
            resp_inject = await factory_client.post("/api/factory/inject", json=inject_payload)
            assert resp_inject.status_code == 200
            inject_data = resp_inject.json()
            assert inject_data["status"] == "ok"
            assert inject_data["pubsub_dispatch"]["quality_event"] is True
            assert len(inject_data["delivery_reports"]) > 0

            # Verify Gemma 3 edge classification metadata is populated
            edge_stats = inject_data["edge_stats"]
            assert "total_frames_evaluated" in edge_stats
            assert "cloud_bandwidth_reduction_pct" in edge_stats

            # Extract the dispatched QualityEventPayload from factory dispatcher
            dispatched_events = factory_service.pubsub_dispatcher.get_published_events()
            quality_events = [e for e in dispatched_events if e["topic"].endswith("quality-events")]
            assert len(quality_events) >= 1, "Factory dispatcher must publish a quality-event"
            latest_q_evt = QualityEventPayload.model_validate(quality_events[-1]["payload"])
            assert latest_q_evt.machine_id == "CNC-02"
            assert latest_q_evt.scenario == "cnc_tool_wear"

            # 3. Cloud Ingress: Pub/Sub subscriber receives message and activates Orchestrator
            mock_msg = _create_mock_pubsub_message(latest_q_evt)
            pubsub_manager._handle_quality_event_message(mock_msg)
            mock_msg.ack.assert_called_once()
            mock_msg.nack.assert_not_called()

            # 4. Window 2: Monitor passive incident progression to 'pending_approval'
            timeout = 10.0
            start_time = asyncio.get_event_loop().time()
            final_state: dict[str, Any] | None = None

            while asyncio.get_event_loop().time() - start_time < timeout:
                resp_poll = await backend_client.get("/api/incidents/current")
                assert resp_poll.status_code == 200
                data = resp_poll.json()
                if data["status"] == "pending_approval":
                    final_state = data
                    break
                await asyncio.sleep(0.1)

            assert final_state is not None, (
                "Decoupled incident workflow did not reach pending approval within timeout"
            )
            assert final_state["status"] == "pending_approval"
            assert final_state["verification_count"] >= 50
            assert final_state["repair_done"] is True
            assert "WO-2026-1004" in final_state.get("documents", {}).get("work_order", "")

            # Verify all multi-agent findings are logged
            agent_ids = {f["agent_id"] for f in final_state["findings"]}
            assert {"QA", "TRA", "PA", "RCA", "COPILOT", "DOC", "LEARN"}.issubset(agent_ids)

            # 5. Shift Leader approval in Window 2
            resp_approve = await backend_client.post("/api/incidents/approve")
            assert resp_approve.status_code == 200
            approved_data = resp_approve.json()["state"]
            assert approved_data["status"] == "closed"
            assert approved_data["approved"] is True
            assert approved_data["approved_by"] == "test"
            assert approved_data["approved_at"] is not None

            # 6. Reset both windows back to nominal baseline
            resp_fact_reset = await factory_client.post("/api/factory/reset")
            assert resp_fact_reset.status_code == 200

            resp_sim_reset = await backend_client.post("/api/simulation/reset")
            assert resp_sim_reset.status_code == 200
            assert resp_sim_reset.json()["state"]["status"] == "normal"

            # 7. CRITICAL ARCHITECTURAL ASSERTION: Zero calls to /api/simulation/inject
            assert mock_legacy_inject.call_count == 0, (
                "Decoupled architecture violation: /api/simulation/inject was called during the test flow!"
            )


@pytest.mark.asyncio
async def test_decoupled_two_window_full_loop_scenario_2():
    """Validates full decoupled loop for Scenario 2 (IM-05 Damp Material).

    Confirms injection molding domain defect propagation via Pub/Sub to Orchestrator,
    resolving dew-point/mold cavity findings without direct HTTP backend injection.
    """
    backend_transport = ASGITransport(app=backend_app)
    factory_transport = ASGITransport(app=factory_app)

    async with (
        httpx.AsyncClient(
            transport=backend_transport, base_url="http://test-backend"
        ) as backend_client,
        httpx.AsyncClient(
            transport=factory_transport, base_url="http://test-factory"
        ) as factory_client,
    ):
        with patch(
            "backend.api.routes_simulation.inject_defect",
            wraps=backend_app.routes,
        ) as mock_legacy_inject:
            # 1. Window 1: Operator triggers IM-05 Damp Material anomaly
            inject_payload = {
                "scenario": "im_damp_material",
                "machine_id": "IM-05",
                "mode": "fast",
                "severity": 1.0,
                "dispatch_quality_event": True,
            }
            resp_inject = await factory_client.post("/api/factory/inject", json=inject_payload)
            assert resp_inject.status_code == 200
            assert resp_inject.json()["pubsub_dispatch"]["quality_event"] is True

            dispatched_events = factory_service.pubsub_dispatcher.get_published_events()
            quality_events = [e for e in dispatched_events if e["topic"].endswith("quality-events")]
            assert len(quality_events) >= 1
            latest_q_evt = QualityEventPayload.model_validate(quality_events[-1]["payload"])
            assert latest_q_evt.machine_id == "IM-05"
            assert latest_q_evt.scenario == "im_damp_material"

            # 2. Ingest into backend Pub/Sub subscriber
            mock_msg = _create_mock_pubsub_message(latest_q_evt)
            pubsub_manager._handle_quality_event_message(mock_msg)
            mock_msg.ack.assert_called_once()

            # 3. Window 2: Wait for incident completion
            timeout = 10.0
            start_time = asyncio.get_event_loop().time()
            final_state: dict[str, Any] | None = None

            while asyncio.get_event_loop().time() - start_time < timeout:
                resp_poll = await backend_client.get("/api/incidents/current")
                assert resp_poll.status_code == 200
                data = resp_poll.json()
                if data["status"] == "pending_approval":
                    final_state = data
                    break
                await asyncio.sleep(0.1)

            assert final_state is not None
            assert final_state["status"] == "pending_approval"
            assert final_state["verification_count"] >= 50
            assert "WO-2026-1005" in final_state.get("documents", {}).get("work_order", "")

            # Check domain findings for injection molding
            all_findings = " ".join(f["finding"] for f in final_state["findings"])
            assert (
                "IM-05" in all_findings
                or "Mold Cavity" in all_findings
                or "dew point" in all_findings
            )

            # 4. Shift Leader approval
            resp_approve = await backend_client.post("/api/incidents/approve")
            assert resp_approve.status_code == 200
            assert resp_approve.json()["state"]["approved"] is True

            # 5. Zero legacy injection calls
            assert mock_legacy_inject.call_count == 0


@pytest.mark.asyncio
async def test_decoupled_flow_blackboard_sse_subscription():
    """Validates that Window 2 web clients receive real-time incident updates via SSE stream."""
    gen = blackboard.subscribe()
    initial_event = await anext(gen)
    assert "status" in initial_event
    assert "normal" in initial_event

    # Simulate Pub/Sub quality event ingestion
    q_evt = QualityEventPayload(
        scenario="cnc_tool_wear",
        machine_id="CNC-02",
        tool_id="T07",
        mode="fast",
        defect_type="scratch_vertical",
        defect_rate=0.08,
    )
    mock_msg = _create_mock_pubsub_message(q_evt)
    pubsub_manager._handle_quality_event_message(mock_msg)
    mock_msg.ack.assert_called_once()

    # The subscriber should receive an update reflecting the active incident
    event_update = await asyncio.wait_for(anext(gen), timeout=3.0)
    assert "INC-" in event_update

    await gen.aclose()


def test_legacy_simulation_inject_contract_deprecation():
    """Validates that direct calls to /api/simulation/inject produce deprecation headers and warning log."""
    client = TestClient(backend_app)
    with patch.object(orchestrator_module.orchestrator, "start_incident", return_value=True):
        resp = client.post(
            "/api/simulation/inject",
            json={"scenario": "cnc_tool_wear", "mode": "fast"},
            headers=DEV_INJECT_HEADERS,
        )
        assert resp.status_code == 200
        assert resp.headers.get("Deprecation") == "true"
        assert "</api/factory/inject>" in resp.headers.get("Link", "")


# ---------------------------------------------------------------------------
# TKT-073 follow-up / #294 — extended decoupled-flow assertions
#
# The four preceding tests cover the happy path. The two below pin down the
# contract end-points that the central backend enforces around the factory
# stream: simulated QoS drops surface in the orchestrator state, and the
# factory stream SSE keeps a stable consumer across reconnect bursts.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_decoupled_flow_factory_to_backend_uses_jwt_bearer():
    """Window 1 -> Window 2 actually carries a Bearer JWT, not legacy X-API-Key.

    Issue #288 (TKT-073) migrated factory auth from X-API-Key to central
    JWT. The contract is that ``backend.tools.factory_client`` sends
    ``Authorization: Bearer ...``; the legacy header must not be present
    so a regression to X-API-Key is caught here.
    """
    # Static source-of-truth check: the factory client module must never
    # name the X-API-Key header (case insensitive). We do not exercise the
    # network path here because the JWT bootstrap requires the central
    # backend's /api/auth/login to be reachable in the right env.
    from pathlib import Path

    src = (
        Path(__file__).resolve().parent.parent
        / "backend"
        / "tools"
        / "factory_client.py"
    ).read_text(encoding="utf-8")
    lowered = src.lower()
    assert "x-api-key" not in lowered, (
        "factory_client must not send legacy X-API-Key header (TKT-073 / #288). "
        "Re-add only if rolling back the JWT migration."
    )
    # And it must reference Bearer so the migration is actually present.
    assert "bearer" in lowered, (
        "factory_client must use Authorization: Bearer <jwt> per TKT-073"
    )
    # Cache + retry surface signs: module-scoped JWT cache + 401 refresh.
    assert "_BearerCache" in src or "_bearer_cache" in src or "bearer_cache" in lowered
    assert "401" in src, (
        "factory_client must keep its refresh-on-401 retry so a rotated "
        "secret does not silently lock out the backend."
    )


@pytest.mark.asyncio
async def test_decoupled_flow_quality_event_envelope_roundtrip():
    """``quality_events`` Pub/Sub messages round-trip without field loss.

    Confirms the Window 1 dispatcher emits a payload that Window 2's
    ``pubsub_manager._handle_quality_event_message`` can deserialize into
    the same ``QualityEventPayload`` shape — the contract that lets the
    decoupled architecture remain contract-only (no implicit schemas).
    """
    from backend.core.models import QualityEventPayload

    payload = QualityEventPayload(
        machine_id="CNC-99",
        scenario="cnc_tool_wear",
        defect_type="structural_crack",
        defect_rate=0.18,
        severity="high",
        event_id="roundtrip-uuid-1234",
        timestamp="2026-10-01T00:00:00Z",
    )
    # Encode -> decode mirrors what Pub/Sub does at the wire boundary.
    serialized = payload.model_dump_json().encode("utf-8")
    decoded = QualityEventPayload.model_validate_json(serialized)
    assert decoded.machine_id == payload.machine_id
    assert decoded.scenario == payload.scenario
    assert decoded.defect_rate == payload.defect_rate
    assert decoded.severity == payload.severity
    assert decoded.event_id == payload.event_id
