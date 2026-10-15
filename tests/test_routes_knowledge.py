"""Tests for Knowledge Base routes: SOP procedures, Walkthrough videos, documents, and RAG search."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.models import (
    KnowledgeDocumentMeta,
    RAGSearchResult,
    SopDocument,
    WalkthroughMetadata,
)

client = TestClient(app)


def test_get_sops_list():
    """Verify that GET /api/knowledge/sops returns all SOP documents with valid schema."""
    response = client.get("/api/knowledge/sops")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 6

    # Verify model validation and key camelCase serialization
    for item in data:
        sop = SopDocument.model_validate(item)
        assert sop.code > 0
        assert sop.title
        assert sop.station
        assert sop.category
        assert "noteTrail" in item
        assert "sideLink" in item


def test_get_sops_filtering():
    """Verify filtering SOPs by category, station, and search text."""
    # Filter by category
    res_cnc = client.get("/api/knowledge/sops?category=CNC Milling")
    assert res_cnc.status_code == 200
    cnc_data = res_cnc.json()
    assert len(cnc_data) > 0
    assert all(item["category"] == "CNC Milling" for item in cnc_data)

    # Filter by station
    res_station = client.get("/api/knowledge/sops?station=CAM-EOL")
    assert res_station.status_code == 200
    assert any(item["code"] == 114 for item in res_station.json())

    # Search keyword
    res_search = client.get("/api/knowledge/sops?search=transducer")
    assert res_search.status_code == 200
    assert any(item["code"] == 82 for item in res_search.json())


def test_get_sop_by_code():
    """Verify retrieving a specific SOP by code and 404 for missing codes."""
    res = client.get("/api/knowledge/sops/209")
    assert res.status_code == 200
    data = res.json()
    assert data["code"] == 209
    assert data["station"] == "CNC-02"
    assert "Spindle Damper" in data["title"]
    assert data["walkthroughId"] == "MW-08"

    # Missing code
    res_missing = client.get("/api/knowledge/sops/999999")
    assert res_missing.status_code == 404
    assert "not found" in res_missing.json()["detail"].lower()


def test_get_walkthroughs_list():
    """Verify that GET /api/knowledge/walkthroughs returns valid walkthrough metadata."""
    response = client.get("/api/knowledge/walkthroughs")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 7

    for item in data:
        wt = WalkthroughMetadata.model_validate(item)
        assert wt.id
        assert wt.duration_sec > 0
        assert wt.author.name
        assert "durationSec" in item
        assert "shortTitle" in item


def test_get_walkthroughs_filtering():
    """Verify filtering walkthroughs by station, required flag, and search keywords."""
    # Filter by required
    res_req = client.get("/api/knowledge/walkthroughs?required=true")
    assert res_req.status_code == 200
    req_data = res_req.json()
    assert len(req_data) > 0
    assert all(w.get("required") is True for w in req_data)

    # Filter by station
    res_station = client.get("/api/knowledge/walkthroughs?station=Wash Line")
    assert res_station.status_code == 200
    assert any(w["id"] == "WT-WASH" for w in res_station.json())

    # Search text
    res_search = client.get("/api/knowledge/walkthroughs?search=polarization")
    assert res_search.status_code == 200
    assert any(w["id"] == "WT-CAM" for w in res_search.json())


def test_get_walkthrough_by_id():
    """Verify retrieving a walkthrough by ID and 404 handling."""
    res = client.get("/api/knowledge/walkthroughs/MW-08")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "MW-08"
    assert data["durationSec"] == 134
    assert data["sop"] == 209

    # 404 on unknown ID
    res_missing = client.get("/api/knowledge/walkthroughs/WT-DOES-NOT-EXIST")
    assert res_missing.status_code == 404


def test_get_documents_list():
    """Verify GET /api/knowledge/documents returns curated manuals and reports."""
    response = client.get("/api/knowledge/documents")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 7

    for item in data:
        doc = KnowledgeDocumentMeta.model_validate(item)
        assert doc.document_id
        assert doc.title
        assert doc.category in {"manual", "maint_log", "8d_report", "spec"}


def test_search_knowledge_endpoint():
    """Verify GET /api/knowledge/search retrieves grounded citations via RAG tool."""
    response = client.get(
        "/api/knowledge/search?q=scratch_vertical&asset=CNC-02&limit=5"
    )
    assert response.status_code == 200

    data = response.json()
    result = RAGSearchResult.model_validate(data)
    assert result.defect_symptom == "scratch_vertical"
    assert result.suspect_asset == "CNC-02"
    assert len(result.citations) > 0
    assert result.confidence > 0.0

    # Verify citation fields
    top_citation = result.citations[0]
    assert top_citation.document_id
    assert top_citation.title
    assert top_citation.snippet
    assert top_citation.relevance_score > 0.0


def test_search_knowledge_auto_defaults():
    """Verify search without explicit parameters derives keys and succeeds without error."""
    response = client.get("/api/knowledge/search?q=IM-05+barrel+purge")
    assert response.status_code == 200

    data = response.json()
    result = RAGSearchResult.model_validate(data)
    assert result.suspect_asset == "IM-05"
    assert len(result.citations) > 0


@pytest.mark.real_auth
def test_knowledge_routes_require_auth():
    """Verify that unauthenticated requests to /api/knowledge/* return 401."""
    unauth_client = TestClient(app)
    res_sops = unauth_client.get("/api/knowledge/sops")
    assert res_sops.status_code == 401

    res_wt = unauth_client.get("/api/knowledge/walkthroughs")
    assert res_wt.status_code == 401

    res_search = unauth_client.get("/api/knowledge/search?q=test")
    assert res_search.status_code == 401
