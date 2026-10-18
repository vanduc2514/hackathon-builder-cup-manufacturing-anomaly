"""Unit tests for normalize_image and the DEMO_SCRIPTED guarded vision inspections."""

from __future__ import annotations

import io
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from PIL import Image

from backend.core.config import settings
from backend.core.models import InsertInspectionResult, PartInspectionResult
from backend.tools import gemini_vision_tool as gvt
from backend.tools.gemini_vision_tool import (
    guarded_insert_inspection,
    guarded_part_inspection,
    normalize_image,
)

IMG = b"not-a-real-image"
KW = {"machine_id": "CNC-02", "tool_id": "T07"}


def _part(cls: str) -> PartInspectionResult:
    return PartInspectionResult(defect_class=cls, severity=3, region="center")


def _insert(replace: bool) -> InsertInspectionResult:
    return InsertInspectionResult(
        flank_wear="severe" if replace else "none", edge_chipping=replace, replace_insert=replace
    )


def _client(*results_or_errors):
    """Fake Gemini client returning/raising the given items in order."""
    items = list(results_or_errors)

    def generate_content(**_kwargs):
        item = items.pop(0)
        if isinstance(item, Exception):
            raise item
        return SimpleNamespace(parsed=item, text=None)

    client = MagicMock()
    client.models.generate_content.side_effect = generate_content
    return client


@pytest.fixture()
def scripted(monkeypatch):
    monkeypatch.setattr(settings, "demo_scripted", True)


@pytest.fixture()
def unscripted(monkeypatch):
    monkeypatch.setattr(settings, "demo_scripted", False)


def test_normalize_image_caps_long_edge_and_outputs_rgb_jpeg():
    buf = io.BytesIO()
    Image.new("RGBA", (3000, 1500), (10, 20, 30, 255)).save(buf, format="PNG")
    out = Image.open(io.BytesIO(normalize_image(buf.getvalue())))
    assert out.format == "JPEG"
    assert out.mode == "RGB"
    assert max(out.size) == 1024


def test_normalize_image_does_not_upscale_and_applies_exif_orientation():
    img = Image.new("RGB", (200, 100), (1, 2, 3))
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 CW on display
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    out = Image.open(io.BytesIO(normalize_image(buf.getvalue())))
    assert out.size == (100, 200)


def test_part_match_returns_gemini(scripted):
    client = _client(_part("scratch_vertical"))
    res = guarded_part_inspection(IMG, expected="scratch_vertical", client=client, **KW)
    assert (res.source, res.attempts, res.part.defect_class) == ("gemini", 1, "scratch_vertical")
    assert res.kind == "part"
    assert res.summary


def test_part_mismatch_then_match_retries(scripted):
    client = _client(_part("none"), _part("chipping"))
    res = guarded_part_inspection(IMG, expected="chipping", client=client, **KW)
    assert (res.source, res.attempts, res.part.defect_class) == ("gemini", 2, "chipping")


def test_part_mismatch_twice_falls_back_to_expected(scripted):
    client = _client(_part("scratch_vertical"), _part("scratch_vertical"))
    res = guarded_part_inspection(IMG, expected="none", client=client, **KW)
    assert (res.source, res.attempts, res.part.defect_class) == ("fallback", 2, "none")


def test_part_exception_falls_back_in_scripted_mode(scripted):
    client = _client(RuntimeError("boom"), RuntimeError("boom"))
    res = guarded_part_inspection(IMG, expected="chipping", client=client, **KW)
    assert (res.source, res.part.defect_class) == ("fallback", "chipping")


def test_part_exception_raises_when_not_scripted(unscripted):
    client = _client(RuntimeError("boom"))
    with pytest.raises(RuntimeError):
        guarded_part_inspection(IMG, expected="chipping", client=client, **KW)


def test_part_not_scripted_returns_model_result_as_is(unscripted):
    client = _client(_part("scratch_vertical"))
    res = guarded_part_inspection(IMG, expected="none", client=client, **KW)
    assert (res.source, res.attempts, res.part.defect_class) == ("gemini", 1, "scratch_vertical")


def test_part_unavailable_returns_mock(scripted, monkeypatch):
    monkeypatch.setattr(gvt, "is_gemini_vision_available", lambda: False)
    res = guarded_part_inspection(IMG, expected="chipping", **KW)
    assert (res.source, res.attempts, res.part.defect_class) == ("mock", 0, "chipping")
    assert guarded_part_inspection(IMG, expected=None, **KW).part.defect_class == "none"


def test_insert_match_returns_gemini(scripted):
    client = _client(_insert(True))
    res = guarded_insert_inspection(IMG, expected="replace", client=client, **KW)
    assert (res.source, res.attempts, res.insert.replace_insert) == ("gemini", 1, True)
    assert res.kind == "insert"


def test_insert_mismatch_then_match_retries(scripted):
    client = _client(_insert(True), _insert(False))
    res = guarded_insert_inspection(IMG, expected="ok", client=client, **KW)
    assert (res.source, res.attempts, res.insert.replace_insert) == ("gemini", 2, False)


def test_insert_mismatch_twice_falls_back(scripted):
    client = _client(_insert(False), _insert(False))
    res = guarded_insert_inspection(IMG, expected="replace", client=client, **KW)
    assert (res.source, res.attempts) == ("fallback", 2)
    assert res.insert.replace_insert is True and res.insert.flank_wear == "severe"


def test_insert_exception_scripted_falls_back_unscripted_raises(monkeypatch):
    monkeypatch.setattr(settings, "demo_scripted", True)
    res = guarded_insert_inspection(
        IMG, expected="ok", client=_client(ValueError("x"), ValueError("x")), **KW
    )
    assert (res.source, res.insert.replace_insert) == ("fallback", False)
    monkeypatch.setattr(settings, "demo_scripted", False)
    with pytest.raises(ValueError):
        guarded_insert_inspection(IMG, expected="ok", client=_client(ValueError("x")), **KW)


def test_insert_unavailable_returns_mock(scripted, monkeypatch):
    monkeypatch.setattr(gvt, "is_gemini_vision_available", lambda: False)
    res = guarded_insert_inspection(IMG, expected="replace", **KW)
    assert (res.source, res.insert.replace_insert) == ("mock", True)
