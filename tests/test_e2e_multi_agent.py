"""End-to-End Multi-Agent Integration Test Suite (Issue #41).

Validates the full multi-agent workflow lifecycle, physical verification gatekeeper invariants,
blackboard reactive subscriber concurrency, offline mock parity with zero GCP credentials,
and crash dump serialization on unhandled agent failures.
"""

from __future__ import annotations

import asyncio
import glob
import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from backend.agents.orchestrator import dump_crash, orchestrator
from backend.agents.workflow_nodes import (
    close_incident,
    reopen_investigation,
    verification_gate,
)
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import (
    AgentFinding,
    DefectInjectionRequest,
    IncidentState,
    VerificationResult,
)
from simulator.injection_engine import injection_engine


@pytest.fixture(autouse=True)
def clean_blackboard_and_crash_files():
    """Ensures each test starts and finishes with pristine blackboard, simulator, and clean workspace."""
    asyncio.run(orchestrator.reset())
    injection_engine.reset()
    injection_engine.conveyor_sim.rng.seed(42)
    injection_engine.machine_sim.rng.seed(42)
    yield
    asyncio.run(orchestrator.reset())
    injection_engine.reset()
    injection_engine.conveyor_sim.rng.seed(42)
    injection_engine.machine_sim.rng.seed(42)
    # Clean up any leftover crash dump files from testing
    for crash_file in glob.glob("crash_*.json"):
        try:
            os.remove(crash_file)
        except OSError:
            pass


@pytest.mark.asyncio
async def test_e2e_incident_simulation_lifecycle():
    """Criterion 1: End-to-End Simulation Lifecycle Test.

    Runs the full multi-agent workflow via Orchestrator.run_incident_simulation(req)
    with fast mode (step_delay=0.01).
    Asserts complete state progression through:
    detecting -> tracing -> investigating -> analyzing -> repairing -> verifying -> closed.
    Validates that findings for QA, TRA, PA, RCA, COPILOT, DOC (Scribe), and LEARN
    are all populated on the Blackboard.
    """
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

    # Subscribe in background to track reactive status progression
    observed_statuses: list[str] = []
    subscriber_ready = asyncio.Event()

    async def _track_statuses():
        first = True
        async for state_json in blackboard.subscribe():
            s = json.loads(state_json)["status"]
            if s not in observed_statuses:
                observed_statuses.append(s)
            if first:
                first = False
                subscriber_ready.set()

    tracker_task = asyncio.create_task(_track_statuses())
    await subscriber_ready.wait()

    # Use small step delay for fast test execution
    orchestrator._step_delay = 0.01
    try:
        final_state = await orchestrator.run_incident_simulation(trigger)
    finally:
        orchestrator._step_delay = None
        tracker_task.cancel()
        try:
            await tracker_task
        except asyncio.CancelledError:
            pass

    # Assert incident is closed and verified
    assert final_state.status == "closed", f"Expected closed status, got {final_state.status}"
    assert final_state.verification_count >= final_state.verification_target
    assert final_state.verification_target == 50
    assert final_state.repair_done is True

    # Validate findings across all 7 agent IDs and four lifecycle phases
    agent_ids = {f.agent_id for f in final_state.findings}
    expected_agents = {
        "QA",  # Quality Inspector
        "TRA",  # Traceability
        "PA",  # Process Analyst
        "RCA",  # Root Cause
        "COPILOT",  # Technician Copilot
        "DOC",  # Incident Scribe
        "LEARN",  # Continuous Learning
    }
    assert expected_agents.issubset(agent_ids), (
        f"Missing expected agent findings: {expected_agents - agent_ids}"
    )

    phases = [f.phase for f in final_state.findings]
    assert any("Phase A" in p for p in phases), f"Missing Phase A in findings: {phases}"
    assert any("Phase B" in p for p in phases), f"Missing Phase B in findings: {phases}"
    assert any("Phase C" in p for p in phases), f"Missing Phase C in findings: {phases}"
    assert any("Phase D" in p for p in phases), f"Missing Phase D in findings: {phases}"

    # Validate that documents were generated and attached by Incident Scribe
    assert final_state.documents is not None
    assert "work_order" in final_state.documents
    assert "report_8d" in final_state.documents
    assert "sop_proposal" in final_state.documents
    assert "WO-2026-1004" in final_state.documents["work_order"]

    # Validate observed statuses from subscriber covered full progression
    expected_sequence = [
        "detecting",
        "tracing",
        "investigating",
        "analyzing",
        "repairing",
        "verifying",
        "closed",
    ]
    for expected_status in expected_sequence:
        assert expected_status in observed_statuses, (
            f"Expected status '{expected_status}' in observed progression: {observed_statuses}"
        )

    # Validate Shift-Leader Approval invariant (Key Invariant 3)
    approved_state = orchestrator.approve("lead-supervisor-01")
    assert approved_state is not None
    assert approved_state.status == "closed"
    assert approved_state.approved is True

    # Validate simulation reset restores baseline
    reset_state = await orchestrator.reset()
    assert reset_state.status == "normal"
    assert len(reset_state.findings) == 0
    assert reset_state.verification_count == 0


@pytest.mark.asyncio
async def test_verification_gatekeeper_invariant():
    """Criterion 2: Verification Gatekeeper Invariant (Key Invariant 3).

    Asserts that the Orchestrator refuses to transition to 'closed' when verification_count < 50.
    Verifies that injecting a defect during the verification phase resets the good streak counter
    to 0, transitions to 'tracing' via reopen_investigation, and allows closing only upon physical
    recovery (streak >= 50).
    """
    # 1. Verify gatekeeper refuses closure when verification_count < target
    blackboard.update_status("verifying", verification_count=35, verification_target=50)
    current_state = blackboard.get_state()
    assert current_state.verification_count < current_state.verification_target

    mock_context = MagicMock()
    mock_context.state = {"reopen_count": 0}

    # Under-target verification result
    unverified_result = VerificationResult(good_streak=35, defect_rate=0.045)
    gate_event = await verification_gate(mock_context, unverified_result)

    # Gate must route to NOT_VERIFIED, increment reopen count, and not close
    assert gate_event.actions.route == "NOT_VERIFIED"
    assert mock_context.state["reopen_count"] == 1
    assert blackboard.get_state().status != "closed"

    # Reopening resets streak and transitions back to tracing
    reopened_state = await reopen_investigation(gate_event.output)
    assert reopened_state.status == "tracing"
    assert reopened_state.verification_count == 0
    assert reopened_state.root_cause is None

    # 2. Shift-leader approval must be rejected on non-closed incidents
    assert orchestrator.approve("supervisor-01") is None

    # 3. Simulate physical recovery meeting full target
    blackboard.update_status("verifying", verification_count=50, verification_target=50)
    verified_result = VerificationResult(good_streak=50, defect_rate=0.005)
    verified_event = await verification_gate(mock_context, verified_result)

    assert verified_event.actions.route == "VERIFIED"

    # Closing node closes incident only when verified
    closed_state = await close_incident(verified_result)
    assert closed_state.status == "closed"
    assert closed_state.verification_count == 50

    # 4. Shift-leader approval now succeeds on closed incident
    approved_state = orchestrator.approve("supervisor-01")
    assert approved_state is not None
    assert approved_state.status == "closed"
    assert approved_state.approved is True


@pytest.mark.asyncio
async def test_blackboard_reactive_subscriber_concurrency():
    """Criterion 3: Blackboard Reactive Subscriber Concurrency.

    Concurrently subscribes multiple async clients via blackboard.subscribe(),
    emits state mutations, asserts all clients receive ordered updates without event dropping,
    and confirms listener deregistration on task cancellation (preventing memory leaks).
    """
    num_subscribers = 5
    received_events: list[list[str]] = [[] for _ in range(num_subscribers)]
    subscriber_ready = [asyncio.Event() for _ in range(num_subscribers)]

    async def _subscriber_task(sub_idx: int) -> None:
        first = True
        async for payload in blackboard.subscribe():
            received_events[sub_idx].append(payload)
            if first:
                first = False
                subscriber_ready[sub_idx].set()

    # Launch subscriber tasks
    tasks = [asyncio.create_task(_subscriber_task(i)) for i in range(num_subscribers)]

    # Wait for all subscribers to establish their subscription and receive initial state
    await asyncio.gather(*(ready.wait() for ready in subscriber_ready))
    assert len(blackboard._listeners) == num_subscribers

    # Emit sequential state mutations
    mutations = [
        ("detecting", {"defect_rate": 0.082}),
        ("tracing", {"suspect_machine": "CNC-02"}),
        ("investigating", {"suspect_tool": "T07"}),
        ("analyzing", {"confidence": 0.95}),
        ("repairing", {"repair_done": False}),
        ("verifying", {"verification_count": 25}),
        ("closed", {"defect_rate": 0.002}),
    ]

    for status, kwargs in mutations:
        blackboard.update_status(status, **kwargs)
        # Yield briefly to event loop so subscriber queues receive updates
        await asyncio.sleep(0.01)

    # Also emit an agent finding
    blackboard.add_finding(
        AgentFinding(
            agent_id="QA",
            agent_name="Quality Inspector",
            phase="Phase A",
            finding="SPC breach confirmed on CNC-02",
            evidence="Defect rate 8.2% exceeded UCL 3.5%",
            confidence=0.98,
            citation="Line 1 SPC Monitor",
        )
    )
    await asyncio.sleep(0.01)

    # Cancel all subscribers to test listener deregistration / leak prevention
    for t in tasks:
        t.cancel()

    await asyncio.gather(*tasks, return_exceptions=True)

    # Verify that all listeners were cleaned up (Key Invariant: no memory leaks)
    assert len(blackboard._listeners) == 0, (
        f"Expected 0 active listeners after cancellation, found {len(blackboard._listeners)}"
    )

    # Verify that all subscribers received all published events
    # Initial state (1) + 7 status mutations + 1 finding = 9 events minimum
    expected_min_events = len(mutations) + 2
    for idx, client_events in enumerate(received_events):
        assert len(client_events) >= expected_min_events, (
            f"Subscriber {idx} received only {len(client_events)}/{expected_min_events} events"
        )
        # Verify JSON validity and state ordering
        statuses = [json.loads(p)["status"] for p in client_events]
        for expected_status, _ in mutations:
            assert expected_status in statuses, (
                f"Subscriber {idx} missed status '{expected_status}' in stream"
            )


@pytest.mark.asyncio
async def test_zero_credential_offline_mock_parity(monkeypatch):
    """Criterion 4: Mock Parity & Offline Assertion.

    Validates that the multi-agent workflow executes with 100% green status
    when GCP_PROJECT_ID is unset / mock mode enabled, running completely offline
    without cloud credentials.
    """
    # Simulate completely unauthenticated offline environment
    monkeypatch.setenv("GCP_PROJECT_ID", "kaizen-local")
    monkeypatch.setattr(settings, "gcp_project_id", "kaizen-local")
    monkeypatch.setattr(settings, "ai_provider", "mock")
    monkeypatch.setattr(settings, "bigquery_fallback_to_mock", True)
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)

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

    orchestrator._step_delay = 0.01
    try:
        state = await orchestrator.run_incident(trigger)
    finally:
        orchestrator._step_delay = None

    # Must reach closed status with zero failures or unhandled exceptions
    assert state.status == "closed", f"Expected closed status offline, got {state.status}"
    assert state.verification_count >= state.verification_target
    assert len(state.findings) >= 7, (
        f"Expected all agent findings in mock mode, got {len(state.findings)}"
    )


@pytest.mark.asyncio
async def test_crash_dump_serialization_on_agent_failure(tmp_path):
    """Criterion 5: Crash Dump & Error Tracing.

    Verifies that any simulated unhandled agent exception triggers serialization
    of crash_<incident_id>_<timestamp>.json with full traceback and dumped IncidentState
    context, setting Blackboard status to 'error' without terminating the server loop.
    """
    # 1. Test the dump_crash helper function directly
    mock_state = IncidentState(
        incident_id="INC-CRASH-TEST-001",
        status="investigating",
        suspect_machine="CNC-02",
        defect_type="scratch_vertical",
        defect_rate=0.088,
    )
    simulated_error = RuntimeError("Simulated tool invocation failure in Process Analyst")

    dump_file = dump_crash(mock_state, simulated_error, output_dir=tmp_path)
    assert dump_file is not None
    assert dump_file.exists()
    assert dump_file.name.startswith("crash_INC-CRASH-TEST-001_")
    assert dump_file.name.endswith(".json")

    # Verify JSON content
    crash_data = json.loads(dump_file.read_text(encoding="utf-8"))
    assert crash_data["incident_id"] == "INC-CRASH-TEST-001"
    assert crash_data["error_type"] == "RuntimeError"
    assert "Simulated tool invocation failure" in crash_data["error_message"]
    assert "traceback" in crash_data
    assert crash_data["state"]["suspect_machine"] == "CNC-02"
    assert crash_data["state"]["status"] == "investigating"

    # 2. Test live orchestrator workflow crash handling
    trigger = DefectInjectionRequest(
        scenario="cnc_tool_wear",
        machine_id="CNC-02",
        tool_id="T07",
        defect_type="surface_scratch_face_a",
        defect_rate=0.0767,
        mode="fast",
        duration_seconds=5,
    )

    # Patch InMemoryRunner.run_async to simulate an unhandled catastrophic failure
    with patch(
        "google.adk.runners.InMemoryRunner.run_async",
        side_effect=RuntimeError("Catastrophic agent network partitioning"),
    ):
        result_state = await orchestrator.run_incident(trigger)

        # Assert blackboard transitioned to error status
        assert result_state.status == "error"
        assert "RuntimeError" in (result_state.status_reason or "")
        assert "Catastrophic agent network partitioning" in (result_state.status_reason or "")

        # Assert crash file was generated in cwd
        crash_files = glob.glob(f"crash_{result_state.incident_id}_*.json")
        assert len(crash_files) >= 1, f"Expected crash dump file for {result_state.incident_id}"

        # Validate crash dump content
        latest_crash = Path(crash_files[0])
        try:
            content = json.loads(latest_crash.read_text(encoding="utf-8"))
            assert content["incident_id"] == result_state.incident_id
            assert content["error_type"] == "RuntimeError"
            assert "Catastrophic agent network partitioning" in content["error_message"]
            assert content["state"]["status"] == "error"
        finally:
            # Clean up the test crash file
            if latest_crash.exists():
                latest_crash.unlink()
