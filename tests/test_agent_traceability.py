"""Unit and integration tests for Traceability Agent: discrete line topology, cross-cohort elimination, and mock fallback."""

from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from backend.agents.agent_traceability import (
    CITATION,
    build_finding_from_report,
    load_mock_traceability,
    trace_line_topology,
)
from backend.agents.workflow_nodes import record_traceability, trace_topology
from backend.core.blackboard import blackboard
from backend.core.models import (
    FindingDraft,
    SuspectCorrelation,
    TraceabilityTopologyResponse,
)


@pytest.fixture(autouse=True)
def clean_blackboard():
    blackboard.reset()
    yield
    blackboard.reset()


def test_load_mock_traceability_csv():
    """Verifies mock CSV loading, machine-tool correlation scoring, and factor elimination."""
    report = load_mock_traceability()
    assert report.source == "mock_csv"
    assert len(report.suspects) >= 1

    top = report.suspects[0]
    assert top.machine_id == "CNC-02"
    assert top.tool_id == "T07"
    assert top.defect_count == 3
    assert top.total_parts == 4
    assert top.correlation_score >= 0.75

    # Concurrent machines CNC-01 and CNC-03 should have 0 defects
    normal_machines = {
        s.machine_id: s.defect_count for s in report.suspects if s.machine_id != "CNC-02"
    }
    for m_id, d_cnt in normal_machines.items():
        assert d_cnt == 0, f"Expected 0 defects for normal machine {m_id}, got {d_cnt}"

    # Cross-lot elimination: lot AL-5083-B4 processed on CNC-01 and CNC-03 with 0 defects
    assert any(
        "AL-5083-B4" in factor and "raw material excluded" in factor
        for factor in report.excluded_factors
    )

    # Operator elimination: OP-12 and OP-08 should be in excluded factors
    assert any("OP-12" in factor for factor in report.excluded_factors)
    assert any("OP-08" in factor for factor in report.excluded_factors)


def test_load_mock_traceability_filter_product_ids():
    """Verifies filtering by specific defective product IDs."""
    report = load_mock_traceability(product_ids=["PRD-1004", "PRD-1005"])
    assert len(report.suspects) == 1
    top = report.suspects[0]
    assert top.machine_id == "CNC-02"
    assert top.tool_id == "T07"
    assert top.total_parts == 2
    assert top.defect_count == 2


def test_load_mock_traceability_filter_time_window():
    """Verifies filtering by defect time window."""
    report = load_mock_traceability(time_window="09:40-09:45")
    assert report.time_window == "09:40-09:45"
    assert len(report.suspects) >= 1
    top = report.suspects[0]
    assert top.machine_id == "CNC-02"
    assert top.tool_id == "T07"


def test_load_mock_traceability_missing_file():
    """Verifies robust handling when CSV file does not exist."""
    report = load_mock_traceability(csv_path=Path("/tmp/nonexistent_traceability_data.csv"))
    assert report.source == "mock_csv"
    assert report.suspects == []
    assert report.excluded_factors == []


def test_trace_line_topology_fallback_on_bigquery_error():
    """Verifies seamless fallback to mock CSV when BigQuery / emulator query fails."""
    with patch(
        "backend.agents.agent_traceability.query_traceability_topology",
        side_effect=RuntimeError("BigQuery connection refused"),
    ):
        report = asyncio.run(trace_line_topology())
        assert report.source == "mock_csv"
        assert report.suspects[0].machine_id == "CNC-02"
        assert report.suspects[0].tool_id == "T07"


def test_trace_line_topology_uses_live_bigquery():
    """Verifies that live BigQuery results are returned directly when available."""
    mock_response = TraceabilityTopologyResponse(
        source="bigquery_emulator",
        suspects=[
            SuspectCorrelation(
                machine_id="CNC-02",
                tool_id="T07",
                correlation_score=0.95,
                defect_count=3,
                total_parts=4,
                sample_ratio=0.75,
            )
        ],
        excluded_factors=["lot_id: AL-5083-B4 (normal distribution)"],
    )
    with patch(
        "backend.agents.agent_traceability.query_traceability_topology",
        return_value=mock_response,
    ):
        report = asyncio.run(trace_line_topology())
        assert report.source == "bigquery_emulator"
        assert report.suspects[0].machine_id == "CNC-02"
        assert report.suspects[0].correlation_score == 0.95


def test_build_finding_from_report():
    """Verifies deterministic 4-part finding draft synthesis."""
    report = load_mock_traceability()
    draft = build_finding_from_report(report)

    assert isinstance(draft, FindingDraft)
    assert "CNC-02" in draft.finding
    assert "T07" in draft.finding
    assert draft.confidence == 0.95
    assert draft.citation == CITATION
    assert "parts defective" in draft.evidence
    assert "AL-5083-B4" in draft.evidence


def test_trace_topology_workflow_node():
    """Verifies workflow node queries topology, records in state, and formats prompt payload."""
    ctx = MagicMock()
    ctx.state = {
        "qi_report": {
            "defect_frames": [
                {"product_id": "PRD-1004"},
                {"product_id": "PRD-1005"},
            ]
        },
        "trigger": {"time_window": "09:30-10:00"},
    }

    result = asyncio.run(trace_topology(ctx, {}))
    assert "board" in result
    assert "traceability" in result
    assert "traceability_report" in ctx.state
    assert ctx.state["traceability_report"]["suspects"][0]["machine_id"] == "CNC-02"


def test_record_traceability_workflow_node():
    """Verifies record_traceability writes finding and sets suspect machine/tool on blackboard."""
    ctx = MagicMock()
    ctx.state = {
        "traceability_report": {
            "suspects": [{"machine_id": "CNC-02", "tool_id": "T07", "correlation_score": 0.95}]
        }
    }
    draft = FindingDraft(
        finding="Primary suspect isolated to CNC-02 / T07",
        evidence="3 of 4 parts defective",
        confidence=0.95,
        citation=CITATION,
    )

    state = asyncio.run(record_traceability(ctx, draft))
    assert state.status == "investigating"
    assert state.suspect_machine == "CNC-02"
    assert state.suspect_tool == "T07"
    assert len(state.findings) == 1
    assert state.findings[0].agent_id == "TRA"
    assert state.findings[0].citation == CITATION
