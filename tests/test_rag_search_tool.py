"""Unit tests for Vertex AI Search and local domain knowledge base hybrid RAG tool."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from backend.core.models import CitationReference, RAGSearchResult
from backend.tools.rag_search_tool import (
    format_citations_for_prompt,
    get_oem_manual_citations,
    search_knowledge_base,
    search_knowledge_base_sync,
)


def test_dual_query_keys_validation():
    """Key Criterion 1: Dual Query Keys are mandatory; missing parameters raise ValueError."""
    # Calling without parameters must raise ValueError
    with pytest.raises(ValueError, match="Dual query keys required"):
        search_knowledge_base_sync()

    # Providing only symptom without asset must raise ValueError
    with pytest.raises(ValueError, match="Dual query keys required"):
        search_knowledge_base_sync(defect_symptom="scratch_vertical")

    # Providing only asset without symptom must raise ValueError
    with pytest.raises(ValueError, match="Dual query keys required"):
        search_knowledge_base_sync(suspect_asset="CNC-02")

    # Providing both keys succeeds
    result = search_knowledge_base_sync(defect_symptom="scratch_vertical", suspect_asset="CNC-02")
    assert isinstance(result, RAGSearchResult)
    assert result.defect_symptom == "scratch_vertical"
    assert result.suspect_asset == "CNC-02"

    # Alias filter_machine works as suspect_asset
    result_alias = search_knowledge_base_sync(defect_symptom="short_fill", filter_machine="IM-05")
    assert result_alias.suspect_asset == "IM-05"


def test_local_hybrid_bm25_retrieval_cnc_domain():
    """Key Criterion 3: Local BM25 fallback parses CNC documents and finds exact page anchors."""
    result = search_knowledge_base_sync(
        defect_symptom="scratch_vertical",
        suspect_asset="CNC-02",
        max_results=5,
    )
    assert len(result) > 0
    assert result.confidence >= 0.80
    assert result.engine == "local_bm25"

    # Verify CNC Operating Manual Page 112 is retrieved
    manual_citations = [c for c in result if "cnc_operating_manual" in c.document_id.lower()]
    assert len(manual_citations) > 0
    assert any(c.page_number == 112 for c in manual_citations)
    p112 = next(c for c in manual_citations if c.page_number == 112)
    assert "Section 4.5" in (p112.section or "")
    assert "scratch" in p112.snippet.lower() or "insert" in p112.snippet.lower()

    # Verify Tool T07 maintenance log is retrieved
    t07_citations = [c for c in result if "t07" in c.document_id.lower()]
    assert len(t07_citations) > 0
    assert any("T07" in (c.section or "") or "T07" in c.title for c in t07_citations)


def test_local_hybrid_bm25_retrieval_injection_molding_domain():
    """Key Criterion 3: Local BM25 retrieves polymer injection molding guides and mold specs."""
    result = search_knowledge_base_sync(
        defect_symptom="short_fill",
        suspect_asset="IM-05",
        max_results=5,
    )
    assert len(result) > 0
    assert result.confidence >= 0.80

    # Ensure Injection Molding Guide or Mold Spec is present
    im_matches = [
        c
        for c in result
        if "injection_molding" in c.document_id.lower()
        or "mold_spec" in c.document_id.lower()
        or "dewpoint" in c.document_id.lower()
    ]
    assert len(im_matches) > 0


def test_asset_family_isolation():
    """Ensure CNC queries do not retrieve unrelated Injection Molding documents and vice versa."""
    # CNC query
    cnc_result = search_knowledge_base_sync(
        defect_symptom="scratch_vertical",
        suspect_asset="CNC-02",
    )
    for cit in cnc_result:
        assert "injection" not in cit.title.lower()
        assert "polymer" not in cit.title.lower()

    # IM query
    im_result = search_knowledge_base_sync(
        defect_symptom="short_fill",
        suspect_asset="IM-05",
    )
    for cit in im_result:
        assert "cnc vertical" not in cit.title.lower()
        assert "spindle" not in cit.title.lower()


def test_strict_citation_contract():
    """Key Criterion 4: Citations mandate title, page, section, snippet, score, and revision date."""
    result = search_knowledge_base_sync(
        defect_symptom="scratch_vertical",
        suspect_asset="CNC-02",
    )
    assert len(result) > 0

    for cit in result:
        assert isinstance(cit, CitationReference)
        assert cit.document_id, "Missing document_id"
        assert cit.title, "Missing title"
        assert cit.snippet, "Missing snippet text"
        assert 0.0 <= cit.relevance_score <= 1.0, f"Invalid score: {cit.relevance_score}"
        assert cit.citation, "Missing formatted citation string"
        # Must have last revised date on indexed documents
        assert cit.last_revised, f"Missing last_revised date in citation: {cit.title}"

    # Verify formatted citation string contains key attributes
    top = result[0]
    formatted = top.formatted_citation()
    assert top.title in formatted
    if top.page_number:
        assert f"p.{top.page_number}" in formatted
    if top.last_revised:
        assert top.last_revised in formatted


def test_anti_hallucination_guardrail():
    """Key Criterion 5: Zero results and confidence 0.0 when queries fail relevance threshold."""
    # Unknown fictional symptom and asset
    result = search_knowledge_base_sync(
        defect_symptom="quantum_decompression_warp",
        suspect_asset="ROBOT-99",
    )
    assert len(result) == 0
    assert result.confidence == 0.0
    assert not bool(result)
    assert "Request field evidence" in (result.summary or "")

    # Valid symptom/asset but artificially impossible threshold
    high_thresh_result = search_knowledge_base_sync(
        defect_symptom="scratch_vertical",
        suspect_asset="CNC-02",
        min_relevance=0.999,
    )
    assert len(high_thresh_result) == 0
    assert high_thresh_result.confidence == 0.0
    assert not bool(high_thresh_result)


def test_async_search_knowledge_base():
    """Verify asynchronous ADK tool function produces equivalent results."""
    import asyncio

    async def _run():
        result = await search_knowledge_base(
            defect_symptom="spindle_vibration",
            suspect_asset="CNC-02",
            max_results=3,
        )
        assert isinstance(result, RAGSearchResult)
        assert len(result) > 0
        assert result.confidence > 0.0
        assert len(result.citations) <= 3

    asyncio.run(_run())


def test_vertex_ai_search_connector_mocked():
    """Key Criterion 2: Vertex AI Search engine connector parses Discovery Engine responses."""
    mock_doc = MagicMock()
    mock_doc.id = "projects/mock/dataStores/mock/documents/manual_doc"
    mock_doc.derived_struct_data = {
        "title": "CNC Precision Manual",
        "link": "manuals/cnc_operating_manual.md",
        "snippets": [
            {
                "snippet": "Section 4.5: Spindle Vibration & Cutting Insert Diagnostics [Page 112]. "
                "Measured vibration > 4.5 mm/s on 2026-03-12."
            }
        ],
    }

    mock_search_result = MagicMock()
    mock_search_result.document = mock_doc

    mock_response = MagicMock()
    mock_response.results = [mock_search_result]

    mock_client = MagicMock()
    mock_client.search.return_value = mock_response
    mock_client.serving_config_path.return_value = "projects/test/servingConfigs/default_search"

    with (
        patch("backend.core.config.settings.gcp_project_id", "test-gcp-project"),
        patch("backend.tools.rag_search_tool._vertex_client.is_configured", return_value=True),
        patch("google.cloud.discoveryengine_v1.SearchServiceClient", return_value=mock_client),
    ):
        result = search_knowledge_base_sync(
            defect_symptom="scratch_vertical",
            suspect_asset="CNC-02",
            use_cloud=True,
        )

        assert result.engine == "vertex_ai_search"
        assert len(result) == 1
        cit = result[0]
        assert cit.title == "CNC Precision Manual"
        assert cit.page_number == 112
        assert "Section 4.5" in (cit.section or "")
        assert cit.last_revised == "2026-03-12"
        assert cit.relevance_score >= 0.85


def test_vertex_ai_search_failure_graceful_fallback():
    """Vertex AI Search failure gracefully falls back to local BM25 without raising."""
    with (
        patch("backend.core.config.settings.gcp_project_id", "test-gcp-project"),
        patch("backend.tools.rag_search_tool._vertex_client.is_configured", return_value=True),
        patch(
            "backend.tools.rag_search_tool._vertex_client.search",
            side_effect=RuntimeError("DiscoveryEngine error"),
        ),
    ):
        result = search_knowledge_base_sync(
            defect_symptom="scratch_vertical",
            suspect_asset="CNC-02",
            use_cloud=True,
        )

        # Fallback to local index succeeds
        assert result.engine == "local_bm25"
        assert len(result) > 0
        assert result.confidence > 0.0


def test_format_citations_for_prompt_helper():
    """Verify format_citations_for_prompt generates markdown citations block."""
    result = search_knowledge_base_sync(
        defect_symptom="scratch_vertical",
        suspect_asset="CNC-02",
        max_results=2,
    )
    prompt_context = format_citations_for_prompt(result.citations)
    assert "### Grounded Domain Knowledge Citations:" in prompt_context
    assert "Score:" in prompt_context
    assert "CNC" in prompt_context

    # Empty citations test
    empty_context = format_citations_for_prompt([])
    assert "Request physical field evidence" in empty_context


def test_get_oem_manual_citations_convenience():
    """Verify get_oem_manual_citations returns direct citation list for copilot."""
    citations = get_oem_manual_citations(asset="CNC-02", symptom="scratch_vertical")
    assert isinstance(citations, list)
    assert len(citations) > 0
    assert isinstance(citations[0], CitationReference)
