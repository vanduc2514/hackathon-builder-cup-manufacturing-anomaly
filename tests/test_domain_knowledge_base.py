"""Unit tests for curated manufacturing domain knowledge base documents and tools."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.core.models import CitationReference
from backend.tools.domain_knowledge import (
    create_citation,
    extract_page_section,
    get_document_content,
    get_knowledge_base_dir,
    list_knowledge_documents,
    search_knowledge_base_offline,
)


@pytest.fixture
def kb_dir() -> Path:
    return get_knowledge_base_dir()


def test_knowledge_base_directory_structure(kb_dir: Path):
    """Verify that all required knowledge directories and documents exist."""
    required_docs = [
        "manuals/cnc_operating_manual.md",
        "maint_logs/cnc_tool_t07_maintenance.md",
        "past_8d_reports/8D_2026_03_12_spindle_vibration.md",
        "manuals/injection_molding_guide.md",
        "manuals/mold_spec_im05_4cavity.md",
        "maint_logs/dehumidifier_dryer_maintenance.md",
        "past_8d_reports/8D_2026_03_12_dryer_filter_dewpoint.md",
        "index.json",
    ]
    for rel_path in required_docs:
        file_path = kb_dir / rel_path
        assert file_path.exists(), f"Missing required document: {rel_path}"
        assert file_path.stat().st_size > 0, f"Document is empty: {rel_path}"


def test_cnc_operating_manual_specifications_and_page_112(kb_dir: Path):
    """Key Criterion 1: CNC manual specifications, runout, insert wear, and Page 112."""
    meta, body = get_document_content("manuals/cnc_operating_manual.md")
    assert meta.get("category") == "manual"
    assert "CNC-02" in meta.get("machines", [])

    # Check Spindle runout specification (< 0.005 mm)
    assert "0.005" in body
    assert "TIR" in body

    # Check Tool life threshold (2,000 parts)
    assert "2,000" in body or "2000" in body

    # Check Page 112 anchor and content
    sec_title, page_112_content = extract_page_section(body, 112)
    assert page_112_content, "Page 112 anchor not found in CNC manual"
    assert (
        "scratch_vertical" in page_112_content or "vertical scratches" in page_112_content.lower()
    )
    assert "insert" in page_112_content.lower()
    assert "wear" in page_112_content.lower()
    assert "vibration" in page_112_content.lower()


def test_tool_t07_maintenance_log_records(kb_dir: Path):
    """Key Criterion 2: Tool T07 ran 2,400 parts vs 2,000 limit under calendar SOP."""
    meta, body = get_document_content("maint_logs/cnc_tool_t07_maintenance.md")
    assert meta.get("category") == "maint_log"
    assert meta.get("machine_id") == "CNC-02"

    assert "2,400" in body or "2400" in body
    assert "2,000" in body or "2000" in body
    assert "SOP-MNT-CNC-04" in body
    assert "calendar" in body.lower()
    assert "0.003" in body  # Verified runout post-repair


def test_historical_8d_spindle_vibration_report(kb_dir: Path):
    """Key Criterion 3: Historical 8D report for 2026-03-12 spindle vibration cured by insert replacement."""
    meta, body = get_document_content("past_8d_reports/8D_2026_03_12_spindle_vibration.md")
    assert meta.get("category") == "8d_report"
    assert meta.get("incident_date") == "2026-03-12"

    # Verify 8D sections exist
    assert "D1:" in body
    assert "D2:" in body
    assert "D3:" in body
    assert "D4:" in body
    assert "D5:" in body
    assert "D6:" in body
    assert "D7:" in body
    assert "D8:" in body

    # Verify 5-Whys and Ishikawa
    assert "5-Whys" in body
    assert "Ishikawa" in body

    # Verify cure: insert replacement
    assert "insert" in body.lower()
    assert "replacement" in body.lower() or "replace" in body.lower()
    assert "50" in body  # 50 consecutive verified good parts


def test_injection_molding_use_case_2_specifications(kb_dir: Path):
    """Key Criterion 4: ABS moisture limits (>0.02%), cavity #3 runner length, dryer maintenance."""
    # ABS Guide
    _, im_body = get_document_content("manuals/injection_molding_guide.md")
    assert "0.02%" in im_body
    assert "sink_mark" in im_body or "sink marks" in im_body.lower()
    assert "-40" in im_body
    assert "-18" in im_body

    # Mold Spec (Cavity #3 runner length)
    _, mold_body = get_document_content("manuals/mold_spec_im05_4cavity.md")
    assert "Cavity #3" in mold_body or "Cavity 3" in mold_body
    assert "285 mm" in mold_body
    assert "runner length" in mold_body.lower()

    # Dryer Maintenance Log
    _, dryer_body = get_document_content("maint_logs/dehumidifier_dryer_maintenance.md")
    assert "Dryer-03" in dryer_body
    assert "-18" in dryer_body
    assert "filter" in dryer_body.lower()
    assert "FLT-DM-04" in dryer_body


def test_standardized_citation_formatting_and_helper():
    """Key Criterion 5: Citation formatting, schema validation, and offline search."""
    # List documents
    docs = list_knowledge_documents()
    assert len(docs) >= 7
    doc_ids = {d.document_id for d in docs}
    assert "manuals/cnc_operating_manual.md" in doc_ids
    assert "past_8d_reports/8D_2026_03_12_spindle_vibration.md" in doc_ids

    # Create citation
    cit = create_citation(
        document_id="manuals/cnc_operating_manual.md",
        page_number=112,
        section="Section 4.5: Spindle Vibration & Cutting Insert Diagnostics",
        snippet="Vertical scratches on Face A indicate cutting insert wear on Tool T07.",
        relevance_score=0.95,
    )
    assert isinstance(cit, CitationReference)
    assert cit.document_id == "manuals/cnc_operating_manual.md"
    assert cit.page_number == 112
    assert cit.relevance_score == 0.95

    # Offline search
    cnc_results = search_knowledge_base_offline(
        "spindle vibration vertical scratch T07", filter_machine="CNC-02"
    )
    assert len(cnc_results) > 0
    assert any("cnc" in r.document_id.lower() or "8d" in r.document_id.lower() for r in cnc_results)

    # Search for injection molding / moisture / cavity 3
    im_results = search_knowledge_base_offline(
        "moisture limit cavity runner", filter_machine="IM-05"
    )
    assert len(im_results) > 0
    assert any(
        "mold" in r.document_id.lower() or "injection" in r.document_id.lower() for r in im_results
    )


def test_index_json_schema(kb_dir: Path):
    """Verify index.json manifest parses cleanly and covers all documents."""
    manifest_path = kb_dir / "index.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert "documents" in manifest
    assert len(manifest["documents"]) >= 7

    for doc in manifest["documents"]:
        assert "document_id" in doc
        assert "title" in doc
        assert "category" in doc
        assert "critical_citations" in doc
        for cit in doc["critical_citations"]:
            assert "snippet" in cit
            assert len(cit["snippet"]) > 10
