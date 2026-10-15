"""OEM repair manual loader reading centralized manual definitions."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from backend.core.models import OemRepairManual

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
MANUALS_FILE = PROJECT_ROOT / "data" / "knowledge_base" / "manuals" / "oem_repair_manuals.json"


def load_oem_repair_manuals() -> dict[str, OemRepairManual]:
    """Loads all OEM repair manuals from the centralized JSON database."""
    if not MANUALS_FILE.exists():
        logger.warning("OEM repair manuals file not found at %s", MANUALS_FILE)
        return {}

    try:
        with open(MANUALS_FILE, "r", encoding="utf-8") as f:
            raw_data: dict[str, Any] = json.load(f)

        manuals: dict[str, OemRepairManual] = {}
        for key, entry in raw_data.items():
            if not isinstance(entry, dict):
                continue
            manual_dict = dict(entry)
            if "machine_id" not in manual_dict:
                manual_dict["machine_id"] = key
            manual = OemRepairManual.model_validate(manual_dict)
            manuals[key] = manual
        return manuals
    except Exception as exc:
        logger.error("Failed to load OEM repair manuals from %s: %s", MANUALS_FILE, exc)
        return {}


def load_oem_repair_manuals_dict() -> dict[str, dict[str, Any]]:
    """Loads all OEM repair manuals as raw dictionaries for backward compatibility."""
    manuals = load_oem_repair_manuals()
    return {k: v.model_dump() for k, v in manuals.items()}


def get_oem_repair_manual(machine_id: str | None) -> OemRepairManual | None:
    """Retrieves an OEM repair manual for a machine ID, supporting fuzzy key matching."""
    if not machine_id:
        return None

    manuals = load_oem_repair_manuals()
    # 1. Exact match
    if machine_id in manuals:
        return manuals[machine_id]

    norm_target = machine_id.strip().upper()

    # 2. Case-insensitive exact match
    for key, manual in manuals.items():
        if key.upper() == norm_target:
            return manual

    # 3. Substring match (e.g. 'Line 1 - CNC-02' matches 'CNC-02')
    for key, manual in manuals.items():
        if key.upper() in norm_target or norm_target in key.upper():
            return manual

    return None
