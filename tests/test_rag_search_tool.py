"""Unit tests for Vertex AI Search domain knowledge base RAG retriever."""

from __future__ import annotations

from collections.abc import Mapping
from unittest.mock import MagicMock, patch

import pytest

from backend.core.models import CitationReference, RAGSearchResult
from backend.tools.rag_search_tool import (
    format_citations_for_prompt,
    get_oem_manual_citations,
    search_knowledge_base,
    search_knowledge_base_sync,
)


def _create_mock_search_result(
    doc_id: str,
    title: str,
    link: str,
    snippet: str,
    page_number: int | None = None,
    section: str | None = None,
    last_revised: str | None = None,
    relevance_score: float = 0.90,
) -> MagicMock:
    """Helper to construct mocked Discovery Engine SearchResponse result items."""
    mock_doc = MagicMock()
    mock_doc.id = doc_id
    mock_doc.derived_struct_data = {
        "title": title,
        "link": link,
        "snippets": [{"snippet": snippet}],
        "page_number": page_number,
        "section": section,
        "last_revised": last_revised,
    }
    mock_item = MagicMock()
    mock_item.document = mock_doc
    mock_item.relevance_score = relevance_score
    return mock_item


def _create_mock_client(results: list[MagicMock] | None = None) -> MagicMock:
    """Helper to construct mocked SearchServiceClient with valid proto path string."""
    mock_client = MagicMock()
    mock_client.serving_config_path.return_value = "projects/test-proj/locations/global/collections/default_collection/dataStores/kaizen-store/servingConfigs/default_search"
    mock_client.search.return_value = MagicMock(results=results if results is not None else [])
    return mock_client


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

    mock_client = _create_mock_client()

    with patch(
        "backend.tools.rag_search_tool._vertex_client._get_client", return_value=mock_client
    ):
        # Providing both keys succeeds
        result = search_knowledge_base_sync(
            defect_symptom="scratch_vertical", suspect_asset="CNC-02"
        )
        assert isinstance(result, RAGSearchResult)
        assert result.defect_symptom == "scratch_vertical"
        assert result.suspect_asset == "CNC-02"

        # Alias filter_machine works as suspect_asset
        result_alias = search_knowledge_base_sync(
            defect_symptom="short_fill", filter_machine="IM-05"
        )
        assert result_alias.suspect_asset == "IM-05"


def test_vertex_ai_search_query_construction():
    """Verifies SearchServiceClient path construction and SearchRequest parameters."""
    mock_client = _create_mock_client()

    with patch(
        "backend.tools.rag_search_tool._vertex_client._get_client", return_value=mock_client
    ):
        search_knowledge_base_sync(
            defect_symptom="scratch_vertical",
            suspect_asset="CNC-02",
            query="cutting insert chatter",
            max_results=7,
        )

        mock_client.serving_config_path.assert_called_once()
        mock_client.search.assert_called_once()

        req = mock_client.search.call_args[0][0]
        assert "scratch_vertical CNC-02 cutting insert chatter" in req.query
        assert req.page_size == 7
        assert req.content_search_spec.snippet_spec.return_snippet is True


def test_vertex_ai_search_retrieval_cnc_domain():
    """Retrieves and parses CNC domain manual and maintenance log citations."""
    mock_items = [
        _create_mock_search_result(
            doc_id="cnc_manual_doc",
            title="CNC VMC-850 Operating & Maintenance Manual",
            link="gs://kaizen-kb/manuals/cnc_operating_manual.md",
            snippet="Section 4.5: Spindle Vibration & Cutting Insert Diagnostics [Page 112]. "
            "High vibration accompanied by vertical scratch defects indicates cutting insert flank wear.",
            page_number=112,
            section="Section 4.5: Spindle Vibration & Diagnostics",
            last_revised="2026-03-12",
            relevance_score=0.92,
        ),
        _create_mock_search_result(
            doc_id="cnc_t07_log",
            title="CNC-02 Tool T07 Maintenance Log",
            link="gs://kaizen-kb/maint_logs/cnc_tool_t07_maintenance.md",
            snippet="Tool T07 face mill ran 2,400 parts vs rated limit of 2,000 parts under calendar SOP-MNT-CNC-04.",
            page_number=3,
            section="Section: Tool History",
            last_revised="2026-03-12",
            relevance_score=0.88,
        ),
    ]

    mock_client = _create_mock_client(mock_items)

    with patch(
        "backend.tools.rag_search_tool._vertex_client._get_client", return_value=mock_client
    ):
        result = search_knowledge_base_sync(
            defect_symptom="scratch_vertical",
            suspect_asset="CNC-02",
        )

        assert result.engine == "vertex_ai_search"
        assert len(result) == 2
        assert result.confidence >= 0.85

        p112 = next(c for c in result if c.page_number == 112)
        assert "Section 4.5" in (p112.section or "")
        assert p112.last_revised == "2026-03-12"
        assert "scratch" in p112.snippet.lower() or "insert" in p112.snippet.lower()


def test_vertex_ai_search_retrieval_injection_molding_domain():
    """Retrieves and parses injection molding guide and mold spec citations."""
    mock_items = [
        _create_mock_search_result(
            doc_id="im_guide_doc",
            title="Polymer Injection Molding Processing Guide",
            link="gs://kaizen-kb/manuals/injection_molding_guide.md",
            snippet="Moisture in ABS resin exceeding 0.02% causes sink marks and short fill in thin-wall sections.",
            page_number=32,
            section="Section 3: Moisture & Drying Limits",
            last_revised="2026-03-12",
            relevance_score=0.90,
        )
    ]

    mock_client = _create_mock_client(mock_items)

    with patch(
        "backend.tools.rag_search_tool._vertex_client._get_client", return_value=mock_client
    ):
        result = search_knowledge_base_sync(
            defect_symptom="short_fill",
            suspect_asset="IM-05",
        )

        assert result.engine == "vertex_ai_search"
        assert len(result) == 1
        assert result.confidence >= 0.80
        assert result[0].page_number == 32
        assert "moisture" in result[0].snippet.lower()


def test_strict_citation_contract():
    """Key Criterion 4: Citations mandate title, page, section, snippet, score, and revision date."""
    mock_items = [
        _create_mock_search_result(
            doc_id="cnc_manual_doc",
            title="CNC VMC-850 Operating Manual",
            link="manuals/cnc_operating_manual.md",
            snippet="Vertical scratch defects are caused by flank wear on insert T07.",
            page_number=112,
            section="Section 4.5",
            last_revised="2026-01-15",
            relevance_score=0.94,
        )
    ]

    mock_client = _create_mock_client(mock_items)

    with patch(
        "backend.tools.rag_search_tool._vertex_client._get_client", return_value=mock_client
    ):
        result = search_knowledge_base_sync(
            defect_symptom="scratch_vertical",
            suspect_asset="CNC-02",
        )

        assert len(result) == 1
        cit = result[0]
        assert isinstance(cit, CitationReference)
        assert cit.document_id == "manuals/cnc_operating_manual.md"
        assert cit.title == "CNC VMC-850 Operating Manual"
        assert cit.page_number == 112
        assert cit.section == "Section 4.5"
        assert cit.snippet
        assert 0.0 <= cit.relevance_score <= 1.0
        assert cit.last_revised == "2026-01-15"
        assert cit.citation

        # Formatted citation check
        formatted = cit.formatted_citation()
        assert cit.title in formatted
        assert "p.112" in formatted
        assert "revised 2026-01-15" in formatted


def test_anti_hallucination_guardrail_empty_search():
    """Key Criterion 5: Zero results and confidence 0.0 when queries return no documents."""
    mock_client = _create_mock_client([])

    with patch(
        "backend.tools.rag_search_tool._vertex_client._get_client", return_value=mock_client
    ):
        result = search_knowledge_base_sync(
            defect_symptom="unknown_symptom",
            suspect_asset="CNC-02",
        )

        assert len(result) == 0
        assert result.confidence == 0.0
        assert not bool(result)
        assert "Request field evidence" in (result.summary or "")


def test_anti_hallucination_guardrail_below_relevance_threshold():
    """Items below min_relevance threshold are discarded; returns confidence 0.0."""
    mock_items = [
        _create_mock_search_result(
            doc_id="low_score_doc",
            title="General Plant Maintenance",
            link="manuals/plant.md",
            snippet="General housekeeping guidelines.",
            relevance_score=0.20,
        )
    ]

    mock_client = _create_mock_client(mock_items)

    with patch(
        "backend.tools.rag_search_tool._vertex_client._get_client", return_value=mock_client
    ):
        result = search_knowledge_base_sync(
            defect_symptom="scratch_vertical",
            suspect_asset="CNC-02",
            min_relevance=0.35,
        )

        assert len(result) == 0
        assert result.confidence == 0.0
        assert not bool(result)


def test_no_fallback_on_infrastructure_error():
    """Infrastructure/API errors raise RuntimeError when fallback_to_local is disabled."""
    mock_client = _create_mock_client()
    mock_client.search.side_effect = RuntimeError("Google Cloud Discovery Engine 503 Unavailable")

    with patch(
        "backend.tools.rag_search_tool._vertex_client._get_client", return_value=mock_client
    ):
        with pytest.raises(RuntimeError, match="Google Cloud Vertex AI Search request failed"):
            search_knowledge_base_sync(
                defect_symptom="scratch_vertical",
                suspect_asset="CNC-02",
                fallback_to_local=False,
            )


def test_vertex_ai_search_failure_graceful_fallback():
    """Vertex AI Search failure gracefully falls back to local BM25 without raising."""
    mock_client = _create_mock_client()
    mock_client.search.side_effect = RuntimeError("Google Cloud Discovery Engine 503 Unavailable")

    with patch(
        "backend.tools.rag_search_tool._vertex_client._get_client", return_value=mock_client
    ):
        result = search_knowledge_base_sync(
            defect_symptom="scratch_vertical",
            suspect_asset="CNC-02",
            fallback_to_local=True,
        )
        assert result.engine == "local_bm25"
        assert len(result) > 0
        assert result.confidence > 0.0
        assert any("T07" in c.snippet or "scratch" in c.snippet.lower() for c in result.citations)


def test_async_search_knowledge_base():
    """Verify asynchronous ADK tool function produces equivalent results."""
    import asyncio

    mock_items = [
        _create_mock_search_result(
            doc_id="cnc_manual_doc",
            title="CNC VMC-850 Manual",
            link="manuals/cnc.md",
            snippet="Spindle vibration diagnostics.",
            relevance_score=0.89,
        )
    ]

    mock_client = _create_mock_client(mock_items)

    with patch(
        "backend.tools.rag_search_tool._vertex_client._get_client", return_value=mock_client
    ):

        async def _run():
            result = await search_knowledge_base(
                defect_symptom="spindle_vibration",
                suspect_asset="CNC-02",
                max_results=3,
            )
            assert isinstance(result, RAGSearchResult)
            assert len(result) == 1
            assert result.confidence > 0.0

        asyncio.run(_run())


def test_format_citations_for_prompt_helper():
    """Verify format_citations_for_prompt generates markdown citations block."""
    citations = [
        CitationReference(
            document_id="manuals/cnc_operating_manual.md",
            title="CNC VMC-850 Manual",
            page_number=112,
            section="Section 4.5",
            snippet="High vibration indicates cutting insert wear.",
            relevance_score=0.92,
            last_revised="2026-03-12",
        )
    ]

    prompt_context = format_citations_for_prompt(citations)
    assert "### Grounded Domain Knowledge Citations:" in prompt_context
    assert "Score: 0.92" in prompt_context
    assert "CNC VMC-850 Manual" in prompt_context
    assert "p.112" in prompt_context

    # Empty citations test
    empty_context = format_citations_for_prompt([])
    assert "Request physical field evidence" in empty_context


def test_get_oem_manual_citations_convenience():
    """Verify get_oem_manual_citations returns direct citation list for copilot."""
    mock_items = [
        _create_mock_search_result(
            doc_id="cnc_manual_doc",
            title="CNC VMC-850 Manual",
            link="manuals/cnc.md",
            snippet="Cutting insert diagnostics.",
            relevance_score=0.91,
        )
    ]

    mock_client = _create_mock_client(mock_items)

    with patch(
        "backend.tools.rag_search_tool._vertex_client._get_client", return_value=mock_client
    ):
        citations = get_oem_manual_citations(asset="CNC-02", symptom="scratch_vertical")
        assert isinstance(citations, list)
        assert len(citations) == 1
        assert isinstance(citations[0], CitationReference)


def test_search_gdrive_knowledge_success():
    """Verify search_gdrive_knowledge queries Drive connector and extracts grounded citations."""
    from backend.tools.rag_search_tool import search_gdrive_knowledge

    result = search_gdrive_knowledge(
        defect_symptom="scratch_vertical",
        suspect_asset="CNC-02",
    )
    assert isinstance(result, RAGSearchResult)
    assert result.engine == "google_drive"
    assert result.confidence > 0.50
    assert len(result.citations) >= 1
    top_citation = result.citations[0]
    assert "cnc" in top_citation.title.lower()
    assert top_citation.relevance_score >= 0.50


def test_search_hybrid_knowledge_rrf():
    """Verify search_hybrid_knowledge combines Vertex AI and Google Drive citations via RRF."""
    from backend.tools.rag_search_tool import search_hybrid_knowledge

    mock_items = [
        _create_mock_search_result(
            doc_id="cnc_manual_doc",
            title="CNC VMC-850 Manual",
            link="manuals/cnc.md",
            snippet="Spindle vibration diagnostics with T07 insert WNMG-080408.",
            relevance_score=0.91,
        )
    ]
    mock_client = _create_mock_client(mock_items)

    with patch(
        "backend.tools.rag_search_tool._vertex_client._get_client", return_value=mock_client
    ):
        result = search_hybrid_knowledge(
            defect_symptom="scratch_vertical",
            suspect_asset="CNC-02",
        )
        assert isinstance(result, RAGSearchResult)
        assert result.engine == "hybrid"
        assert result.confidence > 0.60
        assert len(result.citations) >= 1
        # Chunks containing exact token WNMG-080408 receive boost
        assert any("080408" in c.snippet for c in result.citations)


def test_progressive_relaxation():
    """Verify get_asset_hierarchy generates progressive relaxation tiers."""
    from backend.tools.rag_search_tool import get_asset_hierarchy

    cnc_tiers = get_asset_hierarchy("CNC-02")
    assert len(cnc_tiers) == 3
    assert cnc_tiers[0] == ("instance", "CNC-02")
    assert cnc_tiers[1] == ("model", "VMC-850")
    assert cnc_tiers[2] == ("family", "CNC Milling Center")

    im_tiers = get_asset_hierarchy("IM-05")
    assert len(im_tiers) == 3
    assert im_tiers[0] == ("instance", "IM-05")
    assert im_tiers[1] == ("model", "IM-05")


def test_multi_query_expansion():
    """Verify expand_symptom_queries generates technical variations."""
    from backend.tools.rag_search_tool import expand_symptom_queries

    queries = expand_symptom_queries("scratch_vertical", "CNC-02")
    assert len(queries) >= 3
    # Checks for OEM terminology
    assert any("flank wear" in q for q in queries)


# =============================================================================
# TKT-069 / Issue #267 — drive-ingested alarm-code coverage
# =============================================================================


def test_symptom_synonyms_advertise_drive_alarm_codes():
    """SYMPTOM_SYNONYMS must include the 6 drive-alarm tokens (45/46/50/51/52/53)
    so RAG queries like ``alarm 53 CNC-02`` map to a real symptom group (Tech Lead D4)."""

    from backend.tools.rag_search_tool import SYMPTOM_SYNONYMS

    drive_alarm_codes = ("45", "46", "50", "51", "52", "53")
    for code in drive_alarm_codes:
        token = f"alarm {code}"
        assert token in SYMPTOM_SYNONYMS["tool_wear"] or token in SYMPTOM_SYNONYMS[
            "spindle_vibration"
        ], f"alarm token {token!r} missing from SYMPTOM_SYNONYMS"

    # Verify the Tech Lead mapping.
    assert SYMPTOM_SYNONYMS["tool_wear"] >= {"alarm_45", "alarm_46", "alarm_50", "alarm_51"}
    assert SYMPTOM_SYNONYMS["spindle_vibration"] >= {"alarm_52", "alarm_53"}


def test_local_bm25_retriever_includes_drive_documents(tmp_path, monkeypatch):
    """After sync_gdrive_kb writes drive/* Markdown, the BM25 retriever must pick
    them up so 'alarm 53' queries match the new 8D case citations (Tech Lead S4 AC)."""

    from backend.tools.rag_search_tool import LocalBM25Retriever
    from scripts.sync_gdrive_kb import (
        EightDRecord,
        Redactor,
        render_8d_markdown,
    )

    # Stage a small knowledge_base under tmp_path with one drive/* 8D record.
    kb_root = tmp_path / "kb"
    manuals_dir = kb_root / "manuals"
    drive_dir = kb_root / "drive" / "past_8d_reports"
    manuals_dir.mkdir(parents=True)
    drive_dir.mkdir(parents=True)

    record = EightDRecord(
        record_id="SYN-8D-001",
        machine_id="CNC-SIM-02",
        machine_model="drive_oem_a drive_series_a",
        incident_timestamp="2026-09-04T09:15:00+07:00",
        alarm_code=53,
        fault_category="Drive Alarm 53",
        operating_status="FAULT",
        problem_description="Drive-side vibration alarm tripped on spindle.",
        containment_action="Quarantine.",
        root_cause_occurrence="Bearing wear.",
        root_cause_escape="No trend review.",
        evidence="Trend log.",
        permanent_corrective_action="Replace bearing.",
        action_owner="Maintenance engineer",
        due_date="2026-09-09",
        implementation_evidence="Bearing replaced.",
        effectiveness_metric="Vibration < threshold.",
        effectiveness_result="Stable.",
        observation_window_days=7,
        prevent_recurrence="Add trend review.",
        closure_lessons="Lesson shared.",
    )
    redactor = Redactor()
    md = render_8d_markdown(record, redactor=redactor)
    (drive_dir / "8D_SYN-8D-001.md").write_text(md, encoding="utf-8")
    # Seed a trivial manual so the retriever has at least 2 chunks to dedupe.
    (manuals_dir / "blank.md").write_text(
        "---\ntitle: blank\ncategory: manual\n---\n\nplaceholder body\n", encoding="utf-8"
    )

    retriever = LocalBM25Retriever(data_dir=kb_root)
    retriever.index_corpus()

    # Drive doc must appear in the chunk list now that the path filter is relaxed.
    document_ids = {chunk.document_id for chunk in retriever.chunks}
    assert any(doc_id.startswith("drive/past_8d_reports/") for doc_id in document_ids), (
        "LocalBM25Retriever should index data/knowledge_base/drive/ after TKT-069"
    )


# =============================================================================
# TKT-069 / Issue #292 — alarm-code value-token routing & cross-family substring isolation
# =============================================================================


def test_resolve_dual_keys_alarm_code_value_token_routes_to_spindle_vibration():
    """A query containing the bare value-token ``53`` (no ``alarm`` prefix)
    must still route to spindle_vibration, because ``alarm 53`` is present
    in the SYMPTOM_SYNONYMS for spindle_vibration (Tech Lead D5 AC).
    """

    from backend.tools.rag_search_tool import _resolve_dual_keys

    symptom, asset, resolved_query = _resolve_dual_keys(
        suspect_asset="CNC-02",
        query="Find the case for alarm 53 on the spindle drive.",
    )

    assert symptom == "spindle_vibration", (
        f"alarm 53 must resolve to spindle_vibration, got {symptom!r}"
    )
    assert asset == "CNC-02"
    assert resolved_query == "Find the case for alarm 53 on the spindle drive."


def test_resolve_dual_keys_alarm_45_routes_to_tool_wear():
    """``alarm 45`` is a Fan Stop / tool-wear drive alarm and must route to
    tool_wear via the SYMPTOM_SYNONYMS entry, not collapse to a bare ``45``
    value token (Tech Lead D5 AC).
    """

    from backend.tools.rag_search_tool import _resolve_dual_keys

    symptom, asset, _ = _resolve_dual_keys(
        suspect_asset="CNC-02",
        query="alarm 45 trip on tool magazine — what is the SOP?",
    )

    assert symptom == "tool_wear", (
        f"alarm 45 must resolve to tool_wear, got {symptom!r}"
    )
    assert asset == "CNC-02"


def test_compute_asset_score_does_not_drop_drive_8d_for_cnc_queries():
    """A drive-side 8D case chunk with machines=['CNC-02'] but an asset id like
    ``cnc_8d_case_001`` (an external Drive filing id) must not be zero-scored by
    the cross-family substring check. Only true cross-family membership (CNC
    query against injection-molding manual) should still return 0.0 (Tech Lead
    D5 AC + Regression S4).
    """

    from backend.tools.rag_search_tool import KnowledgeChunk, LocalBM25Retriever

    retriever = LocalBM25Retriever()

    drive_chunk = KnowledgeChunk(
        chunk_id="drive_cnc_8d_case_001_sec_0",
        document_id="drive/past_8d_reports/cnc_8d_case_001.md",
        title="CNC-02 Drive 8D Case",
        category="8d_report",
        machines=["CNC-02"],
        component="spindle_drive",
        page_number=1,
        section="Containment",
        snippet="Drive-side vibration alarm tripped during machining.",
        last_revised="2026-09-04",
        tokens=["cnc-02", "drive", "vibration", "alarm"],
    )

    # CNC query against a CNC chunk with a Drive filing id containing ``cnc``
    # as a substring of ``cnc_8d_case_001`` — must NOT return 0.0.
    score = retriever._compute_asset_score(drive_chunk, "CNC-02", asset_family="cnc")
    assert score > 0.0, (
        f"asset_score should be >0 for a CNC chunk tagged to CNC-02, got {score}"
    )

    # And the negative case: an injection-molding manual must still hard-isolate
    # from a CNC query (the original isolation invariant is preserved).
    im_chunk = KnowledgeChunk(
        chunk_id="im_manual_sec_0",
        document_id="manuals/injection_molding_guide.md",
        title="Polymer Injection Molding Processing Guide",
        category="manual",
        machines=["IM-05"],
        component=None,
        page_number=None,
        section=None,
        snippet="Resin drying guide.",
        last_revised="2026-03-12",
        tokens=["im-05", "resin", "dryer"],
    )
    im_score = retriever._compute_asset_score(im_chunk, "CNC-02", asset_family="cnc")
    assert im_score == 0.0, (
        f"cross-family incompatibility must still return 0.0 (got {im_score}) "
        "so CNC queries never pick up IM-05 manuals"
    )


class _ProtoMap(Mapping):
    """Stands in for proto-plus MapComposite (a Mapping that is not a dict)."""

    def __init__(self, data: dict) -> None:
        self._data = data

    def __getitem__(self, key):
        return self._data[key]

    def __iter__(self):
        return iter(self._data)

    def __len__(self) -> int:
        return len(self._data)


def test_vertex_search_reads_proto_struct_data_and_cleans_snippets():
    """Live Discovery Engine returns Struct maps, not dicts; title/link/snippet must survive."""
    from backend.tools.rag_search_tool import VertexAISearchClient

    derived = _ProtoMap(
        {
            "title": "drive__maint_logs__ML-SYN-0007",
            "link": "gs://kaizen-lab-kb/kb/drive__maint_logs__ML-SYN-0007.txt",
            "snippets": [_ProtoMap({"snippet": "Excessive <b>error</b> &quot;2&quot;"})],
        }
    )
    result = MagicMock()
    result.document.derived_struct_data = derived
    result.document.struct_data = None
    result.document.id = "eaca0d42"
    result.relevance_score = None
    client = MagicMock()
    client.serving_config_path.return_value = (
        "projects/p/locations/global/dataStores/d/servingConfigs/default_search"
    )
    client.search.return_value.results = [result]

    vertex = VertexAISearchClient()
    vertex._client = client
    citations = vertex.search("error", "CNC-02")

    assert citations[0].title == "drive__maint_logs__ML-SYN-0007"
    assert citations[0].document_id.endswith("drive__maint_logs__ML-SYN-0007.txt")
    assert citations[0].snippet == 'Excessive error "2"'
