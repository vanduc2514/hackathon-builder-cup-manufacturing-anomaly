from __future__ import annotations
"""Unit tests for core Pydantic models."""

import pytest
from backend.core.models import AgentFinding, IncidentState, ImpactMetrics


def test_agent_finding_schema():
    finding = AgentFinding(
        agent_id="QUALITY",
        agent_name="Quality Inspector",
        phase="Phase A - Detection",
        finding="Defect rate breached Upper Control Limit (UCL 0.05).",
        evidence="Observed rate 0.082 across 100 parts window.",
        confidence=0.96,
        citation="SPC Engine v1.2",
    )
    assert finding.agent_id == "QUALITY"
    assert finding.confidence == 0.96
    assert finding.citation == "SPC Engine v1.2"


def test_incident_state_lifecycle():
    state = IncidentState(
        incident_id="INC-TEST-001",
        status="investigating",
        defect_rate=0.075,
        verification_count=0,
        verification_target=50,
    )
    assert state.status == "investigating"
    assert state.verification_target == 50
    assert len(state.findings) == 0


def test_impact_metrics():
    impact = ImpactMetrics(
        scrap_avoided=120,
        downtime_minutes=30,
        energy_kwh=22.5,
        co2_kg=15.0,
    )
    assert impact.scrap_avoided == 120
    assert impact.co2_kg == 15.0
