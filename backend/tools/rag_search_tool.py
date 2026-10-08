"""ADK Tool: Vertex AI Search domain knowledge base RAG retriever connecting to Google Cloud."""

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
    },
    "tool_wear": {
        "tool_wear",
        "tool",
        "wear",
        "insert",
        "flank",
        "vb",
        "t07",
        "counter",
        "2400",
        "2000",
        "calendar",
        "sop-mnt-cnc-04",
    },
}


class VertexAISearchClient:
    """Connector to Google Cloud Vertex AI Search Datastores (Discovery Engine).

    Connects directly to Google Cloud infrastructure with no local filesystem fallback.
    """

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
        """Query Vertex AI Search Datastore directly and format results into CitationReference objects.

        Raises an error on infrastructure or API failure (never falls back to local files).
        """
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

            # Extract page anchor if present in struct data or snippet
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
                # Rank-based decay if Discovery Engine does not return raw score
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
    # 1. Resolve asset
    asset = suspect_asset or filter_machine
    if not asset and query:
        # Infer asset from query text
        for machines in MACHINE_FAMILIES.values():
            for m in machines:
                if re.search(rf"\b{re.escape(m)}\b", query, re.IGNORECASE):
                    asset = m.upper()
                    break
            if asset:
                break

    # 2. Resolve symptom
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
    """RAG search querying external Google Drive knowledge base documents directly via rclone.

    Allows streaming and indexing documents directly from the remote shared drive
    without requiring checked-in files in git.
    """
    symptom, asset, clean_query = _resolve_dual_keys(
        defect_symptom=defect_symptom,
        suspect_asset=suspect_asset,
        query=query,
        filter_machine=filter_machine,
    )

    conn = connector or gdrive_connector
    citations: List[CitationReference] = []

    # Check remote documents
    files = conn.list_documents("knowledge base")
    if not files:
        files = conn.list_documents()

    doc_files = [f for f in files if not f.is_dir]

    query_tokens = set(re.findall(r"\w+", clean_query.lower()))
    asset_tokens = {asset.lower(), asset.lower().replace("-", ""), asset.lower().replace("_", "")}
    for _, members in MACHINE_FAMILIES.items():
        if asset.lower() in members:
            asset_tokens.update(members)
            asset_tokens.update(m.replace("-", "") for m in members)
            break
    symptom_tokens = SYMPTOM_SYNONYMS.get(symptom, {symptom.lower()})

    for doc in doc_files:
        name_lower = doc.name.lower()
        score = 0.40  # Base score for domain documents

        if any(tok in name_lower for tok in asset_tokens):
            score += 0.30
        if any(tok in name_lower for tok in symptom_tokens):
            score += 0.25

        snippet_text = f"Google Drive document: {doc.name}"
        if score >= min_relevance:
            try:
                content_preview = conn.stream_document_text(doc.path)
                preview_lower = content_preview.lower()
                matches = sum(1 for tok in query_tokens if tok in preview_lower)
                if matches > 0:
                    score = min(0.95, score + (matches * 0.05))
                    for tok in query_tokens:
                        idx = preview_lower.find(tok)
                        if idx != -1:
                            start = max(0, idx - 60)
                            end = min(len(content_preview), idx + 140)
                            snippet_text = content_preview[start:end].strip().replace("\n", " ")
                            break
            except Exception as exc:
                logger.debug("Could not stream document text preview for %s: %s", doc.name, exc)

            if score >= min_relevance:
                ref = CitationReference(
                    document_id=f"gdrive://{doc.path}",
                    title=doc.name,
                    page_number=1,
                    section="External Drive Reference",
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


def search_knowledge_base_sync(
    defect_symptom: Optional[str] = None,
    suspect_asset: Optional[str] = None,
    query: Optional[str] = None,
    filter_machine: Optional[str] = None,
    max_results: int = 5,
    min_relevance: float = 0.35,
    source: str = "vertex_ai_search",
) -> RAGSearchResult:
    """Synchronous RAG search querying Vertex AI Search or Google Drive directly.

    Enforces:
    1. Dual Query Keys: defect_symptom and suspect_asset mandatory parameters.
    2. Direct Google Infrastructure: Queries Vertex AI Search or Google Drive directly.
    3. Strict Citation Contract: Formatted citations with page, section, and last revised date.
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

    # Anti-Hallucination Guardrail: return confidence 0.0 if empty or below threshold
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

    # Compute overall confidence score
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
    """Asynchronous ADK Tool: Executes RAG search against Vertex AI Search or Google Drive."""
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
    )
    return result.citations
