"""Benchmark visual evidence preset catalog loader."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

from backend.core.models import VisualEvidencePreset

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CATALOG_FILE = PROJECT_ROOT / "data" / "datasets" / "preset_evidence" / "catalog.json"


def list_presets(role: Optional[str] = None) -> list[VisualEvidencePreset]:
    """Loads benchmark visual evidence presets from catalog.json, optionally filtered by role."""
    presets = _load_all()
    if role is None:
        return presets
    return [p for p in presets if p.role == role]


def _load_all() -> list[VisualEvidencePreset]:
    if not CATALOG_FILE.exists():
        logger.warning("Preset evidence catalog not found at %s", CATALOG_FILE)
        return []

    try:
        with open(CATALOG_FILE, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

        if not isinstance(raw_data, list):
            logger.error(
                "Preset evidence catalog must contain a JSON array, got %s", type(raw_data)
            )
            return []

        return [VisualEvidencePreset.model_validate(item) for item in raw_data]
    except Exception as exc:
        logger.error("Failed to load preset evidence catalog from %s: %s", CATALOG_FILE, exc)
        return []


def get_preset(preset_id: str) -> Optional[VisualEvidencePreset]:
    """Retrieves a single preset by ID from the catalog, or None if not found."""
    for preset in list_presets():
        if preset.id == preset_id:
            return preset
    return None


def load_preset_image(preset: VisualEvidencePreset) -> bytes:
    """Reads the backend image file of a preset (raises if the preset has no image_file)."""
    if not preset.image_file:
        raise ValueError(f"Preset {preset.id} has no image_file")
    return (CATALOG_FILE.parent / preset.image_file).read_bytes()
