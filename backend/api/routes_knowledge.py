"""API Routes: Knowledge Base retrieval, SOP procedure catalog, and walkthrough video metadata."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from backend.core.models import (
    KnowledgeDocumentMeta,
    RAGSearchResult,
    SopDocument,
    WalkthroughMetadata,
)
from backend.tools.rag_search_tool import (
    MACHINE_FAMILIES,
    SYMPTOM_SYNONYMS,
    search_knowledge_base,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "knowledge_base"
_SOPS_FILE = _DATA_DIR / "sops.json"
_WALKTHROUGHS_FILE = _DATA_DIR / "expert_videos" / "walkthroughs.json"
_INDEX_FILE = _DATA_DIR / "index.json"

_CACHED_SOPS: List[SopDocument] = []
_CACHED_WALKTHROUGHS: List[WalkthroughMetadata] = []
_CACHED_DOCUMENTS: List[KnowledgeDocumentMeta] = []


def _load_sops() -> List[SopDocument]:
    """Load standard operating procedures from data/knowledge_base/sops.json."""
    global _CACHED_SOPS
    if _CACHED_SOPS:
        return _CACHED_SOPS

    if _SOPS_FILE.exists():
        try:
            with open(_SOPS_FILE, "r", encoding="utf-8") as f:
                raw = json.load(f)
                _CACHED_SOPS = [SopDocument.model_validate(item) for item in raw]
                logger.info("Loaded %d SOPs from %s", len(_CACHED_SOPS), _SOPS_FILE)
                return _CACHED_SOPS
        except Exception as exc:
            logger.warning("Failed to load %s: %s", _SOPS_FILE, exc)

    return []


def _load_walkthroughs() -> List[WalkthroughMetadata]:
    """Load expert walkthrough videos from data/knowledge_base/expert_videos/walkthroughs.json."""
    global _CACHED_WALKTHROUGHS
    if _CACHED_WALKTHROUGHS:
        return _CACHED_WALKTHROUGHS

    if _WALKTHROUGHS_FILE.exists():
        try:
            with open(_WALKTHROUGHS_FILE, "r", encoding="utf-8") as f:
                raw = json.load(f)
                _CACHED_WALKTHROUGHS = [WalkthroughMetadata.model_validate(item) for item in raw]
                logger.info(
                    "Loaded %d Walkthroughs from %s", len(_CACHED_WALKTHROUGHS), _WALKTHROUGHS_FILE
                )
                return _CACHED_WALKTHROUGHS
        except Exception as exc:
            logger.warning("Failed to load %s: %s", _WALKTHROUGHS_FILE, exc)

    return []


def _load_documents() -> List[KnowledgeDocumentMeta]:
    """Load curated domain documents from data/knowledge_base/index.json."""
    global _CACHED_DOCUMENTS
    if _CACHED_DOCUMENTS:
        return _CACHED_DOCUMENTS

    if _INDEX_FILE.exists():
        try:
            with open(_INDEX_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                docs = data.get("documents", [])
                result = []
                for doc in docs:
                    machines = doc.get("machines", [])
                    primary_machine = machines[0] if machines else None
                    result.append(
                        KnowledgeDocumentMeta(
                            document_id=doc.get("document_id", ""),
                            title=doc.get("title", ""),
                            category=doc.get("category", "manual"),
                            machine_id=primary_machine,
                            component=None,
                            version="1.0",
                            pages=doc.get("total_pages", 1),
                            last_revised=None,
                            tags=doc.get("key_topics", []),
                        )
                    )
                _CACHED_DOCUMENTS = result
                logger.info("Loaded %d documents from %s", len(_CACHED_DOCUMENTS), _INDEX_FILE)
                return _CACHED_DOCUMENTS
        except Exception as exc:
            logger.warning("Failed to load %s: %s", _INDEX_FILE, exc)

    return []


@router.get("/sops", response_model=List[SopDocument], response_model_by_alias=True)
async def get_sops(
    category: Optional[str] = Query(None, description="Filter by SOP category"),
    station: Optional[str] = Query(None, description="Filter by station or machine ID"),
    search: Optional[str] = Query(None, description="Keyword search in SOP title and summary"),
) -> List[SopDocument]:
    """Retrieve all Standard Operating Procedures, with optional filtering."""
    sops = _load_sops()

    if category and category.lower() != "all":
        sops = [s for s in sops if s.category.lower() == category.lower()]

    if station and station.lower() != "all":
        sops = [s for s in sops if station.lower() in s.station.lower()]

    if search:
        q = search.lower().strip()
        sops = [
            s
            for s in sops
            if q in s.title.lower()
            or q in s.summary.lower()
            or str(s.code) == q
            or any(q in t.get("label", "").lower() for t in s.tags)
        ]

    return sops


@router.get("/sops/{code}", response_model=SopDocument, response_model_by_alias=True)
async def get_sop_by_code(code: int) -> SopDocument:
    """Retrieve a single SOP by its numeric procedure code."""
    sops = _load_sops()
    for sop in sops:
        if sop.code == code:
            return sop
    raise HTTPException(status_code=404, detail=f"SOP with code #{code} not found")


@router.get("/walkthroughs", response_model=List[WalkthroughMetadata], response_model_by_alias=True)
async def get_walkthroughs(
    station: Optional[str] = Query(None, description="Filter by station"),
    required: Optional[bool] = Query(None, description="Filter required walkthroughs only"),
    search: Optional[str] = Query(None, description="Keyword search in title, topics, or summary"),
) -> List[WalkthroughMetadata]:
    """Retrieve all technician video walkthroughs, with optional filtering."""
    walkthroughs = _load_walkthroughs()

    if station and station.lower() != "all":
        walkthroughs = [w for w in walkthroughs if station.lower() in w.station.lower()]

    if required is not None:
        walkthroughs = [w for w in walkthroughs if bool(w.required) == required]

    if search:
        q = search.lower().strip()
        walkthroughs = [
            w
            for w in walkthroughs
            if q in w.title.lower()
            or q in w.short_title.lower()
            or q in w.description.lower()
            or q in w.asset.lower()
            or any(q in t.lower() for t in w.topics)
        ]

    return walkthroughs


@router.get(
    "/walkthroughs/{walkthrough_id}",
    response_model=WalkthroughMetadata,
    response_model_by_alias=True,
)
async def get_walkthrough_by_id(walkthrough_id: str) -> WalkthroughMetadata:
    """Retrieve a single walkthrough by its alphanumeric identifier."""
    walkthroughs = _load_walkthroughs()
    for w in walkthroughs:
        if w.id.lower() == walkthrough_id.lower():
            return w
    raise HTTPException(status_code=404, detail=f"Walkthrough '{walkthrough_id}' not found")


@router.get("/documents", response_model=List[KnowledgeDocumentMeta])
async def get_documents() -> List[KnowledgeDocumentMeta]:
    """Retrieve metadata for curated engineering manuals and 8D reports."""
    return _load_documents()


@router.get("/search", response_model=RAGSearchResult)
async def search_knowledge(
    q: Optional[str] = Query(None, description="Search query or symptom description"),
    asset: Optional[str] = Query(None, description="Suspect machine / asset ID"),
    defect_symptom: Optional[str] = Query(None, description="Defect symptom key"),
    limit: int = Query(10, ge=1, le=50, description="Max citations to return"),
    min_relevance: float = Query(0.35, ge=0.0, le=1.0, description="Minimum relevance threshold"),
    source: str = Query(
        "vertex_ai_search",
        description="Retrieval source: vertex_ai_search, auto, hybrid, local_bm25",
    ),
) -> RAGSearchResult:
    """Search knowledge base with dual-key resolution and fallback to local BM25."""
    query_text = q.strip() if q else None

    # Resolve suspect asset from explicit param or query text
    resolved_asset = asset.strip().upper() if asset else None
    if not resolved_asset and query_text:
        all_machines = sorted(
            [m for machines in MACHINE_FAMILIES.values() for m in machines],
            key=len,
            reverse=True,
        )
        for m in all_machines:
            if re.search(rf"\b{re.escape(m)}\b", query_text, re.IGNORECASE):
                resolved_asset = m.upper()
                break
    if not resolved_asset:
        resolved_asset = "CNC-02"

    # Resolve defect symptom from explicit param or query text
    resolved_symptom = defect_symptom.strip().lower() if defect_symptom else None
    if not resolved_symptom and query_text:
        all_symptoms = sorted(SYMPTOM_SYNONYMS.keys(), key=len, reverse=True)
        for s_key in all_symptoms:
            if s_key in query_text.lower() or s_key.replace("_", " ") in query_text.lower():
                resolved_symptom = s_key
                break
    if not resolved_symptom:
        resolved_symptom = "scratch_vertical"

    return await search_knowledge_base(
        defect_symptom=resolved_symptom,
        suspect_asset=resolved_asset,
        query=query_text,
        max_results=limit,
        min_relevance=min_relevance,
        source=source,
    )
