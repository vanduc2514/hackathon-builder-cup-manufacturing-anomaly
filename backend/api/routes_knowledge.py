"""Knowledge Base API routes: search, SOP document catalogue, and technician walkthroughs."""

from __future__ import annotations

import asyncio
from typing import List, Optional

from fastapi import APIRouter, Query

from backend.core.models import KnowledgeDocumentMeta, RAGSearchResult, WalkthroughMeta
from backend.tools.rag_search_tool import (
    list_knowledge_documents,
    list_walkthroughs,
    search_knowledge_free_text_async,
)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("/search", response_model=RAGSearchResult)
async def search_knowledge(
    q: str = Query(..., min_length=1, max_length=200, description="Plain-language query string"),
    asset: Optional[str] = Query(default=None, description="Optional target asset or machine"),
    limit: int = Query(
        default=10, ge=1, le=20, description="Maximum number of citations to return"
    ),
) -> RAGSearchResult:
    """Free-text RAG search over engineering manuals, logs, specs, and past 8D reports."""
    return await search_knowledge_free_text_async(
        query=q,
        asset=asset,
        limit=limit,
    )


@router.get("/sops", response_model=List[KnowledgeDocumentMeta])
async def get_sops() -> List[KnowledgeDocumentMeta]:
    """Retrieve curated knowledge base document catalogue (manuals, specs, logs, 8D reports)."""
    return await asyncio.to_thread(list_knowledge_documents)


@router.get("/walkthroughs", response_model=List[WalkthroughMeta])
async def get_walkthroughs() -> List[WalkthroughMeta]:
    """Retrieve expert technician video walkthrough metadata."""
    return await asyncio.to_thread(list_walkthroughs)
