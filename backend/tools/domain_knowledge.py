"""Domain Knowledge Base: Loader, parser, citation generator, and offline indexer."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.core.models import CitationReference, KnowledgeDocumentMeta

logger = logging.getLogger(__name__)

# Default base directory for domain knowledge
DEFAULT_KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "knowledge_base"


def _parse_frontmatter(content: str) -> tuple[Dict[str, Any], str]:
    """Parse YAML-style frontmatter delimited by triple-dashes."""
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
                # Simple list parsing
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


def get_knowledge_base_dir() -> Path:
    """Return the absolute Path to data/knowledge_base."""
    return DEFAULT_KNOWLEDGE_DIR


def list_knowledge_documents() -> List[KnowledgeDocumentMeta]:
    """List all curated knowledge base documents with structured metadata."""
    base_dir = get_knowledge_base_dir()
    index_file = base_dir / "index.json"

    if index_file.exists():
        try:
            data = json.loads(index_file.read_text(encoding="utf-8"))
            docs: List[KnowledgeDocumentMeta] = []
            for item in data.get("documents", []):
                docs.append(
                    KnowledgeDocumentMeta(
                        document_id=item["document_id"],
                        title=item["title"],
                        category=item.get("category", "manual"),
                        machine_id=item.get("machines", [None])[0]
                        if item.get("machines")
                        else None,
                        pages=item.get("total_pages", 1),
                        tags=item.get("key_topics", []),
                    )
                )
            return docs
        except Exception as exc:
            logger.warning("Failed to parse index.json: %s", exc)

    # Fallback to scanning filesystem
    documents: List[KnowledgeDocumentMeta] = []
    for md_file in base_dir.rglob("*.md"):
        if "drive" in md_file.parts or ".git" in md_file.parts:
            continue
        try:
            content = md_file.read_text(encoding="utf-8")
            meta, _ = _parse_frontmatter(content)
            rel_path = str(md_file.relative_to(base_dir))
            documents.append(
                KnowledgeDocumentMeta(
                    document_id=meta.get("document_id", rel_path),
                    title=meta.get("title", md_file.stem),
                    category=meta.get("category", "manual"),
                    machine_id=meta.get("machine_id"),
                    pages=meta.get("total_pages", 1),
                    tags=meta.get("tags", []),
                )
            )
        except Exception as exc:
            logger.error("Failed to load document %s: %s", md_file, exc)

    return documents


def get_document_content(document_id: str) -> tuple[Dict[str, Any], str]:
    """Retrieve frontmatter metadata and body content for a document ID."""
    base_dir = get_knowledge_base_dir()
    target_path = base_dir / document_id

    if not target_path.exists():
        raise FileNotFoundError(f"Knowledge document not found: {document_id}")

    raw_text = target_path.read_text(encoding="utf-8")
    return _parse_frontmatter(raw_text)


def extract_page_section(body: str, page_number: int) -> tuple[Optional[str], str]:
    """Extract section title and content for a specific page anchor."""
    # Pattern matching page start
    pattern = rf"(?:<!--\s*page:\s*{page_number}\s*-->|##\s*\[Page\s*{page_number}\])"
    match = re.search(pattern, body)
    if not match:
        return None, ""

    start_idx = match.start()
    remaining = body[match.end() :]

    # Find the next page anchor with a different page number
    next_anchor_pattern = r"(?:<!--\s*page:\s*(\d+)\s*-->|##\s*\[Page\s*(\d+)\])"
    end_idx = len(body)
    for next_m in re.finditer(next_anchor_pattern, remaining):
        p_num = int(next_m.group(1) or next_m.group(2))
        if p_num != page_number:
            end_idx = match.end() + next_m.start()
            break

    page_content = body[start_idx:end_idx].strip()

    # Extract section title from header if available
    section_title = None
    header_match = re.search(r"##\s*\[Page\s*\d+\]\s*(.*?)\n", page_content)
    if header_match:
        section_title = header_match.group(1).strip()
    elif "###" in page_content:
        sub_match = re.search(r"###\s*(.*?)\n", page_content)
        if sub_match:
            section_title = sub_match.group(1).strip()

    return section_title, page_content


def _extract_last_revised(meta: Dict[str, Any], text: str = "") -> Optional[str]:
    """Extract or format the last revised date string (YYYY-MM-DD) from metadata or text."""
    if "incident_date" in meta:
        return str(meta["incident_date"])
    if "log_period" in meta:
        match = re.search(r"(\d{4}-\d{2}-\d{2})", str(meta["log_period"]).split("to")[-1])
        if match:
            return match.group(1)
    if "last_revised" in meta:
        return str(meta["last_revised"])
    date_match = re.search(r"\b(202\d-\d{2}-\d{2})\b", text)
    if date_match:
        return date_match.group(1)
    return None


def create_citation(
    document_id: str,
    page_number: Optional[int] = None,
    section: Optional[str] = None,
    snippet: str = "",
    relevance_score: float = 1.0,
    last_revised: Optional[str] = None,
) -> CitationReference:
    """Create a structured CitationReference compliant with the citation contract."""
    base_dir = get_knowledge_base_dir()
    target_path = base_dir / document_id

    title = document_id
    if target_path.exists():
        meta, raw_body = _parse_frontmatter(target_path.read_text(encoding="utf-8"))
        title = meta.get("title", document_id)
        if not last_revised:
            last_revised = _extract_last_revised(meta, raw_body)

    ref = CitationReference(
        document_id=document_id,
        title=title,
        page_number=page_number,
        section=section,
        snippet=snippet.strip(),
        relevance_score=round(relevance_score, 2),
        last_revised=last_revised,
    )
    ref.citation = ref.formatted_citation()
    return ref


def search_knowledge_base_offline(
    query: str,
    filter_machine: Optional[str] = None,
    max_results: int = 5,
) -> List[CitationReference]:
    """Keyword-based offline search over curated knowledge base documents.

    Provides reliable environment parity when GCP credentials or Vertex AI Search are unavailable.
    """
    base_dir = get_knowledge_base_dir()
    index_file = base_dir / "index.json"

    query_tokens = [tok.lower() for tok in re.findall(r"\w+", query) if len(tok) > 2]
    citations: List[CitationReference] = []

    if index_file.exists():
        try:
            manifest = json.loads(index_file.read_text(encoding="utf-8"))
            for doc in manifest.get("documents", []):
                doc_id = doc["document_id"]
                doc_title = doc["title"]
                machines = doc.get("machines", [])

                if filter_machine and filter_machine not in machines:
                    continue

                doc_path = base_dir / doc_id
                doc_revised = None
                if doc_path.exists():
                    doc_meta, raw_body = _parse_frontmatter(doc_path.read_text(encoding="utf-8"))
                    doc_revised = _extract_last_revised(doc_meta, raw_body)

                for cit in doc.get("critical_citations", []):
                    snippet = cit.get("snippet", "")
                    section = cit.get("section")
                    page_num = cit.get("page_number")

                    # Score snippet against query tokens
                    text_lower = f"{doc_title} {section} {snippet}".lower()
                    matches = sum(1 for tok in query_tokens if tok in text_lower)
                    if matches > 0:
                        score = min(1.0, 0.4 + (0.2 * matches))
                        ref = CitationReference(
                            document_id=doc_id,
                            title=doc_title,
                            page_number=page_num,
                            section=section,
                            snippet=snippet,
                            relevance_score=score,
                            last_revised=doc_revised,
                        )
                        ref.citation = ref.formatted_citation()
                        citations.append(ref)
        except Exception as exc:
            logger.warning("Error searching index.json: %s", exc)

    # Sort by relevance score descending
    citations.sort(key=lambda c: c.relevance_score, reverse=True)
    return citations[:max_results]
