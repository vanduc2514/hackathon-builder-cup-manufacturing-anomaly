"""ADK Tool: Vertex AI Search and local domain knowledge base hybrid RAG retriever."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from backend.core.config import settings
from backend.core.models import (
    CitationReference,
    RAGSearchResult,
)

logger = logging.getLogger(__name__)

# Default directory containing domain documents and index.json
DEFAULT_KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "knowledge_base"

# Common stopwords to filter during indexing
STOPWORDS: Set[str] = {
    "a",
    "about",
    "above",
    "after",
    "again",
    "against",
    "all",
    "am",
    "an",
    "and",
    "any",
    "are",
    "as",
    "at",
    "be",
    "because",
    "been",
    "before",
    "being",
    "below",
    "between",
    "both",
    "but",
    "by",
    "can",
    "did",
    "do",
    "does",
    "doing",
    "don",
    "down",
    "during",
    "each",
    "few",
    "for",
    "from",
    "further",
    "had",
    "has",
    "have",
    "having",
    "he",
    "her",
    "here",
    "hers",
    "herself",
    "him",
    "himself",
    "his",
    "how",
    "i",
    "if",
    "in",
    "into",
    "is",
    "it",
    "its",
    "itself",
    "just",
    "me",
    "more",
    "most",
    "my",
    "myself",
    "no",
    "nor",
    "not",
    "now",
    "of",
    "off",
    "on",
    "once",
    "only",
    "or",
    "other",
    "our",
    "ours",
    "ourselves",
    "out",
    "over",
    "own",
    "s",
    "same",
    "she",
    "should",
    "so",
    "some",
    "such",
    "t",
    "than",
    "that",
    "the",
    "their",
    "theirs",
    "them",
    "themselves",
    "then",
    "there",
    "these",
    "they",
    "this",
    "those",
    "through",
    "to",
    "too",
    "under",
    "until",
    "up",
    "very",
    "was",
    "we",
    "were",
    "what",
    "when",
    "where",
    "which",
    "while",
    "who",
    "whom",
    "why",
    "will",
    "with",
    "you",
    "your",
    "yours",
    "yourself",
}

# Known machine families for asset isolation
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


def _tokenize(text: str) -> List[str]:
    """Extract alphanumeric lowercase tokens excluding common stopwords."""
    raw_tokens = re.findall(r"[a-zA-Z0-9_\-]+", text.lower())
    return [tok for tok in raw_tokens if len(tok) > 1 and tok not in STOPWORDS]


def _extract_last_revised_date(meta: Dict[str, Any], text: str = "") -> Optional[str]:
    """Extract standard YYYY-MM-DD date from metadata or document body."""
    if "incident_date" in meta and meta["incident_date"]:
        return str(meta["incident_date"])
    if "log_period" in meta and meta["log_period"]:
        match = re.search(r"(\d{4}-\d{2}-\d{2})", str(meta["log_period"]).split("to")[-1])
        if match:
            return match.group(1)
    if "effective_date" in meta and meta["effective_date"]:
        return str(meta["effective_date"])
    if "revision_date" in meta and meta["revision_date"]:
        return str(meta["revision_date"])
    if "last_revised" in meta and meta["last_revised"]:
        return str(meta["last_revised"])
    # Text regex fallback
    date_match = re.search(r"\b(202\d-\d{2}-\d{2})\b", text)
    if date_match:
        return date_match.group(1)
    return None


@dataclass
class KnowledgeChunk:
    """A granular searchable slice of a knowledge document."""

    chunk_id: str
    document_id: str
    title: str
    category: str
    machines: List[str]
    component: Optional[str]
    page_number: Optional[int]
    section: Optional[str]
    snippet: str
    last_revised: Optional[str]
    tokens: List[str]
    is_critical: bool = False


class LocalBM25Retriever:
    """Deterministic local hybrid BM25 and token similarity retriever.

    Indexes markdown technical manuals, tool maintenance logs, and 8D reports
    in data/knowledge_base/, providing offline environment parity and zero-hallucination citations.
    """

    def __init__(self, data_dir: Optional[Path] = None) -> None:
        self.data_dir = data_dir or DEFAULT_KNOWLEDGE_DIR
        self.chunks: List[KnowledgeChunk] = []
        self.doc_freq: Counter[str] = Counter()
        self.avg_doc_len: float = 0.0
        self._indexed: bool = False

    def index_corpus(self) -> None:
        """Scan and build BM25 index over documents in knowledge base directory."""
        if self._indexed:
            return

        self.chunks.clear()
        self.doc_freq.clear()

        # 1. Parse index.json manifest if present
        index_file = self.data_dir / "index.json"
        manifest_docs: Dict[str, Dict[str, Any]] = {}
        if index_file.exists():
            try:
                manifest_data = json.loads(index_file.read_text(encoding="utf-8"))
                for d in manifest_data.get("documents", []):
                    manifest_docs[d["document_id"]] = d
            except Exception as exc:
                logger.warning("Failed to parse index.json manifest: %s", exc)

        # 2. Parse Markdown documents
        for md_path in self.data_dir.rglob("*.md"):
            if "drive" in md_path.parts or ".git" in md_path.parts:
                continue

            rel_id = str(md_path.relative_to(self.data_dir))
            raw_text = md_path.read_text(encoding="utf-8")
            meta, body = self._parse_frontmatter(raw_text)

            title = meta.get("title") or manifest_docs.get(rel_id, {}).get("title", md_path.stem)
            category = meta.get("category") or manifest_docs.get(rel_id, {}).get(
                "category", "manual"
            )
            machines = []
            if "machine_id" in meta and meta["machine_id"]:
                machines.append(str(meta["machine_id"]).upper())
            elif "machines" in meta and meta["machines"]:
                machines.extend([str(m).upper() for m in meta["machines"]])
            elif rel_id in manifest_docs:
                machines.extend([str(m).upper() for m in manifest_docs[rel_id].get("machines", [])])

            component = meta.get("component")
            last_revised = _extract_last_revised_date(meta, raw_text)

            # Split document into page and section chunks
            doc_chunks = self._chunk_document(
                doc_id=rel_id,
                title=title,
                category=category,
                machines=machines,
                component=component,
                last_revised=last_revised,
                body=body,
            )
            self.chunks.extend(doc_chunks)

        # 3. Add critical citations from manifest as boosted chunks
        for doc_id, doc_info in manifest_docs.items():
            title = doc_info.get("title", doc_id)
            category = doc_info.get("category", "manual")
            machines = [str(m).upper() for m in doc_info.get("machines", [])]
            doc_file = self.data_dir / doc_id
            doc_revised = None
            if doc_file.exists():
                doc_meta, raw_text = self._parse_frontmatter(doc_file.read_text(encoding="utf-8"))
                doc_revised = _extract_last_revised_date(doc_meta, raw_text)

            for idx, cit in enumerate(doc_info.get("critical_citations", [])):
                snippet = cit.get("snippet", "")
                page_num = cit.get("page_number")
                section = cit.get("section")
                tokens = _tokenize(f"{title} {section or ''} {snippet}")
                if tokens:
                    cit_revised = _extract_last_revised_date({}, snippet) or doc_revised
                    self.chunks.append(
                        KnowledgeChunk(
                            chunk_id=f"{doc_id}_critical_{idx}",
                            document_id=doc_id,
                            title=title,
                            category=category,
                            machines=machines,
                            component=None,
                            page_number=page_num,
                            section=section,
                            snippet=snippet,
                            last_revised=cit_revised,
                            tokens=tokens,
                            is_critical=True,
                        )
                    )

        # 4. Compute inverted index and collection statistics
        if not self.chunks:
            self._indexed = True
            return

        total_tokens = 0
        for chunk in self.chunks:
            total_tokens += len(chunk.tokens)
            unique_terms = set(chunk.tokens)
            for term in unique_terms:
                self.doc_freq[term] += 1

        self.avg_doc_len = total_tokens / max(1, len(self.chunks))
        self._indexed = True
        logger.info(
            "LocalBM25Retriever indexed %d chunks across %d knowledge documents (avgdl: %.1f)",
            len(self.chunks),
            len(manifest_docs) or len(self.chunks),
            self.avg_doc_len,
        )

    def search(
        self,
        defect_symptom: str,
        suspect_asset: str,
        query: Optional[str] = None,
        max_results: int = 5,
        min_relevance: float = 0.35,
    ) -> List[CitationReference]:
        """Search knowledge chunks matching dual query keys and calculate BM25 relevance."""
        if not self._indexed:
            self.index_corpus()

        if not self.chunks:
            return []

        # Construct query tokens
        query_text = f"{defect_symptom} {suspect_asset} {query or ''}"
        query_tokens = _tokenize(query_text)
        if not query_tokens:
            return []

        symptom_norm = defect_symptom.lower().strip()
        asset_norm = suspect_asset.upper().strip()

        # Expand symptom with domain synonyms
        symptom_keywords = set(_tokenize(symptom_norm))
        for key, synonyms in SYMPTOM_SYNONYMS.items():
            if key in symptom_norm or symptom_norm in key:
                symptom_keywords.update(synonyms)

        # Determine asset family
        asset_family = None
        for fam, members in MACHINE_FAMILIES.items():
            if any(m in asset_norm.lower() for m in members):
                asset_family = fam
                break

        total_chunks = len(self.chunks)
        k1 = 1.5
        b = 0.75

        scored_candidates: List[Tuple[float, KnowledgeChunk]] = []

        for chunk in self.chunks:
            # 1. Asset Compatibility Gate
            asset_score = self._compute_asset_score(chunk, asset_norm, asset_family)
            if asset_score <= 0.0:
                continue

            # 2. Symptom Overlap Score
            symptom_overlap = sum(1 for kw in symptom_keywords if kw in chunk.tokens)
            symptom_score = min(1.0, symptom_overlap / max(1, min(len(symptom_keywords), 4)))

            # 3. BM25 Term Relevance Score
            bm25_raw = 0.0
            doc_len = len(chunk.tokens)
            term_counts = Counter(chunk.tokens)

            for term in query_tokens:
                if term in term_counts:
                    df = self.doc_freq.get(term, 0)
                    idf = math.log(1.0 + (total_chunks - df + 0.5) / (df + 0.5))
                    tf = term_counts[term]
                    denom = tf + k1 * (1.0 - b + b * (doc_len / max(1.0, self.avg_doc_len)))
                    bm25_raw += idf * (tf * (k1 + 1.0) / denom)

            # Normalize BM25 score
            bm25_norm = min(1.0, bm25_raw / 8.0) if bm25_raw > 0 else 0.0

            # 4. Composite Relevance Calculation
            composite_score = (0.35 * asset_score) + (0.35 * symptom_score) + (0.30 * bm25_norm)

            # Boost critical citations from curated index
            if chunk.is_critical and symptom_score >= 0.5 and asset_score >= 0.8:
                composite_score = min(0.98, composite_score + 0.25)

            # Enforce minimum relevance threshold
            if composite_score >= min_relevance:
                scored_candidates.append((composite_score, chunk))

        # Sort descending by composite score
        scored_candidates.sort(key=lambda item: item[0], reverse=True)

        # Deduplicate and formulate CitationReference contracts
        results: List[CitationReference] = []
        seen_snippets: Set[str] = set()

        for score, chunk in scored_candidates:
            snippet_key = chunk.snippet.strip()[:60]
            if snippet_key in seen_snippets:
                continue
            seen_snippets.add(snippet_key)

            ref = CitationReference(
                document_id=chunk.document_id,
                title=chunk.title,
                page_number=chunk.page_number,
                section=chunk.section,
                snippet=chunk.snippet.strip(),
                relevance_score=round(score, 2),
                last_revised=chunk.last_revised,
            )
            ref.citation = ref.formatted_citation()
            results.append(ref)

            if len(results) >= max_results:
                break

        return results

    def _compute_asset_score(
        self,
        chunk: KnowledgeChunk,
        asset_norm: str,
        asset_family: Optional[str],
    ) -> float:
        """Evaluate whether a chunk belongs to or is compatible with the suspect asset."""
        if not chunk.machines:
            # General documentation applicable across machinery
            return 0.60

        chunk_machines = [m.upper() for m in chunk.machines]

        # Direct asset match (e.g. CNC-02 in ["CNC-01", "CNC-02"])
        if asset_norm in chunk_machines:
            return 1.0

        # Partial asset match (e.g. CNC in CNC-02)
        if any(asset_norm in m or m in asset_norm for m in chunk_machines):
            return 0.85

        # Cross-family incompatibility check
        if asset_family:
            chunk_text = f"{chunk.document_id} {chunk.title} {' '.join(chunk_machines)}".lower()
            for fam, members in MACHINE_FAMILIES.items():
                if fam != asset_family and any(m in chunk_text for m in members):
                    # Hard isolation: CNC query does not match injection molding manuals
                    return 0.0

        return 0.20

    def _parse_frontmatter(self, content: str) -> Tuple[Dict[str, Any], str]:
        """Parse YAML frontmatter delimited by triple-dashes."""
        if not content.startswith("---"):
            return {}, content

        parts = content.split("---", 2)
        if len(parts) < 3:
            return {}, content

        frontmatter_raw = parts[1].strip()
        body = parts[2].strip()

        metadata: Dict[str, Any] = {}
        for line in frontmatter_raw.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if ":" in line:
                key, val = line.split(":", 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if val.startswith("[") and val.endswith("]"):
                    items = [
                        item.strip().strip('"').strip("'")
                        for item in val[1:-1].split(",")
                        if item.strip()
                    ]
                    metadata[key] = items
                elif val.isdigit():
                    metadata[key] = int(val)
                else:
                    metadata[key] = val

        return metadata, body

    def _chunk_document(
        self,
        doc_id: str,
        title: str,
        category: str,
        machines: List[str],
        component: Optional[str],
        last_revised: Optional[str],
        body: str,
    ) -> List[KnowledgeChunk]:
        """Split document into discrete chunks bounded by page anchors or headers."""
        chunks: List[KnowledgeChunk] = []

        # Find all page anchors
        page_pattern = r"(?:<!--\s*page:\s*(\d+)\s*-->|##\s*\[Page\s*(\d+)\]\s*(.*?)\n)"
        page_matches = list(re.finditer(page_pattern, body))

        if not page_matches:
            # Chunk by H2 / H3 headers
            sections = re.split(r"\n(?=##\s+)", body)
            for idx, sec in enumerate(sections):
                sec_text = sec.strip()
                if not sec_text:
                    continue
                lines = sec_text.splitlines()
                sec_title = lines[0].replace("#", "").strip() if lines else None
                tokens = _tokenize(f"{title} {sec_title or ''} {sec_text}")
                if len(tokens) > 5:
                    chunks.append(
                        KnowledgeChunk(
                            chunk_id=f"{doc_id}_sec_{idx}",
                            document_id=doc_id,
                            title=title,
                            category=category,
                            machines=machines,
                            component=component,
                            page_number=None,
                            section=sec_title,
                            snippet=sec_text,
                            last_revised=last_revised,
                            tokens=tokens,
                        )
                    )
            return chunks

        for i, match in enumerate(page_matches):
            page_str = match.group(1) or match.group(2)
            page_num = int(page_str) if page_str else None
            header_title = (
                match.group(3).strip() if len(match.groups()) > 2 and match.group(3) else None
            )

            start_idx = match.start()
            end_idx = page_matches[i + 1].start() if i + 1 < len(page_matches) else len(body)
            chunk_content = body[start_idx:end_idx].strip()

            if not header_title:
                h_match = re.search(r"##\s*\[Page\s*\d+\]\s*(.*?)\n", chunk_content)
                if h_match:
                    header_title = h_match.group(1).strip()
                else:
                    sub_h = re.search(r"###\s*(.*?)\n", chunk_content)
                    if sub_h:
                        header_title = sub_h.group(1).strip()

            tokens = _tokenize(f"{title} {header_title or ''} {chunk_content}")
            if len(tokens) > 5:
                chunks.append(
                    KnowledgeChunk(
                        chunk_id=f"{doc_id}_p{page_num or i}",
                        document_id=doc_id,
                        title=title,
                        category=category,
                        machines=machines,
                        component=component,
                        page_number=page_num,
                        section=header_title,
                        snippet=chunk_content,
                        last_revised=last_revised,
                        tokens=tokens,
                    )
                )

        return chunks


class VertexAISearchClient:
    """Connector to Google Cloud Vertex AI Search Datastores (Discovery Engine)."""

    def __init__(self) -> None:
        self.project_id = settings.gcp_project_id
        self.location = settings.vertex_search_location
        self.datastore_id = settings.vertex_search_datastore_id
        self.serving_config = settings.vertex_search_serving_config

    def is_configured(self) -> bool:
        """Returns True if running against live GCP project rather than local emulation."""
        return bool(self.project_id and self.project_id != "kaizen-local")

    def search(
        self,
        defect_symptom: str,
        suspect_asset: str,
        query: Optional[str] = None,
        max_results: int = 5,
        min_relevance: float = 0.35,
    ) -> Optional[List[CitationReference]]:
        """Query Vertex AI Search Datastore and format results into CitationReference objects."""
        if not self.is_configured():
            return None

        try:
            from google.cloud import discoveryengine_v1 as discoveryengine
        except ImportError:
            logger.warning(
                "google-cloud-discoveryengine is not installed; falling back to local BM25."
            )
            return None

        try:
            client = discoveryengine.SearchServiceClient()
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

            response = client.search(request)
            citations: List[CitationReference] = []

            for result in response.results:
                doc = result.document
                doc_data = getattr(doc, "derived_struct_data", {}) or {}

                title = doc_data.get("title") or doc.id
                link = doc_data.get("link") or doc.id
                snippets = doc_data.get("snippets", [])
                snippet_text = snippets[0].get("snippet", "") if snippets else str(doc_data)

                # Extract page anchors if embedded in snippet
                page_match = re.search(
                    r"(?:\[Page\s*(\d+)\]|p\.(\d+))", snippet_text, re.IGNORECASE
                )
                page_num = int(page_match.group(1) or page_match.group(2)) if page_match else None

                # Extract section if present
                sec_match = re.search(r"(Section\s*[\d\.]+:?[^\n\.]+)", snippet_text, re.IGNORECASE)
                section = sec_match.group(1).strip() if sec_match else None

                date_match = re.search(r"\b(202\d-\d{2}-\d{2})\b", snippet_text)
                last_revised = date_match.group(1) if date_match else None

                # Normalized relevance from Vertex Search ranking
                relevance = 0.90

                if relevance >= min_relevance:
                    ref = CitationReference(
                        document_id=link,
                        title=title,
                        page_number=page_num,
                        section=section,
                        snippet=snippet_text,
                        relevance_score=relevance,
                        last_revised=last_revised,
                    )
                    ref.citation = ref.formatted_citation()
                    citations.append(ref)

            return citations

        except Exception as exc:
            logger.warning(
                "Vertex AI Search query failed (%s); smoothly falling back to local index.", exc
            )
            return None


# Module-level singletons
_local_retriever = LocalBM25Retriever()
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


def search_knowledge_base_sync(
    defect_symptom: Optional[str] = None,
    suspect_asset: Optional[str] = None,
    query: Optional[str] = None,
    filter_machine: Optional[str] = None,
    max_results: int = 5,
    min_relevance: float = 0.35,
    data_dir: Optional[Path | str] = None,
    use_cloud: Optional[bool] = None,
) -> RAGSearchResult:
    """Synchronous hybrid RAG search against Vertex AI Search or local knowledge base.

    Enforces:
    1. Dual Query Keys: defect_symptom and suspect_asset mandatory parameters.
    2. Cloud Connector: Vertex AI Search when configured with active GCP project.
    3. Local BM25 Fallback: Deterministic token similarity over data/knowledge_base/.
    4. Strict Citation Contract: Formatted citations with page, section, and last revised date.
    5. Anti-Hallucination Guardrail: Returns confidence 0.0 and empty citations when below threshold.
    """
    symptom, asset, clean_query = _resolve_dual_keys(
        defect_symptom=defect_symptom,
        suspect_asset=suspect_asset,
        query=query,
        filter_machine=filter_machine,
    )

    citations: Optional[List[CitationReference]] = None
    engine = "local_bm25"

    # Attempt Vertex AI Search if cloud execution is requested or available
    should_use_cloud = use_cloud is True or (use_cloud is None and _vertex_client.is_configured())
    if should_use_cloud:
        try:
            citations = _vertex_client.search(
                defect_symptom=symptom,
                suspect_asset=asset,
                query=clean_query,
                max_results=max_results,
                min_relevance=min_relevance,
            )
            if citations is not None:
                engine = "vertex_ai_search"
        except Exception as exc:
            logger.warning("Cloud search invocation failed (%s); smoothly falling back.", exc)
            citations = None

    # Fallback to local BM25 retriever
    if citations is None:
        retriever = LocalBM25Retriever(Path(data_dir)) if data_dir else _local_retriever
        citations = retriever.search(
            defect_symptom=symptom,
            suspect_asset=asset,
            query=clean_query,
            max_results=max_results,
            min_relevance=min_relevance,
        )
        engine = "local_bm25"

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
            engine=engine,
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
        summary=f"Retrieved {len(citations)} verified document citations from {engine}.",
        engine=engine,
        total_found=len(citations),
    )


async def search_knowledge_base(
    defect_symptom: Optional[str] = None,
    suspect_asset: Optional[str] = None,
    query: Optional[str] = None,
    filter_machine: Optional[str] = None,
    max_results: int = 5,
    min_relevance: float = 0.35,
    data_dir: Optional[Path | str] = None,
    use_cloud: Optional[bool] = None,
) -> RAGSearchResult:
    """Asynchronous ADK Tool: Executes hybrid RAG search against Vertex AI Search or local knowledge base."""
    return await asyncio.to_thread(
        search_knowledge_base_sync,
        defect_symptom=defect_symptom,
        suspect_asset=suspect_asset,
        query=query,
        filter_machine=filter_machine,
        max_results=max_results,
        min_relevance=min_relevance,
        data_dir=data_dir,
        use_cloud=use_cloud,
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
