"""Approved-incident knowledge write-back into the RAG knowledge base (#334).

On shift-leader approval the Orchestrator persists the incident resolution as a
searchable knowledge entry:

- ``data/knowledge_base/learned/<incident_id>.md`` markdown entry (defect, root
  cause, evidence, repair, SOP change, impact, incident id/date);
- GCP mode: a ``gs://<kb bucket>/kb/learned__<incident_id>.txt`` blob plus a
  Vertex AI Search (Discovery Engine) incremental import of that one object,
  mirroring ``scripts/import_knowledge_base.py``;
- dev/mock mode (no GCP project): the local file only, with the local BM25
  index rebuilt so the entry is searchable without a restart.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from pathlib import Path

from backend.core.config import settings
from backend.core.models import IncidentState
from backend.tools.rag_search_tool import DEFAULT_KNOWLEDGE_DIR, reindex_local_knowledge

logger = logging.getLogger(__name__)

# Local entry folder (indexed by LocalBM25Retriever via data/knowledge_base/**/*.md).
LEARNED_DIRNAME = "learned"
# Blob namespace: kb/learned__<incident_id>.txt. kb:import reconciliation never
# deletes blobs under this marker (scripts/import_knowledge_base.py keeps them).
LEARNED_BLOB_PREFIX = "kb/learned__"
# Discovery Engine import operations can take a while even for one document.
IMPORT_TIMEOUT_SECONDS = 1800


def learned_blob_name(incident_id: str) -> str:
    """GCS blob name for an approved incident's learned entry."""
    return f"{LEARNED_BLOB_PREFIX}{incident_id}.txt"


def learned_entry_path(incident_id: str, kb_root: Path = DEFAULT_KNOWLEDGE_DIR) -> Path:
    """Local markdown path for an approved incident's learned entry."""
    return kb_root / LEARNED_DIRNAME / f"{incident_id}.md"


def _cloud_configured() -> bool:
    """True when a real GCP project (not the kaizen-local dev default) is configured."""
    return bool(settings.kb_gcs_bucket) and settings.gcp_project_id not in ("", "kaizen-local")


def _incident_date(state: IncidentState) -> str:
    """ISO date (YYYY-MM-DD) of closure, falling back to the board update time."""
    return (state.closed_at or "")[:10] or (state.updated_at or "")[:10]


def _defect_lines(state: IncidentState) -> list[str]:
    machine = state.suspect_machine or "unidentified machine"
    tool = f" (tool {state.suspect_tool})" if state.suspect_tool else ""
    return [
        f"- Defect: {state.defect_type or 'unclassified defect'} on {machine}{tool}",
        f"- Defect rate at breach: {state.defect_rate:.1%} vs SPC UCL {state.spc_ucl:.1%}",
        f"- Severity: {state.severity}",
    ]


def _root_cause_lines(state: IncidentState) -> list[str]:
    return [state.root_cause or "Root cause not recorded on the Blackboard."]


def _evidence_lines(state: IncidentState) -> list[str]:
    lines = [
        f"- {f.phase} ({f.agent_name}): {f.finding} — {f.evidence} "
        f"(confidence {f.confidence:.2f}; {f.citation})"
        for f in state.findings
    ]
    return lines or ["- No agent findings recorded."]


def _repair_lines(state: IncidentState) -> list[str]:
    lines = [
        f"- Repair confirmed by technician: {'yes' if state.repair_done else 'no'}",
        f"- Post-repair verification: {state.verification_count}/{state.verification_target} "
        "consecutive defect-free parts",
    ]
    work_order = state.documents.get("work_order")
    if isinstance(work_order, dict) and work_order:
        lines.append(
            f"- Work order {work_order.get('work_order_id')}: {work_order.get('title')} — "
            f"{work_order.get('description')}"
        )
    return lines


def _sop_lines(state: IncidentState) -> list[str]:
    sop = state.documents.get("sop_proposal")
    if not isinstance(sop, dict) or not sop:
        return ["- No SOP change proposed."]
    return [
        f"- {sop.get('sop_id')} — {sop.get('title')}",
        f"- Current procedure: {sop.get('current_procedure')}",
        f"- Proposed revision: {sop.get('proposed_revision')}",
    ]


def _impact_lines(state: IncidentState) -> list[str]:
    impact = state.impact
    if impact is None:
        return ["- No sustainability impact metrics recorded."]
    return [
        f"- Scrap avoided: {impact.scrap_avoided} parts",
        f"- Downtime prevented: {impact.downtime_minutes} minutes",
        f"- Energy conserved: {impact.energy_kwh:.1f} kWh",
        f"- CO2 avoided: {impact.co2_kg:.1f} kg "
        f"(energy {impact.energy_co2_kg:.1f} kg, material {impact.material_co2_kg:.1f} kg)",
        f"- Cost savings: ${impact.cost_savings_usd:,.0f}",
    ]


def render_learning_markdown(state: IncidentState) -> str:
    """Renders the approved incident as a searchable knowledge-base markdown entry."""
    machine = state.suspect_machine or "unidentified machine"
    defect = state.defect_type or "unclassified defect"
    date = _incident_date(state)

    frontmatter = [
        "---",
        f'title: "Learned resolution {state.incident_id} - {defect} on {machine}"',
        "category: learned",
    ]
    if state.suspect_machine:
        frontmatter.append(f"machines: [{state.suspect_machine}]")
    if state.suspect_tool:
        frontmatter.append(f"component: {state.suspect_tool}")
    if date:
        frontmatter.append(f"last_revised: {date}")
    frontmatter.extend(["---", ""])

    incident_lines = [
        f"- Incident ID: {state.incident_id}",
        f"- Opened: {state.opened_at or 'not recorded'}",
        f"- Closed: {state.closed_at or 'not recorded'}",
        f"- Approved by: {state.approved_by or 'shift leader'}"
        + (f" at {state.approved_at}" if state.approved_at else ""),
        f"- Line: {state.line_id}; product: {state.product}",
    ]

    sections = (
        [f"# Learned Resolution {state.incident_id} - {defect} on {machine}", ""]
        + ["## Incident", ""]
        + incident_lines
        + ["", "## Defect", ""]
        + _defect_lines(state)
        + ["", "## Root Cause", ""]
        + _root_cause_lines(state)
        + ["", "## Evidence", ""]
        + _evidence_lines(state)
        + ["", "## Repair", ""]
        + _repair_lines(state)
        + ["", "## SOP Change", ""]
        + _sop_lines(state)
        + ["", "## Impact", ""]
        + _impact_lines(state)
        + [""]
    )
    return "\n".join(frontmatter + sections)


def _upload_and_import(path: Path, incident_id: str) -> None:
    """Uploads the learned entry to the kb bucket and incrementally imports it."""
    from google.cloud import discoveryengine_v1 as discoveryengine
    from google.cloud import storage

    blob_name = learned_blob_name(incident_id)
    bucket = storage.Client(project=settings.gcp_project_id).bucket(settings.kb_gcs_bucket)
    bucket.blob(blob_name).upload_from_filename(str(path), content_type="text/plain")
    logger.info("learning write-back: uploaded gs://%s/%s", settings.kb_gcs_bucket, blob_name)

    client_options = (
        None
        if settings.vertex_search_location == "global"
        else {"api_endpoint": f"{settings.vertex_search_location}-discoveryengine.googleapis.com"}
    )
    client = discoveryengine.DocumentServiceClient(client_options=client_options)
    parent = client.branch_path(
        settings.gcp_project_id,
        settings.vertex_search_location,
        settings.vertex_search_datastore_id,
        "default_branch",
    )
    request = discoveryengine.ImportDocumentsRequest(
        parent=parent,
        gcs_source=discoveryengine.GcsSource(
            input_uris=[f"gs://{settings.kb_gcs_bucket}/{blob_name}"],
            data_schema="content",
        ),
        # INCREMENTAL: adds/updates this one document, never reconciles the datastore.
        reconciliation_mode=(
            discoveryengine.ImportDocumentsRequest.ReconciliationMode.INCREMENTAL
        ),
    )
    logger.info("learning write-back: importing gs://%s/%s into %s", settings.kb_gcs_bucket, blob_name, parent)
    operation = client.import_documents(request=request)
    response = operation.result(timeout=IMPORT_TIMEOUT_SECONDS)
    for sample in response.error_samples or []:
        logger.error("learning write-back import error: %s", sample.message)
    metadata = operation.metadata
    logger.info(
        "learning write-back import finished: success=%s failure=%s",
        getattr(metadata, "success_count", None),
        getattr(metadata, "failure_count", None),
    )


def write_back_learning(state: IncidentState, kb_root: Path | None = None) -> Path:
    """Writes the approved incident's learned entry and syncs it into the RAG index.

    GCP mode uploads the entry and triggers an incremental Vertex AI Search import;
    dev/mock mode reindexes the local BM25 retriever instead. Returns the written
    markdown path.
    """
    root = kb_root or DEFAULT_KNOWLEDGE_DIR
    path = learned_entry_path(state.incident_id, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_learning_markdown(state), encoding="utf-8")
    logger.info("learning write-back: wrote %s", path)

    if _cloud_configured():
        _upload_and_import(path, state.incident_id)
    else:
        logger.info(
            "learning write-back: no GCP project configured (gcp_project_id=%s); "
            "skipping cloud upload/import, reindexing local BM25 only",
            settings.gcp_project_id,
        )
        reindex_local_knowledge()
    return path


def _run_write_back(state: IncidentState) -> None:
    """Background wrapper: one failed write-back never surfaces to the approver."""
    try:
        write_back_learning(state)
    except Exception:
        logger.exception("learning write-back failed for %s", state.incident_id)


def schedule_learning_writeback(state: IncidentState) -> asyncio.Task | threading.Thread:
    """Runs the RAG write-back off the caller's loop/thread so approve() stays responsive.

    With a running asyncio loop (API routes dispatched from async contexts) the
    write-back runs as a thread-pool task; from a sync caller it runs on a
    daemon thread. Returns the started handle (awaitable task or joinable
    thread) for callers that need determinism, e.g. tests.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is not None and loop.is_running():
        return loop.create_task(asyncio.to_thread(_run_write_back, state))
    thread = threading.Thread(
        target=_run_write_back, args=(state,), name="learning-writeback", daemon=True
    )
    thread.start()
    return thread
