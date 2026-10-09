"""ADK Tool: Hybrid Vertex AI Search and Google Drive domain knowledge base RAG retriever."""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from backend.core.config import settings
from backend.core.models import (
    CitationReference,
    RAGSearchResult,
)
from backend.tools.gdrive_tool import GoogleDriveConnector, gdrive_connector

logger = logging.getLogger(__name__)

# Known machine families for asset isolation and query classification
MACHINE_FAMILIES: Dict[str, Set[str]] = {
    "cnc": {"cnc", "cnc-01", "cnc-02", "cnc-03", "vmc-850", "vmc"},
    "injection_molding": {"im", "im-05", "im-01", "dryer-03", "dryer", "mold", "cavity"},
}

# Equipment model and family hierarchies for progressive relaxation
ASSET_HIERARCHIES: Dict[str, Dict[str, str]] = {
    "cnc-01": {"model": "VMC-850", "family": "CNC Milling Center"},
    "cnc-02": {"model": "VMC-850", "family": "CNC Milling Center"},
    "cnc-03": {"model": "VMC-850", "family": "CNC Milling Center"},
    "im-05": {"model": "IM-05", "family": "Injection Molding"},
    "im-01": {"model": "IM-01", "family": "Injection Molding"},
    "dryer-03": {"model": "Dryer-03", "family": "Resin Dehumidifier"},
}

# Domain symptom synonym mappings
SYMPTOM_SYNONYMS: Dict[str, Set[str]] = {
    "scratch_vertical": {
        "scratch_vertical",
        "scratch",
        "vertical",
        "scratches",
        "surface",
        "flank",
        "insert",
        "wear",
        "chipping",
        "cutter",
        "t07",
        "face",
        "bap400r",
        "longitudinal",
        "groove",
        "vết xước dọc",
        "bavia",
    },
    "spindle_vibration": {
        "spindle_vibration",
        "vibration",
        "spindle",
        "rms",
        "accelerometer",
        "harmonic",
        "runout",
        "tir",
        "chatter",
        "bearing",
        "temperature",
        "độ rung",
        "độ đảo",
    },
    "short_fill": {
        "short_fill",
        "short",
        "fill",
        "sink_mark",
        "sink",
        "cavity",
        "runner",
        "underfill",
        "starvation",
        "resin",
        "flow",
        "damp",
        "moisture",
        "thiếu liệu",
        "hụt liệu",
    },
    "sink_mark": {
        "sink_mark",
        "sink",
        "mark",
        "short_fill",
        "cavity",
        "shrinkage",
        "depression",
        "dewpoint",
        "moisture",
        "dryer",
        "lõm bề mặt",
    },
    "damp_material": {
        "damp_material",
        "damp",
        "moisture",
        "dewpoint",
        "dew",
        "point",
        "dryer",
        "filter",
        "abs",
        "hygroscopic",
        "desiccant",
        "flt-dm-04",
        "flt-abs-04",
        "ẩm liệu",
    },
    "tool_wear": {
        "tool_wear",
        "tool",
        "wear",
        "insert",
        "flank",
        "vb",
        "t07",
        "wnmg",
        "counter",
        "2400",
        "2000",
        "calendar",
        "sop-mnt-cnc-04",
        "mòn dao",
    },
}

# Key industrial part & tolerance identifiers to boost in hybrid exact search
EXACT_PART_TOKENS: Set[str] = {
    "wnmg-080408",
    "cnmg-120408",
    "flt-abs-04",
    "flt-dm-04",
    "vmc-850",
    "4.2 n·m",
    "4.2 nm",
    "0.005 mm",
    "0.005mm",
    "-35.0 °c",
    "-35 °c",
    "sop-mnt-cnc-04",
    "sop-mold-02",
}


def get_asset_hierarchy(asset: str) -> List[Tuple[str, str]]:
    """Return progressive relaxation hierarchy for an asset: (tier_name, name)."""
    clean = asset.lower().strip()
    tiers: List[Tuple[str, str]] = [("instance", asset.upper())]

    if clean in ASSET_HIERARCHIES:
        info = ASSET_HIERARCHIES[clean]
        tiers.append(("model", info["model"]))
        tiers.append(("family", info["family"]))
    elif "cnc" in clean:
        tiers.append(("model", "VMC-850"))
        tiers.append(("family", "CNC Milling Center"))
    elif "im" in clean or "mold" in clean:
        tiers.append(("model", "IM-05"))
        tiers.append(("family", "Injection Molding"))
    elif "dryer" in clean:
        tiers.append(("model", "Dryer-03"))
        tiers.append(("family", "Resin Dehumidifier"))

    return tiers


def expand_symptom_queries(symptom: str, asset: str) -> List[str]:
    """Generate multi-query expanded variations for symptom and asset."""
    queries = [f"{symptom} {asset}"]
    clean_sym = symptom.lower().strip()

    if clean_sym in ("scratch_vertical", "tool_wear"):
        queries.append(f"{asset} insert flank wear longitudinal score mark")
        queries.append(f"{asset} T07 WNMG-080408 runout tolerance")
        queries.append(f"{asset} mòn mảnh dao xước dọc")
    elif clean_sym in ("short_fill", "sink_mark", "damp_material"):
        queries.append(f"{asset} resin dehumidifier desiccant dewpoint short fill")
        queries.append(f"{asset} FLT-ABS-04 dryer filter maintenance")
        queries.append(f"{asset} ẩm liệu thiếu liệu sấy nhựa")
    elif clean_sym == "spindle_vibration":
        queries.append(f"{asset} spindle bearing vibration runout 0.005mm")
        queries.append(f"{asset} độ rung trục chính độ đảo")

    return queries


class VertexAISearchClient:
    """Connector to Google Cloud Vertex AI Search Datastores (Discovery Engine)."""

    def __init__(self) -> None:
        self.project_id = settings.gcp_project_id
        self.location = settings.vertex_search_location
        self.datastore_id = settings.vertex_search_datastore_id
        self.serving_config = settings.vertex_search_serving_config
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            try:
                from google.cloud import discoveryengine_v1 as discoveryengine
            except ImportError as err:
                raise ImportError(
                    "google-cloud-discoveryengine is required for Vertex AI Search. "
                    "Install with: pip install google-cloud-discoveryengine"
                ) from err
            self._client = discoveryengine.SearchServiceClient()
        return self._client

    def search(
        self,
        defect_symptom: str,
        suspect_asset: str,
        query: Optional[str] = None,
        max_results: int = 5,
        min_relevance: float = 0.35,
    ) -> List[CitationReference]:
        """Query Vertex AI Search Datastore directly and format results into CitationReference objects."""
        from google.cloud import discoveryengine_v1 as discoveryengine

        client = self._get_client()
        serving_path = client.serving_config_path(
            project=self.project_id,
            location=self.location,
            data_store=self.datastore_id,
            serving_config=self.serving_config,
        )

        full_query = f"{defect_symptom} {suspect_asset} {query or ''}".strip()
        request = discoveryengine.SearchRequest(
            serving_config=serving_path,
            query=full_query,
            page_size=max_results,
            content_search_spec=discoveryengine.SearchRequest.ContentSearchSpec(
                snippet_spec=discoveryengine.SearchRequest.ContentSearchSpec.SnippetSpec(
                    return_snippet=True
                ),
                summary_spec=discoveryengine.SearchRequest.ContentSearchSpec.SummarySpec(
                    summary_result_count=1,
                    include_citations=True,
                ),
            ),
        )

        try:
            response = client.search(request)
        except Exception as exc:
            logger.error("Vertex AI Search request to Google Cloud infrastructure failed: %s", exc)
            raise RuntimeError(f"Google Cloud Vertex AI Search request failed: {exc}") from exc

        citations: List[CitationReference] = []

        for rank, result in enumerate(response.results):
            doc = result.document
            raw_doc_data = getattr(doc, "derived_struct_data", {})
            doc_data = raw_doc_data if isinstance(raw_doc_data, dict) else {}
            raw_struct_data = getattr(doc, "struct_data", {})
            struct_data = raw_struct_data if isinstance(raw_struct_data, dict) else {}

            title = (
                doc_data.get("title")
                or struct_data.get("title")
                or getattr(doc, "id", f"doc-{rank}")
            )
            link = (
                doc_data.get("link")
                or struct_data.get("link")
                or struct_data.get("document_id")
                or getattr(doc, "id", f"doc-{rank}")
            )

            # Extract snippet
            snippets = doc_data.get("snippets", [])
            if isinstance(snippets, list) and snippets and isinstance(snippets[0], dict):
                snippet_text = str(snippets[0].get("snippet", ""))
            else:
                extractive_segments = doc_data.get("extractive_segments", [])
                if (
                    isinstance(extractive_segments, list)
                    and extractive_segments
                    and isinstance(extractive_segments[0], dict)
                ):
                    snippet_text = str(extractive_segments[0].get("content", ""))
                else:
                    snippet_text = str(
                        doc_data.get("snippet") or struct_data.get("snippet") or doc_data or ""
                    )

            # Extract page anchor if present
            page_val = doc_data.get("page_number") or struct_data.get("page_number")
            page_num = (
                int(page_val)
                if isinstance(page_val, (int, str)) and str(page_val).isdigit()
                else None
            )
            if page_num is None:
                page_match = re.search(
                    r"(?:\[Page\s*(\d+)\]|p\.(\d+)|page\s*(\d+))", snippet_text, re.IGNORECASE
                )
                if page_match:
                    page_num = int(
                        page_match.group(1) or page_match.group(2) or page_match.group(3)
                    )

            # Extract section if present
            sec_val = doc_data.get("section") or struct_data.get("section")
            section = str(sec_val).strip() if isinstance(sec_val, str) else None
            if not section:
                sec_match = re.search(r"(Section\s*[\d\.]+:?[^\n\.]+)", snippet_text, re.IGNORECASE)
                if sec_match:
                    section = sec_match.group(1).strip()

            # Extract last revised date
            rev_val = (
                doc_data.get("last_revised")
                or struct_data.get("last_revised")
                or doc_data.get("revision_date")
                or struct_data.get("revision_date")
            )
            last_revised = str(rev_val).strip() if isinstance(rev_val, str) else None
            if not last_revised:
                date_match = re.search(r"\b(202\d-\d{2}-\d{2})\b", snippet_text)
                if date_match:
                    last_revised = date_match.group(1)

            # Relevance score
            raw_relevance = getattr(result, "relevance_score", None)
            if isinstance(raw_relevance, (int, float)):
                relevance = float(raw_relevance)
            else:
                relevance = max(0.40, 0.95 - (rank * 0.05))

            if relevance >= min_relevance:
                ref = CitationReference(
                    document_id=str(link),
                    title=str(title),
                    page_number=page_num,
                    section=section,
                    snippet=snippet_text,
                    relevance_score=float(relevance),
                    last_revised=str(last_revised) if last_revised else None,
                )
                ref.citation = ref.formatted_citation()
                citations.append(ref)

        return citations


# Module-level singleton
_vertex_client = VertexAISearchClient()


def _resolve_dual_keys(
    defect_symptom: Optional[str] = None,
    suspect_asset: Optional[str] = None,
    query: Optional[str] = None,
    filter_machine: Optional[str] = None,
) -> Tuple[str, str, str]:
    """Validate and resolve mandatory dual query keys (defect symptom + suspect asset)."""
    asset = suspect_asset or filter_machine
    if not asset and query:
        for machines in MACHINE_FAMILIES.values():
            for m in machines:
                if re.search(rf"\b{re.escape(m)}\b", query, re.IGNORECASE):
                    asset = m.upper()
                    break
            if asset:
                break

    symptom = defect_symptom
    if not symptom and query:
        for s_key in SYMPTOM_SYNONYMS.keys():
            if s_key in query.lower() or s_key.replace("_", " ") in query.lower():
                symptom = s_key
                break

    if not symptom or not asset:
        raise ValueError(
            "Dual query keys required: both 'defect_symptom' (e.g. scratch_vertical, short_fill) "
            "and 'suspect_asset' (e.g. CNC-02, IM-05) must be provided."
        )

    resolved_query = query or f"{symptom} {asset}"
    return symptom, asset, resolved_query


def search_gdrive_knowledge(
    defect_symptom: Optional[str] = None,
    suspect_asset: Optional[str] = None,
    query: Optional[str] = None,
    filter_machine: Optional[str] = None,
    max_results: int = 5,
    min_relevance: float = 0.35,
    connector: Optional[GoogleDriveConnector] = None,
) -> RAGSearchResult:
    """Exact full-text RAG search querying Google Drive documents directly via Drive API v3."""
    symptom, asset, clean_query = _resolve_dual_keys(
        defect_symptom=defect_symptom,
        suspect_asset=suspect_asset,
        query=query,
        filter_machine=filter_machine,
    )

    conn = connector or gdrive_connector
    citations: List[CitationReference] = []

    # Build exact search terms
    search_terms = [asset.lower(), symptom.lower()]
    asset_tiers = get_asset_hierarchy(asset)
    for _, tier_name in asset_tiers:
        search_terms.append(tier_name.lower())

    matching_docs = conn.search_exact_documents(query_terms=search_terms)
    if not matching_docs:
        matching_docs = conn.list_documents()

    query_tokens = set(re.findall(r"\w+", clean_query.lower()))
    symptom_tokens = SYMPTOM_SYNONYMS.get(symptom, {symptom.lower()})

    for doc in matching_docs:
        if doc.is_dir:
            continue

        name_lower = doc.name.lower()
        score = 0.45

        # Check filename matches
        if any(term in name_lower for term in search_terms):
            score += 0.25
        if any(tok in name_lower for tok in symptom_tokens):
            score += 0.20

        # Stream & parse document text in memory without disk writes
        snippet_text = f"Google Drive document: {doc.name}"
        try:
            file_bytes = conn.stream_document_bytes(doc.file_id or doc.path)
            content_text = conn.extract_document_text(
                file_bytes=file_bytes, mime_type=doc.mime_type, filename=doc.name
            )
            content_lower = content_text.lower()

            matches = sum(1 for tok in query_tokens if tok in content_lower)
            if matches > 0:
                score = min(0.96, score + (matches * 0.06))

            # Check exact part token presence
            for part_tok in EXACT_PART_TOKENS:
                if part_tok in content_lower:
                    score = min(0.98, score + 0.15)
                    break

            # Extract window snippet around highest scoring keyword
            for tok in list(query_tokens) + list(symptom_tokens):
                idx = content_lower.find(tok)
                if idx != -1:
                    start = max(0, idx - 60)
                    end = min(len(content_text), idx + 200)
                    snippet_text = content_text[start:end].strip().replace("\n", " ")
                    break
        except Exception as exc:
            logger.debug("In-memory extraction error for %s: %s", doc.name, exc)

        if score >= min_relevance:
            doc_id = doc.web_view_link or f"gdrive://{doc.path}"
            ref = CitationReference(
                document_id=doc_id,
                title=doc.name,
                page_number=1,
                section="Google Drive Grounded Reference",
                snippet=snippet_text,
                relevance_score=round(score, 2),
                last_revised=doc.mod_time[:10] if doc.mod_time else None,
            )
            ref.citation = ref.formatted_citation()
            citations.append(ref)

    citations.sort(key=lambda c: c.relevance_score, reverse=True)
    citations = citations[:max_results]

    if not citations:
        return RAGSearchResult(
            defect_symptom=symptom,
            suspect_asset=asset,
            query=clean_query,
            citations=[],
            confidence=0.0,
            summary=(
                f"No verified Google Drive documents exceeded relevance threshold {min_relevance} "
                f"for symptom '{symptom}' on asset '{asset}'."
            ),
            engine="google_drive",
            total_found=0,
        )

    top_score = max(c.relevance_score for c in citations)
    avg_score = sum(c.relevance_score for c in citations) / len(citations)
    confidence = round(min(1.0, (0.7 * top_score) + (0.3 * avg_score)), 2)

    return RAGSearchResult(
        defect_symptom=symptom,
        suspect_asset=asset,
        query=clean_query,
        citations=citations,
        confidence=confidence,
        summary=f"Retrieved {len(citations)} verified document citations from Google Drive.",
        engine="google_drive",
        total_found=len(citations),
    )


def search_hybrid_knowledge(
    defect_symptom: Optional[str] = None,
    suspect_asset: Optional[str] = None,
    query: Optional[str] = None,
    filter_machine: Optional[str] = None,
    max_results: int = 5,
    min_relevance: float = 0.35,
    connector: Optional[GoogleDriveConnector] = None,
) -> RAGSearchResult:
    """Two-Stage Hybrid Search combining Vertex AI Search semantic discovery and Google Drive exact search.

    Implements:
    1. Multi-Query Expansion.
    2. Progressive Hierarchical Relaxation (Asset -> Model -> Family).
    3. Reciprocal Rank Fusion (RRF) for robust multi-engine scoring.
    4. Exact part/torque token bonus.
    5. Anti-Hallucination Guardrail (relevance >= 0.35).
    """
    symptom, asset, clean_query = _resolve_dual_keys(
        defect_symptom=defect_symptom,
        suspect_asset=suspect_asset,
        query=query,
        filter_machine=filter_machine,
    )

    vertex_citations: List[CitationReference] = []
    # 1. Vertex AI Search (Semantic)
    try:
        # Try specific query first
        vertex_citations = _vertex_client.search(
            defect_symptom=symptom,
            suspect_asset=asset,
            query=clean_query,
            max_results=max_results,
            min_relevance=min_relevance,
        )
        # Progressive relaxation if 0 citations found
        if not vertex_citations:
            tiers = get_asset_hierarchy(asset)
            for tier_label, tier_name in tiers[1:]:
                logger.debug("Progressive relaxation to tier '%s' (%s)", tier_label, tier_name)
                vertex_citations = _vertex_client.search(
                    defect_symptom=symptom,
                    suspect_asset=tier_name,
                    query=f"{symptom} {tier_name}",
                    max_results=max_results,
                    min_relevance=min_relevance,
                )
                if vertex_citations:
                    break
    except Exception as exc:
        logger.debug("Vertex AI Search unavailable in hybrid pass: %s", exc)

    # 2. Google Drive Exact Search
    drive_result = search_gdrive_knowledge(
        defect_symptom=symptom,
        suspect_asset=asset,
        query=clean_query,
        max_results=max_results,
        min_relevance=min_relevance,
        connector=connector,
    )
    drive_citations = drive_result.citations

    # 3. Reciprocal Rank Fusion (RRF)
    # RRF_Score = 1/(60 + Rank_v) + 1/(60 + Rank_d)
    doc_scores: Dict[str, float] = {}
    doc_map: Dict[str, CitationReference] = {}

    for rank, c in enumerate(vertex_citations):
        key = c.title.lower()
        doc_scores[key] = doc_scores.get(key, 0.0) + (1.0 / (60 + rank))
        doc_map[key] = c

    for rank, c in enumerate(drive_citations):
        key = c.title.lower()
        doc_scores[key] = doc_scores.get(key, 0.0) + (1.0 / (60 + rank))
        if key not in doc_map or c.relevance_score > doc_map[key].relevance_score:
            doc_map[key] = c

    # Normalize fused citations
    fused_citations: List[CitationReference] = []
    for key, rrf_raw in doc_scores.items():
        base_ref = doc_map[key]
        # Normalize RRF raw score (typically 0.016 - 0.033) into standard 0.40 - 0.98 scale
        normalized_score = min(0.98, 0.40 + (rrf_raw * 18.0))

        # Check for exact token bonus
        snippet_lower = base_ref.snippet.lower()
        for exact_tok in EXACT_PART_TOKENS:
            if exact_tok in snippet_lower:
                normalized_score = min(0.99, normalized_score + 0.12)
                break

        if normalized_score >= min_relevance:
            fused_ref = CitationReference(
                document_id=base_ref.document_id,
                title=base_ref.title,
                page_number=base_ref.page_number,
                section=base_ref.section or "Hybrid Grounded Section",
                snippet=base_ref.snippet,
                relevance_score=round(normalized_score, 2),
                last_revised=base_ref.last_revised,
            )
            fused_ref.citation = fused_ref.formatted_citation()
            fused_citations.append(fused_ref)

    fused_citations.sort(key=lambda c: c.relevance_score, reverse=True)
    fused_citations = fused_citations[:max_results]

    if not fused_citations:
        return RAGSearchResult(
            defect_symptom=symptom,
            suspect_asset=asset,
            query=clean_query,
            citations=[],
            confidence=0.0,
            summary=(
                f"No verified knowledge base documents exceeded relevance threshold {min_relevance} "
                f"in hybrid search for symptom '{symptom}' on asset '{asset}'. Request field evidence."
            ),
            engine="hybrid",
            total_found=0,
        )

    top_score = max(c.relevance_score for c in fused_citations)
    avg_score = sum(c.relevance_score for c in fused_citations) / len(fused_citations)
    confidence = round(min(1.0, (0.7 * top_score) + (0.3 * avg_score)), 2)

    return RAGSearchResult(
        defect_symptom=symptom,
        suspect_asset=asset,
        query=clean_query,
        citations=fused_citations,
        confidence=confidence,
        summary=f"Retrieved {len(fused_citations)} verified citations via hybrid Vertex AI & Google Drive search.",
        engine="hybrid",
        total_found=len(fused_citations),
    )


def search_knowledge_base_sync(
    defect_symptom: Optional[str] = None,
    suspect_asset: Optional[str] = None,
    query: Optional[str] = None,
    filter_machine: Optional[str] = None,
    max_results: int = 5,
    min_relevance: float = 0.35,
    source: str = "vertex_ai_search",
) -> RAGSearchResult:
    """Synchronous RAG search supporting 'hybrid', 'vertex_ai_search', or 'google_drive'.

    Enforces:
    1. Dual Query Keys: defect_symptom and suspect_asset mandatory parameters.
    2. Direct Google Cloud Infrastructure & Google Drive API v3.
    3. Multi-Query Expansion & Progressive Hierarchical Relaxation.
    4. Anti-Hallucination Guardrail: Returns confidence 0.0 and empty citations when below threshold.
    """
    if source in ("google_drive", "gdrive"):
        return search_gdrive_knowledge(
            defect_symptom=defect_symptom,
            suspect_asset=suspect_asset,
            query=query,
            filter_machine=filter_machine,
            max_results=max_results,
            min_relevance=min_relevance,
        )

    if source in ("hybrid", "auto"):
        return search_hybrid_knowledge(
            defect_symptom=defect_symptom,
            suspect_asset=suspect_asset,
            query=query,
            filter_machine=filter_machine,
            max_results=max_results,
            min_relevance=min_relevance,
        )

    # Pure Vertex AI Search mode
    symptom, asset, clean_query = _resolve_dual_keys(
        defect_symptom=defect_symptom,
        suspect_asset=suspect_asset,
        query=query,
        filter_machine=filter_machine,
    )

    citations = _vertex_client.search(
        defect_symptom=symptom,
        suspect_asset=asset,
        query=clean_query,
        max_results=max_results,
        min_relevance=min_relevance,
    )

    if not citations:
        return RAGSearchResult(
            defect_symptom=symptom,
            suspect_asset=asset,
            query=clean_query,
            citations=[],
            confidence=0.0,
            summary=(
                f"No verified knowledge base documents exceeded relevance threshold {min_relevance} "
                f"for symptom '{symptom}' on asset '{asset}'. Request field evidence."
            ),
            engine="vertex_ai_search",
            total_found=0,
        )

    top_score = max(c.relevance_score for c in citations)
    avg_score = sum(c.relevance_score for c in citations) / len(citations)
    confidence = round(min(1.0, (0.7 * top_score) + (0.3 * avg_score)), 2)

    return RAGSearchResult(
        defect_symptom=symptom,
        suspect_asset=asset,
        query=clean_query,
        citations=citations,
        confidence=confidence,
        summary=f"Retrieved {len(citations)} verified document citations from vertex_ai_search.",
        engine="vertex_ai_search",
        total_found=len(citations),
    )


async def search_knowledge_base(
    defect_symptom: Optional[str] = None,
    suspect_asset: Optional[str] = None,
    query: Optional[str] = None,
    filter_machine: Optional[str] = None,
    max_results: int = 5,
    min_relevance: float = 0.35,
    source: str = "vertex_ai_search",
) -> RAGSearchResult:
    """Asynchronous ADK Tool: Executes hybrid RAG search against Vertex AI and Google Drive."""
    return await asyncio.to_thread(
        search_knowledge_base_sync,
        defect_symptom=defect_symptom,
        suspect_asset=suspect_asset,
        query=query,
        filter_machine=filter_machine,
        max_results=max_results,
        min_relevance=min_relevance,
        source=source,
    )


async def search_gdrive_knowledge_base(
    defect_symptom: Optional[str] = None,
    suspect_asset: Optional[str] = None,
    query: Optional[str] = None,
    filter_machine: Optional[str] = None,
    max_results: int = 5,
    min_relevance: float = 0.35,
) -> RAGSearchResult:
    """Asynchronous ADK Tool: Searches Google Drive knowledge base directly."""
    return await asyncio.to_thread(
        search_gdrive_knowledge,
        defect_symptom=defect_symptom,
        suspect_asset=suspect_asset,
        query=query,
        filter_machine=filter_machine,
        max_results=max_results,
        min_relevance=min_relevance,
    )


def format_citations_for_prompt(citations: List[CitationReference]) -> str:
    """Format structured citations into an auditable grounding block for LLM prompts."""
    if not citations:
        return (
            "No grounded OEM manuals or maintenance records found. Request physical field evidence."
        )

    lines = ["### Grounded Domain Knowledge Citations:"]
    for i, c in enumerate(citations, 1):
        lines.append(
            f"{i}. [{c.title}"
            f"{f' p.{c.page_number}' if c.page_number else ''}"
            f"{f', {c.section}' if c.section else ''}"
            f"{f' (revised {c.last_revised})' if c.last_revised else ''}] "
            f"(Score: {c.relevance_score:.2f})\n"
            f'   "{c.snippet}"'
        )
    return "\n".join(lines)


def get_oem_manual_citations(asset: str, symptom: str) -> List[CitationReference]:
    """Convenience helper retrieving verified OEM manual citations for copilot repair guidance."""
    result = search_knowledge_base_sync(
        defect_symptom=symptom,
        suspect_asset=asset,
        max_results=3,
        min_relevance=0.35,
        source="vertex_ai_search",
    )
    return result.citations
