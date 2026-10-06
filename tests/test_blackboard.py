from __future__ import annotations
"""Unit tests for the reactive blackboard and state transitions."""

import pytest
from backend.core.blackboard import Blackboard
from backend.core.models import AgentFinding


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
