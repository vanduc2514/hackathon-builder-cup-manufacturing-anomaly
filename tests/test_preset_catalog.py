"""Unit tests for benchmark preset evidence catalog loader."""

from __future__ import annotations

from unittest.mock import patch

from backend.tools.preset_catalog import CATALOG_FILE, get_preset, list_presets


def test_list_presets_loads_all_four_benchmark_presets():
    """list_presets must load all 4 curated items with valid schemas."""
    presets = list_presets()
    assert len(presets) == 4

    preset_ids = [p.id for p in presets]
    assert "preset-flank-wear-vb38" in preset_ids
    assert "preset-edge-chipping-t07" in preset_ids
    assert "preset-chatter-marks-wp" in preset_ids
    assert "preset-normal-tool-t07" in preset_ids


def test_preset_categories_and_wear_measurements():
    """Validates categories, wear dimensions, and ground-truth defect flags."""
    flank = get_preset("preset-flank-wear-vb38")
    assert flank is not None
    assert flank.category == "flank_wear"
    assert flank.expected_defect_detected is True
    assert flank.expected_wear_mm == 0.38
    assert flank.suggested_sop_code == 209
    assert flank.image_url.startswith("/presets/evidence/")

    chipping = get_preset("preset-edge-chipping-t07")
    assert chipping is not None
    assert chipping.category == "chipping"
    assert chipping.expected_defect_detected is True
    assert chipping.expected_wear_mm == 0.65

    chatter = get_preset("preset-chatter-marks-wp")
    assert chatter is not None
    assert chatter.category == "chatter_marks"
    assert chatter.expected_defect_detected is True
    assert chatter.expected_wear_mm is None

    normal = get_preset("preset-normal-tool-t07")
    assert normal is not None
    assert normal.category == "normal"
    assert normal.expected_defect_detected is False
    assert normal.expected_wear_mm == 0.04
    assert normal.suggested_sop_code is None


def test_get_preset_unknown_returns_none():
    """get_preset returns None for non-existent IDs."""
    assert get_preset("unknown-preset-xyz") is None


def test_list_presets_missing_file_graceful():
    """When catalog file is missing, list_presets logs warning and returns empty list."""
    with patch(
        "backend.tools.preset_catalog.CATALOG_FILE", CATALOG_FILE.parent / "nonexistent.json"
    ):
        assert list_presets() == []
