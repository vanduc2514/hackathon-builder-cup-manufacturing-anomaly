"""Tests for Knowledge Base API routes: search, SOP catalogue, and walkthroughs."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.models import (
    KnowledgeDocumentMeta,
    RAGSearchResult,
    WalkthroughMeta,
)
from backend.tools.rag_search_tool import list_walkthroughs

client = TestClient(app)


@pytest.mark.real_auth
def test_knowledge_endpoints_require_auth():
    """Unauthenticated requests to /api/knowledge/* must return 401."""
    res_search = client.get("/api/knowledge/search?q=test")
    assert res_search.status_code == 401

    res_sops = client.get("/api/knowledge/sops")
    assert res_sops.status_code == 401

    res_walks = client.get("/api/knowledge/walkthroughs")
    assert res_walks.status_code == 401


def test_search_validation_errors():
    """Verify input validation rules for /api/knowledge/search."""
    # Empty query -> 422
    res_empty = client.get("/api/knowledge/search?q=")
    assert res_empty.status_code == 422

    # Missing query -> 422
    res_missing = client.get("/api/knowledge/search")
    assert res_missing.status_code == 422

    # Limit > 20 -> 422
    res_limit_high = client.get("/api/knowledge/search?q=spindle&limit=50")
    assert res_limit_high.status_code == 422

    # Limit < 1 -> 422
    res_limit_low = client.get("/api/knowledge/search?q=spindle&limit=0")
    assert res_limit_low.status_code == 422


def test_search_in_domain_scratches_query():
    """Verify plain-language question retrieves relevant CNC citations."""
    response = client.get("/api/knowledge/search?q=Why does CNC-02 leave scratches?")
    assert response.status_code == 200

    data = response.json()
    result = RAGSearchResult.model_validate(data)

    assert result.engine == "local_bm25"
    assert result.confidence > 0.80
    assert len(result.citations) > 0
    assert len(result.citations) <= 10

    # Top hits must reference CNC manual or 8D report
    top_doc_ids = [c.document_id for c in result.citations]
    assert any("cnc" in d.lower() for d in top_doc_ids)

    # Deduplication check: no duplicate (document_id, page_number) pairs
    seen_pairs = set()
    for c in result.citations:
        pair = (c.document_id, c.page_number)
        assert pair not in seen_pairs
        seen_pairs.add(pair)


def test_search_out_of_domain_loto_query():
    """Verify out-of-domain query 'LOTO 480V' returns 0 citations and 0.0 confidence."""
    response = client.get("/api/knowledge/search?q=LOTO 480V")
    assert response.status_code == 200

    data = response.json()
    result = RAGSearchResult.model_validate(data)

    assert result.citations == []
    assert result.confidence == 0.0
    assert result.total_found == 0


def test_get_sops_returns_seven_curated_documents():
    """Verify /api/knowledge/sops returns the 7 real domain documents from index.json."""
    response = client.get("/api/knowledge/sops")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 7

    parsed_docs = [KnowledgeDocumentMeta.model_validate(d) for d in data]
    titles = [d.title for d in parsed_docs]

    assert "CNC Vertical Machining Center Operating & Maintenance Manual" in titles
    assert "Industrial Injection Molding Machine & Polymer Processing Guide" in titles

    # Check that sections and key citations are populated
    cnc_manual = next(d for d in parsed_docs if "CNC Vertical" in d.title)
    assert len(cnc_manual.sections) > 0
    assert len(cnc_manual.key_citations) > 0
    assert "CNC-02" in cnc_manual.machines


def test_get_walkthroughs_returns_empty_list():
    """Verify /api/knowledge/walkthroughs returns empty list on existing repository data."""
    response = client.get("/api/knowledge/walkthroughs")
    assert response.status_code == 200

    data = response.json()
    assert data == []


def test_list_walkthroughs_parses_json_and_skips_malformed(tmp_path: Path):
    """Verify list_walkthroughs parses valid walkthrough JSON and skips malformed files."""
    videos_dir = tmp_path / "expert_videos"
    videos_dir.mkdir(parents=True)

    # 1. Valid walkthrough JSON
    valid_data = {
        "id": "WT-SPINDLE-01",
        "title": "CNC Spindle Damper Calibration",
        "asset": "CNC-02",
        "category": "Milling",
        "duration_sec": 120,
        "video_uri": "gs://test-bucket/expert_videos/spindle.mp4",
        "chapters": [{"label": "Setup", "at": 0}, {"label": "Calibration", "at": 60}],
        "key_steps": ["Inspect runout", "Tighten damper"],
        "required": True,
        "tags": ["spindle", "calibration"],
    }
    (videos_dir / "wt_spindle.json").write_text(json.dumps(valid_data), encoding="utf-8")

    # 2. Malformed JSON file
    (videos_dir / "wt_corrupt.json").write_text("{invalid_json: true", encoding="utf-8")

    # 3. Non-dict JSON file
    (videos_dir / "wt_not_dict.json").write_text(json.dumps([1, 2, 3]), encoding="utf-8")

    parsed = list_walkthroughs(data_dir=tmp_path)
    assert len(parsed) == 1
    assert isinstance(parsed[0], WalkthroughMeta)
    assert parsed[0].id == "WT-SPINDLE-01"
    assert parsed[0].duration_sec == 120
    assert len(parsed[0].chapters) == 2
