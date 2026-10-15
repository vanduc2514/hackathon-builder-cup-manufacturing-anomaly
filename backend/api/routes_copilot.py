"""API Route: OEM repair manuals and guided repair checkpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from backend.core.models import OemRepairManual
from backend.tools.manual_loader import get_oem_repair_manual

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/copilot", tags=["Copilot"])


@router.get("/manuals/{machine_id}", response_model=OemRepairManual)
async def get_manual(machine_id: str) -> OemRepairManual:
    """Returns the OEM repair manual and structured checkpoints for a machine."""
    manual = get_oem_repair_manual(machine_id)
    if manual is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OEM repair manual for machine '{machine_id}' not found.",
        )
    return manual
