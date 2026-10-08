"""Traceability Agent: queries discrete line topology, performs cross-cohort elimination, and isolates suspects."""

from __future__ import annotations

import asyncio
import csv
import logging
from pathlib import Path

from google.adk import Agent

from backend.core.models import (
    FactorDistribution,
    FindingDraft,
    SuspectCorrelation,
    TraceabilityTopologyResponse,
)
from backend.tools.bigquery_tool import query_traceability_topology

logger = logging.getLogger(__name__)

AGENT_ID = "TRA"
AGENT_NAME = "Traceability Agent"
PHASE = "Phase B - Tracing"
CITATION = "BigQuery manufacturing.traceability cross-lot correlation"

INSTRUCTION = (
    "You are the Traceability Agent of the Kaizen Agent manufacturing incident team. "
    "The user message is JSON with two keys: 'board' (the current incident board) and "
    "'traceability' (the discrete line topology report from BigQuery: 'suspects', 'excluded_factors', "
    "'factor_distributions'). "
    "Write one finding that isolates the primary suspect machine (machine_id) and tool (tool_id) "
    "from 'traceability.suspects' (the pair with the highest correlation_score and defect_count) "
    "and specifies the excluded non-causal factors from 'traceability.excluded_factors' "
    "(such as raw material lots or operators ruled out across normal concurrent machines). "
    "The evidence must quote the suspect machine, tool, defect count, total parts, and the ruled-out factors. "
    "Set confidence to the top suspect's correlation_score (or 0.95 if correlation_score >= 0.7). "
    "Build the citation as 'BigQuery manufacturing.traceability cross-lot correlation'. Respond in English."
)

agent = Agent(
    name="traceability",
    description="Isolates the suspect machine and tool from discrete line topology while excluding innocent factors.",
    instruction=INSTRUCTION,
    output_schema=FindingDraft,
)


def _default_csv_path() -> Path:
    root = Path(__file__).resolve().parent.parent.parent
    candidate = root / "data" / "datasets" / "mock_traceability.csv"
    if candidate.exists():
        return candidate
    return Path("data/datasets/mock_traceability.csv")


def load_mock_traceability(
    time_window: str | None = None,
    product_ids: list[str] | None = None,
    csv_path: Path | str | None = None,
) -> TraceabilityTopologyResponse:
    """Loads and correlates discrete manufacturing events from local mock CSV."""
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
        # Check if lot was processed on machines that had 0 defects
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


async def trace_line_topology(
    time_window: str | None = "09:30-10:00",
    start_time: str | None = None,
    end_time: str | None = None,
    product_ids: list[str] | None = None,
) -> TraceabilityTopologyResponse:
    """Queries discrete manufacturing topology; seamlessly falls back to mock CSV when BigQuery is offline."""
    try:
        return await asyncio.to_thread(
            query_traceability_topology,
            time_window=time_window,
            start_time=start_time,
            end_time=end_time,
            product_ids=product_ids,
        )
    except Exception as exc:
        logger.warning(
            "BigQuery traceability query unavailable (%s); falling back to mock dataset",
            exc,
        )
        return load_mock_traceability(time_window=time_window, product_ids=product_ids)


def build_finding_from_report(report: TraceabilityTopologyResponse) -> FindingDraft:
    """Builds a deterministic 4-part finding draft from a topology report."""
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
