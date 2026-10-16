"""Routes for curated visual evidence presets."""

from __future__ import annotations

from fastapi import APIRouter

from backend.core.models import VisualEvidencePresetListResponse
from backend.tools.preset_catalog import list_presets

router = APIRouter(prefix="/api/presets", tags=["presets"])


@router.get("/evidence", response_model=VisualEvidencePresetListResponse)
async def get_preset_evidence_gallery() -> VisualEvidencePresetListResponse:
    """Returns curated visual evidence presets from the benchmark catalog."""
    return VisualEvidencePresetListResponse(presets=list_presets())
