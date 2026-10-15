"""Unit tests for OEM repair manual loader."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from backend.core.models import OemRepairManual, RepairCheckpoint
from backend.tools.manual_loader import (
    get_oem_repair_manual,
    load_oem_repair_manuals,
    load_oem_repair_manuals_dict,
)


def test_load_oem_repair_manuals_parses_json() -> None:
    """Verifies that all manuals in JSON are loaded and properly typed."""
    manuals = load_oem_repair_manuals()
    assert "CNC-02" in manuals
    assert "IM-05" in manuals

    cnc = manuals["CNC-02"]
    assert isinstance(cnc, OemRepairManual)
    assert cnc.machine_id == "CNC-02"
    assert "CNC-02" in cnc.title
    assert "CNC-02" in cnc.citation
    assert len(cnc.checkpoints) >= 5
    assert len(cnc.parts) > 0

    first_cp = cnc.checkpoints[0]
    assert isinstance(first_cp, RepairCheckpoint)
    assert first_cp.step_number == 1
    assert "LOTO" in first_cp.title_vi
    assert "CNC-02" in first_cp.citation


def test_load_oem_repair_manuals_dict_backward_compat() -> None:
    """Verifies dictionary representation for backward compatibility with agent."""
    raw_dict = load_oem_repair_manuals_dict()
    assert isinstance(raw_dict, dict)
    assert "CNC-02" in raw_dict
    assert "IM-05" in raw_dict
    assert isinstance(raw_dict["CNC-02"]["checkpoints"], list)
    assert raw_dict["CNC-02"]["manual_title"]


def test_get_oem_repair_manual_lookups() -> None:
    """Verifies exact, case-insensitive, and substring lookups."""
    # Exact
    cnc = get_oem_repair_manual("CNC-02")
    assert cnc is not None
    assert cnc.machine_id == "CNC-02"

    # Case-insensitive
    cnc_lower = get_oem_repair_manual("cnc-02")
    assert cnc_lower is not None
    assert cnc_lower.machine_id == "CNC-02"

    # Substring match (e.g. factory cell naming)
    cnc_sub = get_oem_repair_manual("Line 1 - CNC-02 Station")
    assert cnc_sub is not None
    assert cnc_sub.machine_id == "CNC-02"

    # IM-05 lookup
    im = get_oem_repair_manual("IM-05")
    assert im is not None
    assert im.machine_id == "IM-05"

    # Unknown
    unknown = get_oem_repair_manual("UNKNOWN-ROBOT-99")
    assert unknown is None

    # None / empty
    assert get_oem_repair_manual(None) is None
    assert get_oem_repair_manual("") is None


def test_load_oem_repair_manuals_missing_file_graceful() -> None:
    """Verifies that missing file returns empty dict rather than crashing."""
    with patch("backend.tools.manual_loader.MANUALS_FILE", Path("/tmp/nonexistent_manuals.json")):
        manuals = load_oem_repair_manuals()
        assert manuals == {}
        assert get_oem_repair_manual("CNC-02") is None
