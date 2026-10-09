"""Full-stack E2E integration test suite for synthetic demo execution (Issue #85).

Validates end-to-end multi-agent execution, SSE blackboard streaming,
shift-leader approval, and simulation reset under offline mock conditions.
"""

from __future__ import annotations

import asyncio

import httpx
import pytest
from httpx import ASGITransport

from backend.agents.orchestrator import orchestrator
from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.models import DefectInjectionRequest
from simulator.injection_engine import injection_engine


@pytest.fixture(autouse=True)
def clean_blackboard():
    """Ensures each test starts and finishes with a pristine blackboard and simulation state."""
    asyncio.run(orchestrator.reset())
    injection_engine.reset()
    yield
    asyncio.run(orchestrator.reset())
    injection_engine.reset()


def test_fullstack_scenario_1_fast_lifecycle():
    """Validates complete multi-agent lifecycle for Scenario 1 (CNC tool wear)."""

    async def _run():
        trigger = DefectInjectionRequest(
            scenario="cnc_tool_wear",
            machine_id="CNC-02",
            tool_id="T07",
            defect_type="surface_scratch_face_a",
            defect_rate=0.0767,
            mode="fast",
            duration_seconds=5,
        )

        injection_engine.inject_scenario_1_cnc_tool_wear(
            machine_id=trigger.machine_id, tool_id=trigger.tool_id
        )

        state = await orchestrator.run_incident(trigger)

        assert state.status == "closed", f"Expected closed, got {state.status}"
        assert state.verification_count >= state.verification_target
        assert state.verification_target == 50
        assert state.repair_done is True
        assert state.documents is not None
        assert "WO-2026-1004" in state.documents.get("work_order", "")

        # Validate findings across all agent IDs
        agent_ids = {f.agent_id for f in state.findings}
        expected_ids = {"QA", "TRA", "PA", "RCA", "COPILOT", "DOC", "LEARN"}
        assert expected_ids.issubset(agent_ids), f"Missing agent IDs: {expected_ids - agent_ids}"

        # Verify shift-leader approval transitions to approved
        approved_state = orchestrator.approve("supervisor-qa-01")
        assert approved_state is not None
        assert approved_state.status == "closed"
        assert approved_state.approved is True

        # Verify reset restores pristine baseline
        reset_state = await orchestrator.reset()
        assert reset_state.status == "normal"
        assert len(reset_state.findings) == 0

    asyncio.run(_run())


def test_fullstack_scenario_2_fast_lifecycle():
    """Validates complete multi-agent lifecycle for Scenario 2 (IM damp material)."""

    async def _run():
        trigger = DefectInjectionRequest(
            scenario="im_damp_material",
            machine_id="IM-05",
            tool_id="MOLD-03",
            defect_type="short_shot_sink_marks",
            defect_rate=0.062,
            mode="fast",
            duration_seconds=5,
        )

        injection_engine.inject_scenario_2_im_damp_material(
            machine_id=trigger.machine_id, tool_id=trigger.tool_id
        )

        state = await orchestrator.run_incident(trigger)

        assert state.status == "closed", f"Expected closed, got {state.status}"
        assert state.verification_count >= state.verification_target
        assert state.documents is not None
        assert "WO-2026-1005" in state.documents.get("work_order", "")

        # Check injection molding domain findings
        findings_text = " ".join(f.finding for f in state.findings)
        assert (
            "IM-05" in findings_text
            or "Mold Cavity #3" in findings_text
            or "dew point" in findings_text
        )

        # Verify approval and reset
        approved_state = orchestrator.approve("shift-lead-02")
        assert approved_state is not None
        assert approved_state.status == "closed"
        assert approved_state.approved is True

        reset_state = await orchestrator.reset()
        assert reset_state.status == "normal"

    asyncio.run(_run())


def test_fullstack_api_endpoints():
    """Validates HTTP endpoints: health checks, inject, approve, and reset."""

    async def _run():
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            # 1. Health checks
            resp_health = await client.get("/health")
            assert resp_health.status_code == 200
            assert resp_health.json()["status"] == "healthy"

            resp_healthz = await client.get("/healthz")
            assert resp_healthz.status_code == 200
            assert resp_healthz.json()["status"] == "healthy"

            # 2. Initial state
            resp_curr = await client.get("/api/incidents/current")
            assert resp_curr.status_code == 200
            assert resp_curr.json()["status"] == "normal"

            # 3. Inject defect via API
            resp_inject = await client.post(
                "/api/simulation/inject",
                json={
                    "scenario": "cnc_tool_wear",
                    "machine_id": "CNC-02",
                    "tool_id": "T07",
                    "defect_type": "surface_scratch_face_a",
                    "defect_rate": 0.0767,
                    "mode": "fast",
                    "duration_seconds": 5,
                },
            )
            assert resp_inject.status_code == 200
            assert resp_inject.json()["status"] in ("triggered", "injected", "detecting")

            # 4. Wait for incident workflow completion to 'closed'
            timeout = 10.0
            start = asyncio.get_event_loop().time()
            final_state = None
            while asyncio.get_event_loop().time() - start < timeout:
                resp_poll = await client.get("/api/incidents/current")
                assert resp_poll.status_code == 200
                data = resp_poll.json()
                if data["status"] == "closed":
                    final_state = data
                    break
                await asyncio.sleep(0.1)

            assert final_state is not None, "Workflow did not transition to closed within timeout"
            assert final_state["verification_count"] >= 50

            # 5. Shift leader approval
            resp_approve = await client.post("/api/incidents/approve")
            assert resp_approve.status_code == 200
            approved_data = resp_approve.json()
            assert approved_data["state"]["status"] == "closed"
            assert approved_data["state"]["approved"] is True

            # 6. Reset simulation
            resp_reset = await client.post("/api/simulation/reset")
            assert resp_reset.status_code == 200
            assert resp_reset.json()["state"]["status"] == "normal"

            # Verify state is clean
            resp_after = await client.get("/api/incidents/current")
            assert resp_after.status_code == 200
            assert resp_after.json()["status"] == "normal"

    asyncio.run(_run())


def test_fullstack_sse_stream_receives_events():
    """Validates that blackboard subscribe yields real-time state updates."""

    async def _run():
        gen = blackboard.subscribe()
        initial = await anext(gen)
        assert "incident_id" in initial

        # Push update
        blackboard.update_status("detecting", incident_id="INC-TESTSSE-01")
        updated = await anext(gen)
        assert "INC-TESTSSE-01" in updated
        await gen.aclose()

    asyncio.run(_run())
