"""ADK Tool: Vertex AI Search retriever for equipment manuals, maintenance logs, and past 8D reports."""

import os
from typing import List, Optional
from pydantic import BaseModel
from backend.core.config import settings
import logging

logger = logging.getLogger(__name__)

class RagResult(BaseModel):
    title: str
    page_number: int
    snippet: str

async def search_knowledge_base(query: str, max_results: int = 3, filter_machine: Optional[str] = None) -> List[RagResult]:
    """
    Search Vertex AI / Discovery Engine for relevant documentation.
    Falls back to mock retrieval if GCP_PROJECT_ID is local or missing.
    """
    # Key Invariant 4: Mock fallback
    if settings.gcp_project_id == "kaizen-local" or not os.getenv("VERTEX_DATA_STORE_ID"):
        logger.info("Using mock RAG search for query: %s", query)
        # Mock results based on the likely query for this incident
        results = [
            RagResult(
                title="CNC Operations Manual",
                page_number=112,
                snippet="The T07 cutting insert is rated for a maximum of 2,000 continuous cuts. Exceeding this limit will result in severe tool wear, increased spindle vibration, and out-of-tolerance surface scratches."
            ),
            RagResult(
                title="Maintenance Log T07",
                page_number=1,
                snippet="Tool T07 on CNC-02 last replaced 4 days ago. Current piece counter: 2,400 parts. SOP states tool replacement should occur weekly on Sundays."
            ),
            RagResult(
                title="8D-2026-03-12 (Past Incident)",
                page_number=3,
                snippet="Root Cause: Preventive maintenance schedule is calendar-based (weekly) rather than usage-based. Recommended countermeasure: Install IoT piece counter to alert when tool life reaches 90%."
            )
        ]
        return results[:max_results]
    
    # Real implementation would use google-cloud-discoveryengine
    try:
        from google.cloud import discoveryengine_v1alpha as discoveryengine
        # Setup and call Discovery Engine API...
        # For this prototype, we'll just log and return empty if real API is called without proper setup
        logger.warning("Real Vertex AI Search requested but not fully configured in this stub.")
        return []
    except Exception as e:
        logger.error(f"Discovery Engine search failed: {e}")
        return []
