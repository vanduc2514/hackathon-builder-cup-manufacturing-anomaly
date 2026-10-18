"""Unit and integration tests for Traceability Agent: discrete line topology, cross-cohort elimination, and mock datasets."""

from __future__ import annotations

import asyncio
import csv
import logging
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from backend.agents.agent_traceability import (
    AGENT_ID,
    AGENT_NAME,
    CITATION,
    PHASE,
    agent,
    trace_line_topology,
)
from backend.agents.workflow_nodes import record_traceability, trace_topology
from backend.core.blackboard import blackboard
from backend.core.models import (
    FactorDistribution,
    FindingDraft,
    SuspectCorrelation,
    TraceabilityTopologyResponse,
)

logger = logging.getLogger(__name__)


def _default_csv_path() -> Path:
    root = Path(__file__).resolve().parent.parent
    candidate = root / "data" / "datasets" / "mock_traceability.csv"
    if candidate.exists():
        return candidate
    return Path("data/datasets/mock_traceability.csv")


def load_mock_traceability(
    time_window: str | None = None,
    product_ids: list[str] | None = None,
    csv_path: Path | str | None = None,
) -> TraceabilityTopologyResponse:
    """Loads and correlates discrete manufacturing events from local mock CSV for testing."""
    target_path = Path(csv_path) if csv_path else _default_csv_path()
    if not target_path.exists():
        logger.warning(
            "Mock traceability CSV not found at %s; returning empty topology", target_path
        )
        return TraceabilityTopologyResponse(
            source="mock_csv",
            suspects=[],
            excluded_factors=[],
            factor_distributions=[],
            time_window=time_window,
        )

    with target_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        all_rows = list(reader)

    rows = all_rows
    if product_ids:
        filtered = [r for r in all_rows if r.get("product_id") in product_ids]
        if filtered:
            rows = filtered

    if time_window and "-" in time_window and len(rows) == len(all_rows):
        parts = time_window.split("-")
        if len(parts) == 2 and ":" in parts[0] and ":" in parts[1]:
            filtered_by_time = []
            for r in rows:
                ts = r.get("timestamp", "")
                if "T" in ts:
                    time_part = ts.split("T")[1][:5]
                    if parts[0] <= time_part <= parts[1]:
                        filtered_by_time.append(r)
            if filtered_by_time:
                rows = filtered_by_time

    total_inspected = len(rows)
    total_defects = sum(1 for r in rows if r.get("status", "").startswith("DEFECT"))

    # Group by machine_id and tool_id
    mt_groups: dict[tuple[str, str], list[dict[str, str]]] = {}
    for r in rows:
        key = (r.get("machine_id", "unknown"), r.get("tool_id", "unknown"))
        mt_groups.setdefault(key, []).append(r)

    suspects: list[SuspectCorrelation] = []
    for (m_id, t_id), items in mt_groups.items():
        cnt = len(items)
        d_cnt = sum(1 for it in items if it.get("status", "").startswith("DEFECT"))
        ratio = d_cnt / cnt if cnt > 0 else 0.0
        if total_defects > 0 and d_cnt == total_defects and ratio >= 0.7:
            score = 0.95
        else:
            score = round(ratio, 2)
        suspects.append(
            SuspectCorrelation(
                machine_id=m_id,
                tool_id=t_id,
                correlation_score=score,
                defect_count=d_cnt,
                total_parts=cnt,
                sample_ratio=round(cnt / total_inspected, 2) if total_inspected > 0 else 0.0,
            )
        )
    suspects.sort(key=lambda s: (s.correlation_score, s.defect_count, s.total_parts), reverse=True)

    # Multi-factor population analysis across lot_id and operator_id
    factor_distributions: list[FactorDistribution] = []
    excluded_factors: list[str] = []

    # lot_id analysis
    lot_groups: dict[str, list[dict[str, str]]] = {}
    for r in rows:
        lot = r.get("lot_id", "unknown")
        lot_groups.setdefault(lot, []).append(r)

    for lot, items in lot_groups.items():
        cnt = len(items)
        d_cnt = sum(1 for it in items if it.get("status", "").startswith("DEFECT"))
        ratio = d_cnt / cnt if cnt > 0 else 0.0
        machines_with_zero_defects = {
            r.get("machine_id", "")
            for r in items
            if all(
                not other.get("status", "").startswith("DEFECT")
                for other in items
                if other.get("machine_id") == r.get("machine_id")
            )
        }
        machines_with_zero_defects.discard("")
        is_anomalous = ratio >= 0.8 and d_cnt > 2 and not machines_with_zero_defects
        factor_distributions.append(
            FactorDistribution(
                factor_type="lot_id",
                factor_value=lot,
                defect_count=d_cnt,
                total_parts=cnt,
                defect_ratio=round(ratio, 2),
                is_anomalous=is_anomalous,
            )
        )
        if machines_with_zero_defects:
            m_list = ", ".join(sorted(machines_with_zero_defects))
            excluded_factors.append(
                f"lot_id: {lot} (processed on {m_list} with 0 defects; raw material excluded)"
            )
        elif not is_anomalous:
            excluded_factors.append(f"lot_id: {lot} (normal distribution across line)")

    # operator_id analysis
    op_groups: dict[str, list[dict[str, str]]] = {}
    for r in rows:
        op = r.get("operator_id", "unknown")
        op_groups.setdefault(op, []).append(r)

    for op, items in op_groups.items():
        cnt = len(items)
        d_cnt = sum(1 for it in items if it.get("status", "").startswith("DEFECT"))
        ratio = d_cnt / cnt if cnt > 0 else 0.0
        is_anomalous = ratio >= 0.8 and d_cnt > 2
        factor_distributions.append(
            FactorDistribution(
                factor_type="operator_id",
                factor_value=op,
                defect_count=d_cnt,
                total_parts=cnt,
                defect_ratio=round(ratio, 2),
                is_anomalous=is_anomalous,
            )
        )
        if d_cnt == 0:
            excluded_factors.append(
                f"operator_id: {op} (0 defects across normal production; operator excluded)"
            )
        elif not is_anomalous:
            excluded_factors.append(f"operator_id: {op} (normal distribution across line)")

    return TraceabilityTopologyResponse(
        source="mock_csv",
        suspects=suspects,
        excluded_factors=excluded_factors,
        factor_distributions=factor_distributions,
        time_window=time_window,
    )


def build_finding_from_report(report: TraceabilityTopologyResponse) -> FindingDraft:
    """Builds a deterministic 4-part finding draft from a topology report (test fixture)."""
    if not report.suspects:
        return FindingDraft(
            finding="No suspect machine or tool isolated from discrete line traceability.",
            evidence="Topology query returned 0 suspect correlations across inspected parts.",
            confidence=0.5,
            citation=CITATION,
        )
    top = report.suspects[0]
    excluded_summary = (
        "; ".join(report.excluded_factors[:2])
        if report.excluded_factors
        else "no factors ruled out"
    )
    finding = (
        f"Primary suspect isolated to {top.machine_id} with tool {top.tool_id} "
        f"(correlation score {top.correlation_score:.2f})."
    )
    evidence = (
        f"{top.defect_count} of {top.total_parts} parts defective on {top.machine_id} with tool "
        f"{top.tool_id}. Cross-cohort analysis excluded: {excluded_summary}."
    )
    confidence = min(1.0, max(0.0, top.correlation_score if top.correlation_score >= 0.7 else 0.95))
    return FindingDraft(
        finding=finding,
        evidence=evidence,
        confidence=confidence,
        citation=CITATION,
    )


@pytest.fixture(autouse=True)
def clean_blackboard():
    blackboard.reset()
    yield
    blackboard.reset()


def test_agent_traceability_adk_definition():
    """Verifies Traceability ADK Agent configuration and metadata."""
    assert agent.name == "traceability"
    assert AGENT_ID == "TRA"
    assert AGENT_NAME == "Traceability Agent"
    assert PHASE == "Phase B - Tracing"
    assert agent.output_schema is FindingDraft


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


def test_trace_line_topology_error_propagation_on_bigquery_error():
    """Verifies error propagation when BigQuery / emulator query fails."""
    with patch(
        "backend.agents.agent_traceability.query_traceability_topology",
        side_effect=RuntimeError("BigQuery connection refused"),
    ):
        with pytest.raises(RuntimeError, match="BigQuery connection refused"):
            asyncio.run(trace_line_topology())


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
    ctx.state = {"trigger": {}}
    blackboard.reset()
    blackboard.update_status("detecting", opened_at="2026-10-18T07:00:00+00:00")

    mock_report = load_mock_traceability(product_ids=["PRD-1004", "PRD-1005"])
    with patch(
        "backend.agents.agent_traceability.query_traceability_topology",
        return_value=mock_report,
    ) as query:
        result = asyncio.run(trace_topology(ctx, {}))
        # Incident-scoped window: from opened_at minus the lookback, no fixed clock range.
        assert query.call_args.kwargs["time_window"] is None
        assert query.call_args.kwargs["start_time"].startswith("2026-10-18T06:00:00")
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
