"""Tests for issue #333: approved incident document export (Markdown to GCS).

Validates:
- Orchestrator.approve renders the four documents (work order, 8D, SOP proposal,
  impact card) as Markdown and uploads them to gs://<documents_bucket>/incidents/<id>/.
- Dev (non-production) runs write artifacts/documents/<id>/ locally instead.
- Export failures never fail the approval: they log a warning and land on the
  blackboard (documents_exported=False + documents_export_error).
- GET /api/incidents/documents returns the document links (bucket-relative paths
  like incidents/<id>/work_order.md); GET /api/incidents/documents/{name} returns
  the rendered Markdown text.
"""

from __future__ import annotations

from pathlib import Path
from typing import Generator
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from backend.agents.orchestrator import orchestrator
from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import ImpactMetrics
from backend.tools import document_export

INCIDENT_ID = "INC-TEST-333"
FILE_NAMES = ["work_order.md", "report_8d.md", "sop_proposal.md", "impact_card.md"]

# These tests exercise the real approve() document-export hook (the approve-path
# ones monkeypatch the GCS client / local root); the conftest autouse fixture
# `_isolate_approval_writebacks` no-ops the hook for every other test.
pytestmark = pytest.mark.approval_hooks


@pytest.fixture(autouse=True)
def clean_board() -> Generator[None, None, None]:
    """Ensures a clean blackboard around every test."""
    blackboard.reset()
    yield
    blackboard.reset()


def _incident_awaiting_approval() -> None:
    """Puts a fully-drafted incident (documents + impact) up for approval."""
    blackboard.update_status(
        "pending_approval",
        incident_id=INCIDENT_ID,
        suspect_machine="CNC-02",
        suspect_tool="T07",
        defect_type="scratch_vertical",
        defect_rate=0.077,
        closed_at="2026-10-18T08:00:00+00:00",
        documents={
            "work_order": "WO-2026-1004: replace insert T07 on CNC-02.",
            "report_8d": "8D Report: T07 flank wear caused vertical scratches.",
            "sop_proposal": "SOP-MNT-CNC-04 revision: counter-based lockout.",
        },
        impact=ImpactMetrics(
            scrap_avoided=240,
            downtime_minutes=45,
            energy_kwh=38.0,
            co2_kg=25.0,
            cost_savings_usd=3600.0,
        ),
    )


def test_approve_uploads_four_markdown_files_to_gcs(monkeypatch: pytest.MonkeyPatch) -> None:
    """Approve uploads the 4 Markdown files under incidents/<incident_id>/ with the id in the blob prefix."""
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "documents_bucket", "test-export-bucket")
    client = MagicMock()
    monkeypatch.setattr(document_export, "new_gcs_client", lambda: client)
    _incident_awaiting_approval()

    # Sync call without a running event loop -> the export runs inline, so the
    # board is already stamped when approve() returns.
    state = orchestrator.approve(approver="lead")
    assert state is not None
    assert state.approved is True
    assert state.status == "closed"

    board = blackboard.get_state()
    assert board.documents_exported is True
    assert board.documents_export_error is None

    client.bucket.assert_called_once_with("test-export-bucket")
    bucket = client.bucket.return_value
    blob_names = [call.args[0] for call in bucket.blob.call_args_list]
    assert blob_names == [f"incidents/{INCIDENT_ID}/{name}" for name in FILE_NAMES]

    uploads = bucket.blob.return_value.upload_from_string.call_args_list
    assert len(uploads) == 4
    assert all(call.kwargs.get("content_type") == "text/markdown" for call in uploads)
    contents = [call.args[0] for call in uploads]
    assert all(INCIDENT_ID in content for content in contents)
    assert any("replace insert T07" in content for content in contents)  # work order
    assert any("8D Report" in content for content in contents)
    assert any("SOP-MNT-CNC-04" in content for content in contents)
    assert any("Scrap avoided | 240 pcs" in content for content in contents)  # impact card


def test_approve_survives_export_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    """A GCS failure logs a warning and stamps the error field; the approval itself succeeds."""
    monkeypatch.setattr(settings, "app_env", "production")
    client = MagicMock()
    client.bucket.return_value.blob.return_value.upload_from_string.side_effect = RuntimeError(
        "gcs unreachable"
    )
    monkeypatch.setattr(document_export, "new_gcs_client", lambda: client)
    _incident_awaiting_approval()

    state = orchestrator.approve(approver="lead")
    assert state is not None
    assert state.approved is True  # approval success is kept

    board = blackboard.get_state()
    assert board.documents_exported is False
    assert "gcs unreachable" in (board.documents_export_error or "")


def test_approve_writes_local_artifacts_in_dev(
    monkeypatch: pytest.MonkeyPatch, tmp_path: object
) -> None:
    """Non-production runs write artifacts/documents/<incident_id>/ locally instead of GCS."""
    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(document_export, "LOCAL_EXPORT_ROOT", tmp_path)
    _incident_awaiting_approval()

    state = orchestrator.approve(approver="lead")
    assert state is not None and state.approved is True

    root = tmp_path / INCIDENT_ID  # type: ignore[operator]
    written = sorted(p.name for p in root.iterdir())
    assert written == sorted(FILE_NAMES)
    impact_card = (root / "impact_card.md").read_text(encoding="utf-8")
    assert INCIDENT_ID in impact_card
    assert "Cost savings | $3,600.00" in impact_card
    assert blackboard.get_state().documents_exported is True


def test_documents_route_before_export_is_empty() -> None:
    """Before approval the route reports the current incident with no documents yet."""
    _incident_awaiting_approval()
    res = TestClient(app).get("/api/incidents/documents")
    assert res.status_code == 200
    data = res.json()
    assert data["incident_id"] == INCIDENT_ID
    assert data["exported"] is False
    assert data["documents"] == []
    assert data["destination"] == "local"


def test_documents_route_returns_local_paths_in_dev(monkeypatch: pytest.MonkeyPatch) -> None:
    """In dev the route returns the four local file paths for an exported incident."""
    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(document_export, "LOCAL_EXPORT_ROOT", Path("artifacts/documents"))
    _incident_awaiting_approval()
    blackboard.update_status("closed", approved=True, documents_exported=True)

    res = TestClient(app).get("/api/incidents/documents")
    assert res.status_code == 200
    data = res.json()
    assert data["exported"] is True
    assert data["destination"] == "local"
    assert data["bucket"] is None
    assert "console_url" not in data
    assert [d["name"] for d in data["documents"]] == FILE_NAMES
    assert all(d["path"] == f"incidents/{INCIDENT_ID}/{d['name']}" for d in data["documents"])


def test_documents_route_returns_gcs_paths(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """In production the route returns bucket-relative paths and no console URL."""
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "documents_bucket", "kaizen-lab-kb")
    _incident_awaiting_approval()
    blackboard.update_status("closed", approved=True, documents_exported=True)

    res = TestClient(app).get("/api/incidents/documents")
    assert res.status_code == 200
    data = res.json()
    assert data["destination"] == "gcs"
    assert data["bucket"] == "kaizen-lab-kb"
    assert "console_url" not in data
    assert [d["name"] for d in data["documents"]] == FILE_NAMES
    assert all(d["path"] == f"incidents/{INCIDENT_ID}/{d['name']}" for d in data["documents"])


def test_document_content_route_returns_rendered_markdown() -> None:
    """GET /documents/{name} returns the exported document text rendered from board state."""
    _incident_awaiting_approval()
    blackboard.update_status("closed", approved=True, documents_exported=True)

    res = TestClient(app).get("/api/incidents/documents/work_order.md")
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "work_order.md"
    assert data["title"]
    assert data["content"].startswith("#")
    assert INCIDENT_ID in data["content"]
    assert "WO-2026-1004: replace insert T07 on CNC-02." in data["content"]


def test_document_content_route_unknown_name_is_404() -> None:
    """Names outside the four exported files are rejected."""
    _incident_awaiting_approval()
    blackboard.update_status("closed", approved=True, documents_exported=True)
    assert TestClient(app).get("/api/incidents/documents/evil.md").status_code == 404


def test_document_content_route_before_export_is_404() -> None:
    """Before the export ran there is nothing to show."""
    _incident_awaiting_approval()
    assert TestClient(app).get("/api/incidents/documents/work_order.md").status_code == 404
