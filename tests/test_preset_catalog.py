"""Unit tests for benchmark preset evidence catalog loader."""

from __future__ import annotations

from unittest.mock import patch

from backend.tools.preset_catalog import CATALOG_FILE, get_preset, list_presets


def test_list_presets_loads_all_five_im05_presets():
    """list_presets must load the 5 curated IM-05 items (plus competition extras)."""
    presets = list_presets()
    assert len(presets) >= 5

    preset_ids = [p.id for p in presets]
    assert "preset-im05-normal" in preset_ids
    assert "preset-im05-surface-scratch" in preset_ids
    assert "preset-im05-crack" in preset_ids
    assert "preset-im05-fracture" in preset_ids
    assert "preset-im05-assembly-gap" in preset_ids


def test_preset_categories_and_wear_measurements():
    """Validates categories, null wear dimensions, and ground-truth defect flags."""
    normal = get_preset("preset-im05-normal")
    assert normal is not None
    assert normal.category == "normal"
    assert normal.machine_id == "IM-05"
    assert normal.tool_id == "MOLD-03"
    assert normal.expected_defect_detected is False
    assert normal.expected_wear_mm is None
    assert normal.suggested_sop_code is None
    assert normal.image_url.startswith("/presets/evidence/")

    scratch = get_preset("preset-im05-surface-scratch")
    assert scratch is not None
    assert scratch.category == "surface_scratch"
    assert scratch.expected_defect_detected is True
    assert scratch.expected_wear_mm is None

    crack = get_preset("preset-im05-crack")
    assert crack is not None
    assert crack.category == "crack"
    assert crack.expected_defect_detected is True
    assert crack.expected_wear_mm is None

    fracture = get_preset("preset-im05-fracture")
    assert fracture is not None
    assert fracture.category == "fracture"
    assert fracture.expected_defect_detected is True
    assert fracture.expected_wear_mm is None

    gap = get_preset("preset-im05-assembly-gap")
    assert gap is not None
    assert gap.category == "assembly_gap"
    assert gap.expected_defect_detected is True
    assert gap.expected_wear_mm is None


def test_get_preset_unknown_returns_none():
    """get_preset returns None for non-existent IDs."""
    assert get_preset("unknown-preset-xyz") is None


def test_list_presets_missing_file_graceful():
    """When catalog file is missing, list_presets logs warning and returns empty list."""
    with patch(
        "backend.tools.preset_catalog.CATALOG_FILE", CATALOG_FILE.parent / "nonexistent.json"
    ):
        assert list_presets() == []


def test_cnc02_catalog_integrity():
    """Every cnc02 entry has an existing image file, licence, source URL and expected class."""
    from backend.tools.preset_catalog import load_preset_image

    cnc02 = [p for p in list_presets() if p.machine_id == "CNC-02"]
    image_dir = CATALOG_FILE.parent / "cnc02"
    assert {p.image_file for p in cnc02} == {f"cnc02/{f.name}" for f in image_dir.glob("*.jpg")}
    assert not any("competition" in p.id for p in list_presets())
    for p in cnc02:
        assert p.image_file and p.image_file.startswith("cnc02/"), p.id
        assert (CATALOG_FILE.parent / p.image_file).is_file(), p.id
        assert load_preset_image(p)
        assert p.licence and p.source_url and p.author and p.expected_class, p.id
        assert p.tool_id == "T07"
        assert p.image_url == f"/presets/evidence/{p.image_file}"


def test_list_presets_role_filter():
    for role in ("qa_defect", "streak_good", "tool_worn", "tool_new", "im05"):
        presets = list_presets(role)
        assert presets, role
        assert {p.role for p in presets} == {role}
