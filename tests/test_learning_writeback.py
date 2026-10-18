"""Tests for the approved-incident knowledge write-back into RAG (#334).

Validates:
1. render_learning_markdown: the entry carries defect, root cause, evidence,
   repair, SOP change, impact and incident id/date.
2. write_back_learning: dev mode writes data/knowledge_base/learned/<id>.md and
   reindexes the local BM25; GCP mode uploads kb/learned__<id>.txt and runs a
   incremental Vertex AI Search import.
3. orchestrator.approve triggers the write-back next to the #333 document export.
"""

from __future__ import annotations

from pathlib import Path

import pytest

import backend.agents.orchestrator as orchestrator_module
from backend.agents.orchestrator import orchestrator
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import AgentFinding, ImpactMetrics, IncidentState
from backend.tools import learning_writeback
from backend.tools.learning_writeback import (
    learned_blob_name,
    render_learning_markdown,
    write_back_learning,
)
from backend.tools.rag_search_tool import LocalBM25Retriever

# These tests exercise the real approve() side hooks; conftest no-ops them otherwise.
pytestmark = pytest.mark.approval_hooks


@pytest.fixture(autouse=True)
def _clean_blackboard():
    """Ensures a pristine board before and after each test."""
    blackboard.reset()
    yield
    blackboard.reset()


def _make_state() -> IncidentState:
    """A fully resolved, approved CNC-02 incident mirroring the DEMO_GUIDE story."""
    return IncidentState(
        incident_id="INC-0412",
        status="closed",
        approved=True,
        approved_by="lead-01",
        approved_at="2026-10-18T10:00:00+00:00",
        defect_type="scratch_vertical",
        defect_rate=0.077,
        spc_ucl=0.03,
        suspect_machine="CNC-02",
        suspect_tool="T07",
        root_cause="Worn flank edge on carbide insert T07 scoring the AL-5083 housing flank",
        repair_done=True,
        verification_count=50,
        verification_target=50,
        opened_at="2026-10-18T09:30:00+00:00",
        closed_at="2026-10-18T09:42:00+00:00",
        findings=[
            AgentFinding(
                agent_id="RCA",
                agent_name="Root Cause Analyst",
                phase="Phase B - Root Cause Analysis",
                finding="T07 flank wear caused vertical scoring",
                evidence="Insert VB32 measured 0.42 mm vs 0.30 mm limit",
                confidence=0.92,
                citation="Tool maintenance log TL-T07",
            ),
            AgentFinding(
                agent_id="QI",
                agent_name="Quality Inspector",
                phase="Phase C - Verification",
                finding="Post-repair parts defect-free",
                evidence="50 consecutive good parts",
                confidence=0.99,
                citation="End-of-line Camera Station #1",
            ),
        ],
        documents={
            "work_order": {
                "work_order_id": "WO-8821",
                "title": "Replace T07 carbide insert",
                "description": "Swap the worn insert and re-run the flank pass",
            },
            "sop_proposal": {
                "sop_id": "SOP-MNT-CNC-04",
                "title": "Insert wear check cadence",
                "current_procedure": "Check inserts every 200 parts",
                "proposed_revision": "Check inserts every 100 parts on CNC-02",
            },
        },
        impact=ImpactMetrics(
            scrap_avoided=240,
            downtime_minutes=45,
            energy_kwh=38.0,
            co2_kg=25.0,
            cost_savings_usd=3600.0,
            energy_co2_kg=15.2,
            material_co2_kg=9.8,
        ),
    )


def test_render_learning_markdown_contains_incident_facts() -> None:
    """The entry carries every incident fact the RAG write-back must preserve."""
    markdown = render_learning_markdown(_make_state())

    # Frontmatter for the local BM25 indexer (machine isolation + recency)
    assert "category: learned" in markdown
    assert "machines: [CNC-02]" in markdown
    assert "component: T07" in markdown
    assert "last_revised: 2026-10-18" in markdown

    # Incident id/date and approver
    assert "Incident ID: INC-0412" in markdown
    assert "Opened: 2026-10-18T09:30:00+00:00" in markdown
    assert "Closed: 2026-10-18T09:42:00+00:00" in markdown
    assert "Approved by: lead-01 at 2026-10-18T10:00:00+00:00" in markdown

    # Defect + root cause + evidence + repair + SOP change + impact
    assert "Defect: scratch_vertical on CNC-02 (tool T07)" in markdown
    assert "Defect rate at breach: 7.7% vs SPC UCL 3.0%" in markdown
    assert "Worn flank edge on carbide insert T07" in markdown
    assert "T07 flank wear caused vertical scoring" in markdown
    assert "Insert VB32 measured 0.42 mm vs 0.30 mm limit" in markdown
    assert "Work order WO-8821: Replace T07 carbide insert" in markdown
    assert "Post-repair verification: 50/50 consecutive defect-free parts" in markdown
    assert "SOP-MNT-CNC-04 — Insert wear check cadence" in markdown
    assert "Check inserts every 100 parts on CNC-02" in markdown
    assert "Scrap avoided: 240 parts" in markdown
    assert "Energy conserved: 38.0 kWh" in markdown
    assert "Cost savings: $3,600" in markdown


def test_write_back_learning_dev_mode_writes_and_reindexes(tmp_path: Path, monkeypatch) -> None:
    """Dev mode: local markdown entry + local BM25 reindex, no cloud steps."""
    monkeypatch.setattr(settings, "gcp_project_id", "kaizen-local")
    monkeypatch.setattr(learning_writeback, "DEFAULT_KNOWLEDGE_DIR", tmp_path)
    reindexed: list[bool] = []
    monkeypatch.setattr(
        learning_writeback, "reindex_local_knowledge", lambda: reindexed.append(True)
    )

    path = write_back_learning(_make_state())

    assert path == tmp_path / "learned" / "INC-0412.md"
    assert path.exists()
    assert "scratch_vertical" in path.read_text(encoding="utf-8")
    assert reindexed == [True]


def test_write_back_learning_cloud_mode_uploads_and_imports(tmp_path: Path, monkeypatch) -> None:
    """GCP mode: the entry is uploaded and incrementally imported, not reindexed locally."""
    monkeypatch.setattr(learning_writeback, "_cloud_configured", lambda: True)
    uploads: list[tuple[Path, str]] = []
    monkeypatch.setattr(
        learning_writeback, "_upload_and_import", lambda p, iid: uploads.append((p, iid))
    )
    reindexed: list[bool] = []
    monkeypatch.setattr(
        learning_writeback, "reindex_local_knowledge", lambda: reindexed.append(True)
    )

    path = write_back_learning(_make_state(), kb_root=tmp_path)

    assert uploads == [(path, "INC-0412")]
    assert (tmp_path / "learned" / "INC-0412.md").exists()
    assert reindexed == []


def test_learned_blob_name_lands_in_write_back_namespace() -> None:
    """The blob name matches the kb/learned__ prefix kb:import reconciliation keeps."""
    assert learned_blob_name("INC-0412") == "kb/learned__INC-0412.txt"
    assert learned_blob_name("INC-0412").startswith(learning_writeback.LEARNED_BLOB_PREFIX)


def test_reindex_returns_new_learned_entry_for_matching_query(tmp_path: Path, monkeypatch) -> None:
    """A fresh BM25 index finds the learned entry only after a reindex."""
    monkeypatch.setattr(settings, "gcp_project_id", "kaizen-local")
    monkeypatch.setattr(learning_writeback, "reindex_local_knowledge", lambda: None)

    retriever = LocalBM25Retriever(tmp_path)
    assert retriever.search("scratch_vertical", "CNC-02") == []

    write_back_learning(_make_state(), kb_root=tmp_path)

    retriever.reindex()
    citations = retriever.search("scratch_vertical", "CNC-02")
    assert citations, "learned entry should be searchable after reindex"
    assert any(c.document_id == "learned/INC-0412.md" for c in citations)
    top = citations[0]
    assert "INC-0412" in top.title


def test_approval_writes_learned_markdown_entry(tmp_path: Path, monkeypatch) -> None:
    """Orchestrator.approve writes the learned entry with the incident facts (#334)."""
    monkeypatch.setattr(settings, "gcp_project_id", "kaizen-local")
    monkeypatch.setattr(learning_writeback, "DEFAULT_KNOWLEDGE_DIR", tmp_path)
    reindexed: list[bool] = []
    monkeypatch.setattr(
        learning_writeback, "reindex_local_knowledge", lambda: reindexed.append(True)
    )
    # #333's document export is out of scope here; keep it from writing artifacts.
    monkeypatch.setattr(orchestrator_module, "schedule_documents_export", lambda state: None)
    # Join the write-back thread so the assertions are deterministic.
    real_schedule = orchestrator_module.schedule_learning_writeback

    def _joined_schedule(state: IncidentState) -> None:
        handle = real_schedule(state)
        if hasattr(handle, "join"):
            handle.join()

    monkeypatch.setattr(orchestrator_module, "schedule_learning_writeback", _joined_schedule)

    blackboard.update_status(
        "pending_approval",
        defect_type="scratch_vertical",
        defect_rate=0.077,
        suspect_machine="CNC-02",
        suspect_tool="T07",
        root_cause="Worn flank edge on carbide insert T07",
        repair_done=True,
        verification_count=50,
        verification_target=50,
        documents={
            "sop_proposal": {
                "sop_id": "SOP-MNT-CNC-04",
                "title": "Insert wear check cadence",
                "current_procedure": "Check inserts every 200 parts",
                "proposed_revision": "Check inserts every 100 parts on CNC-02",
            }
        },
    )

    state = orchestrator.approve("lead-01")
    assert state is not None
    assert state.approved is True

    entry = tmp_path / "learned" / f"{state.incident_id}.md"
    assert entry.exists()
    text = entry.read_text(encoding="utf-8")
    assert "Defect: scratch_vertical on CNC-02 (tool T07)" in text
    assert "Worn flank edge on carbide insert T07" in text
    assert "SOP-MNT-CNC-04 — Insert wear check cadence" in text
    assert "Approved by: lead-01" in text
    assert reindexed == [True]

    # A second approval must not write a second entry
    assert orchestrator.approve("lead-01") is None
    assert reindexed == [True]


def test_schedule_learning_writeback_returns_handle(tmp_path: Path, monkeypatch) -> None:
    """The scheduler returns a joinable thread (sync caller) for deterministic callers."""
    monkeypatch.setattr(settings, "gcp_project_id", "kaizen-local")
    monkeypatch.setattr(learning_writeback, "DEFAULT_KNOWLEDGE_DIR", tmp_path)
    monkeypatch.setattr(learning_writeback, "reindex_local_knowledge", lambda: None)

    import threading

    handle = learning_writeback.schedule_learning_writeback(_make_state())
    assert isinstance(handle, threading.Thread)
    handle.join(timeout=10)
    assert (tmp_path / "learned" / "INC-0412.md").exists()
