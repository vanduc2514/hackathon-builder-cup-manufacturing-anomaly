"""Document export (issue #333): approved incident documents rendered to Markdown.

On shift-leader approval the four documents (work order, 8D report, SOP proposal,
impact card) are rendered to Markdown and written to
``gs://<documents_bucket>/incidents/<incident_id>/``. Outside production (dev and
mock runs) the same files are written to ``artifacts/documents/<incident_id>/``
instead so no GCS credentials are needed. The export runs off the approval path
(``schedule_documents_export``): a failure logs a warning and lands on the
blackboard (``documents_exported`` / ``documents_export_error``) without failing
the approval itself.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Literal, Optional

from google.cloud import storage

from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import (
    IncidentDocumentLink,
    IncidentDocumentsExportResult,
    IncidentDocumentsResponse,
    IncidentState,
)

logger = logging.getLogger(__name__)

# GCS object prefix per incident; the local mirror keeps the same layout under artifacts/.
EXPORT_PREFIX = "incidents"
LOCAL_EXPORT_ROOT = Path(__file__).resolve().parents[2] / "artifacts" / "documents"
CONSOLE_URL_TEMPLATE = "https://console.cloud.google.com/storage/browser/{bucket}/{prefix}"

# (file name, display title) for the four exported documents, in stable order.
DOCUMENT_FILES: tuple[tuple[str, str], ...] = (
    ("work_order.md", "Work Order"),
    ("report_8d.md", "8D Report"),
    ("sop_proposal.md", "SOP Proposal"),
    ("impact_card.md", "Impact Card"),
)


def export_destination() -> Literal["gcs", "local"]:
    """GCS in production; the local artifacts directory everywhere else."""
    return "gcs" if settings.is_production else "local"


def console_url(bucket: str, incident_id: str) -> str:
    """Cloud Console browser path for the incident's document folder (#333: blobs are private)."""
    return CONSOLE_URL_TEMPLATE.format(bucket=bucket, prefix=f"{EXPORT_PREFIX}/{incident_id}")


def new_gcs_client() -> storage.Client:
    """Creates the GCS client used for the upload; tests monkeypatch this hook."""
    return storage.Client(project=settings.gcp_project_id)


def _header(state: IncidentState) -> list[str]:
    """Shared Markdown header lines stamped on every exported document."""
    return [
        f"Incident: {state.incident_id}",
        f"Machine / tool: {state.suspect_machine or '-'} / {state.suspect_tool or '-'}",
        f"Defect: {state.defect_type or '-'} ({state.defect_rate:.3f} vs UCL {state.spc_ucl:.3f})",
        f"Status: {state.status} (approved by shift leader)",
        f"Closed at: {state.closed_at or '-'}",
    ]


def _doc_markdown(title: str, body: str, state: IncidentState) -> str:
    """One scribe document (work order / 8D / SOP) as Markdown with the incident header."""
    lines = [f"# {title} — {state.incident_id}", ""]
    lines.extend(_header(state))
    lines += ["", "## Content", "", body.strip() or "_Not produced for this incident._", ""]
    return "\n".join(lines)


def _impact_card_markdown(state: IncidentState) -> str:
    """Impact card rendered from the board impact fields (issue #333)."""
    impact = state.impact
    lines = [f"# Impact Card — {state.incident_id}", ""]
    lines.extend(_header(state))
    lines += ["", "## Impact", ""]
    if impact is None:
        lines.append("_No impact recorded on the incident board._")
        return "\n".join(lines)
    lines += [
        "| Metric | Value |",
        "| --- | --- |",
        f"| Scrap avoided | {impact.scrap_avoided} pcs |",
        f"| Downtime | {impact.downtime_minutes} min |",
        f"| Energy saved | {impact.energy_kwh} kWh |",
        f"| CO2e avoided | {impact.co2_kg} kg |",
        f"| Cost savings | ${impact.cost_savings_usd:,.2f} |",
        "",
        f"- Energy CO2e: {impact.energy_co2_kg} kg",
        f"- Material CO2e: {impact.material_co2_kg} kg",
        f"- Factory profile: {impact.factory_type}",
    ]
    return "\n".join(lines)


def render_documents(state: IncidentState) -> dict[str, str]:
    """Renders the four approved documents as Markdown, keyed by file name."""
    docs = state.documents or {}
    return {
        "work_order.md": _doc_markdown("Work Order", str(docs.get("work_order", "")), state),
        "report_8d.md": _doc_markdown("8D Report", str(docs.get("report_8d", "")), state),
        "sop_proposal.md": _doc_markdown("SOP Proposal", str(docs.get("sop_proposal", "")), state),
        "impact_card.md": _impact_card_markdown(state),
    }


def export_incident_documents(
    state: IncidentState,
    *,
    client: Optional[storage.Client] = None,
    destination: Optional[Literal["gcs", "local"]] = None,
) -> IncidentDocumentsExportResult:
    """Renders and writes the approved documents for ``state`` (GCS in prod, local otherwise)."""
    dest = destination or export_destination()
    rendered = render_documents(state)
    prefix = f"{EXPORT_PREFIX}/{state.incident_id}"
    if dest == "gcs":
        bucket_name = settings.documents_bucket
        bucket = (client if client is not None else new_gcs_client()).bucket(bucket_name)
        uris: list[str] = []
        for name, content in rendered.items():
            bucket.blob(f"{prefix}/{name}").upload_from_string(
                content, content_type="text/markdown"
            )
            uris.append(f"gs://{bucket_name}/{prefix}/{name}")
        logger.info(
            "exported %d documents for %s to gs://%s/%s",
            len(uris),
            state.incident_id,
            bucket_name,
            prefix,
        )
        return IncidentDocumentsExportResult(
            incident_id=state.incident_id,
            destination="gcs",
            bucket=bucket_name,
            prefix=prefix,
            uris=uris,
            console_url=console_url(bucket_name, state.incident_id),
        )
    root = LOCAL_EXPORT_ROOT / state.incident_id
    root.mkdir(parents=True, exist_ok=True)
    uris = []
    for name, content in rendered.items():
        path = root / name
        path.write_text(content, encoding="utf-8")
        uris.append(str(path))
    logger.info(
        "exported %d documents for %s to local %s (app_env=%s)",
        len(uris),
        state.incident_id,
        root,
        settings.app_env,
    )
    return IncidentDocumentsExportResult(
        incident_id=state.incident_id,
        destination="local",
        bucket=None,
        prefix=prefix,
        uris=uris,
        console_url=None,
        note=f"app_env={settings.app_env}: documents written to {root} locally instead of GCS",
    )


def document_links(state: IncidentState) -> list[IncidentDocumentLink]:
    """URIs for the four exported documents (gs:// in prod, local paths in dev)."""
    if not state.documents_exported:
        return []
    dest = export_destination()
    prefix = f"{EXPORT_PREFIX}/{state.incident_id}"
    links: list[IncidentDocumentLink] = []
    for name, title in DOCUMENT_FILES:
        if dest == "gcs":
            uri = f"gs://{settings.documents_bucket}/{prefix}/{name}"
        else:
            uri = str(LOCAL_EXPORT_ROOT / state.incident_id / name)
        links.append(IncidentDocumentLink(name=name, title=title, uri=uri))
    return links


def documents_response(state: IncidentState) -> IncidentDocumentsResponse:
    """GET /api/incidents/documents payload for the given board state (#333)."""
    dest = export_destination()
    bucket = settings.documents_bucket if dest == "gcs" else None
    return IncidentDocumentsResponse(
        incident_id=state.incident_id,
        exported=state.documents_exported,
        export_error=state.documents_export_error,
        destination=dest,
        bucket=bucket,
        console_url=console_url(bucket, state.incident_id) if bucket else None,
        documents=document_links(state),
    )


def schedule_documents_export(state: IncidentState) -> None:
    """Runs the document export off the approval path (issue #333).

    The export never blocks or fails the approval: with a running event loop it
    runs in a background thread (``asyncio.to_thread``); without one (direct
    sync calls, scripts) it runs inline so the result is immediate. Success or
    failure lands on the blackboard (``documents_exported`` /
    ``documents_export_error``); if the board moved on to another incident
    before the export finished, the result is dropped instead of stamped onto
    the wrong incident.
    """

    def _record(exported: bool, error: Optional[str]) -> None:
        current = blackboard.get_state()
        if current.incident_id != state.incident_id:
            logger.warning(
                "board moved to %s before the document export finished; result dropped for %s",
                current.incident_id,
                state.incident_id,
            )
            return
        blackboard.update_status(
            current.status, documents_exported=exported, documents_export_error=error
        )

    def _run() -> None:
        try:
            export_incident_documents(state)
            _record(exported=True, error=None)
        except Exception as exc:  # approval must survive any export failure (#333)
            logger.warning("document export failed for %s: %s", state.incident_id, exc)
            _record(exported=False, error=str(exc))

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is not None and loop.is_running():
        loop.create_task(asyncio.to_thread(_run))
    else:
        _run()
