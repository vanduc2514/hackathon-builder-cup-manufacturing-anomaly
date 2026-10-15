"""Unit tests for the reactive blackboard and state transitions."""

from __future__ import annotations

import asyncio
import json

from backend.core.blackboard import Blackboard
from backend.core.models import AgentFinding, HandoverNote


def test_blackboard_finding_addition():
    bb = Blackboard()
    finding = AgentFinding(
        agent_id="TRACE",
        agent_name="Traceability Agent",
        phase="Phase B - Root Cause",
        finding="Defects strongly correlate with machine CNC-02.",
        evidence="18 of 20 defects produced on CNC-02 tool T07.",
        confidence=0.91,
        citation="BigQuery Discrete Event Traceability",
    )
    bb.add_finding(finding)

    state = bb.get_state()
    assert len(state.findings) == 1
    assert state.findings[0].agent_id == "TRACE"
    assert state.findings[0].confidence == 0.91


def test_blackboard_status_transition():
    bb = Blackboard()
    bb.update_status(
        "investigating",
        suspect_machine="CNC-02",
        suspect_tool="T07",
    )
    state = bb.get_state()
    assert state.status == "investigating"
    assert state.suspect_machine == "CNC-02"
    assert state.suspect_tool == "T07"


def test_blackboard_set_repair_done():
    bb = Blackboard()
    assert bb.get_state().repair_done is False
    bb.set_repair_done(True)
    assert bb.get_state().repair_done is True


def test_blackboard_timestamps_stamped_on_transition():
    bb = Blackboard()
    assert bb.get_state().opened_at is None
    assert bb.get_state().closed_at is None

    # Transitioning to investigating stamps opened_at
    bb.update_status("investigating", incident_id="INC-0412", suspect_machine="CNC-02")
    state = bb.get_state()
    assert state.opened_at is not None
    assert state.closed_at is None

    # Transitioning to closed stamps closed_at
    bb.update_status("closed")
    state = bb.get_state()
    assert state.closed_at is not None


def test_blackboard_list_incidents_in_memory_fallback():
    bb = Blackboard()
    bb.update_status("investigating", incident_id="INC-001", defect_type="scratch")
    bb.update_status("closed", verification_count=50)

    # Reset clears current state, but preserves in history
    bb.reset()
    assert bb.get_state().status == "normal"

    # Now add another incident
    bb.update_status("detecting", incident_id="INC-002", defect_type="burn_mark")

    # List all incidents
    all_incidents = bb.list_incidents(limit=10)
    assert len(all_incidents) >= 2
    ids = [i.incident_id for i in all_incidents]
    assert "INC-001" in ids
    assert "INC-002" in ids

    # Filter by status
    closed_only = bb.list_incidents(status="closed")
    assert all(i.status == "closed" for i in closed_only)
    assert any(i.incident_id == "INC-001" for i in closed_only)


def test_blackboard_add_handover_note():
    bb = Blackboard()
    note1 = HandoverNote(author="Technician Jane", note="Tool insert replaced on CNC-02.")
    note2 = HandoverNote(author="Shift Lead Bob", note="Verification batch running smoothly.")

    listener_queue = asyncio.Queue()
    bb._listeners.append(listener_queue)

    try:
        bb.add_handover_note(note1)
        bb.add_handover_note(note2)

        state = bb.get_state()
        assert len(state.handover_notes) == 2
        assert state.handover_notes[0].author == "Technician Jane"
        assert state.handover_notes[0].note == "Tool insert replaced on CNC-02."
        assert state.handover_notes[1].author == "Shift Lead Bob"
        assert state.handover_notes[1].note == "Verification batch running smoothly."

        # Verify event notifications were queued
        assert listener_queue.qsize() == 2
        payload1 = json.loads(listener_queue.get_nowait())
        assert len(payload1.get("handover_notes", [])) == 1
        payload2 = json.loads(listener_queue.get_nowait())
        assert len(payload2.get("handover_notes", [])) == 2
    finally:
        if listener_queue in bb._listeners:
            bb._listeners.remove(listener_queue)



