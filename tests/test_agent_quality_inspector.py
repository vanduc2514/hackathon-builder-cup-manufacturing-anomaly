"""Quality Inspector measurement tests: Phase A conveyor SPC window and Phase C streak gatekeeper."""

from __future__ import annotations

import asyncio

import pytest

from backend.agents import agent_quality_inspector
from backend.agents.agent_quality_inspector import (
    VERIFICATION_BATCH_PARTS,
    inspect_post_repair_products,
    inspect_production_window,
)
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import PartInspectionResult, VerificationResult
from backend.tools import gemini_vision_tool
from backend.tools.preset_catalog import list_presets


@pytest.fixture(autouse=True)
def clean_line():
    blackboard.reset()
    yield
    blackboard.reset()


def _collect(target: int) -> list[VerificationResult]:
    async def run() -> list[VerificationResult]:
        return [result async for result in inspect_post_repair_products(target, 0)]

    return asyncio.run(run())


def test_cnc_tool_wear_window_breaches_upper_ucl(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ai_provider", "mock")
    report = asyncio.run(
        inspect_production_window(0.03, defect_rate=0.12, defect_type="scratch_vertical")
    )
    assert report.spc.sample_size == 300
    assert report.spc.breach_direction == "upper"
    counts = report.defect_type_counts
    assert max(counts, key=counts.get) == "scratch_vertical"
    assert report.defect_type_counts_basis == "spc_trigger"
    assert 0 < len(report.defect_frames) <= 2


def test_mock_provider_frames_use_catalog_expected_classes(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ai_provider", "mock")
    report = asyncio.run(
        inspect_production_window(0.03, defect_rate=0.12, defect_type="scratch_vertical")
    )
    catalog = {p.id: p for p in list_presets("qa_defect")}
    assert report.defect_frames
    for frame in report.defect_frames:
        assert frame.preset_id in catalog
        assert frame.source == "mock"
        assert frame.defect_class == catalog[frame.preset_id].expected_class == "scratch_vertical"
        assert frame.image_url == catalog[frame.preset_id].image_url
        assert frame.is_defect
    assert report.frame_class_counts == {"scratch_vertical": len(report.defect_frames)}


def test_mocked_gemini_classifies_catalog_images(monkeypatch: pytest.MonkeyPatch):
    calls: list[int] = []

    def fake_inspect(image_bytes, *, machine_id, tool_id, client=None):
        calls.append(len(image_bytes))
        return PartInspectionResult(defect_class="chipping", severity=3, region="center", confidence=0.8)

    monkeypatch.setattr(gemini_vision_tool, "is_gemini_vision_available", lambda: True)
    monkeypatch.setattr(gemini_vision_tool, "inspect_part_image", fake_inspect)
    monkeypatch.setattr(settings, "demo_scripted", False)
    report = asyncio.run(
        inspect_production_window(0.03, defect_rate=0.12, defect_type="scratch_vertical")
    )
    expected_ids = [
        p.id for p in list_presets("qa_defect") if p.expected_class == "scratch_vertical"
    ][:2]
    assert [f.preset_id for f in report.defect_frames] == expected_ids
    assert len(calls) == 2
    assert all(f.source == "gemini" and f.defect_class == "chipping" for f in report.defect_frames)
    assert report.frame_class_counts == {"chipping": 2}


def test_demo_scripted_guard_forces_expected_class(monkeypatch: pytest.MonkeyPatch):
    def fake_inspect(image_bytes, *, machine_id, tool_id, client=None):
        return PartInspectionResult(defect_class="none", severity=1, region="top", confidence=0.8)

    monkeypatch.setattr(gemini_vision_tool, "is_gemini_vision_available", lambda: True)
    monkeypatch.setattr(gemini_vision_tool, "inspect_part_image", fake_inspect)
    monkeypatch.setattr(settings, "demo_scripted", True)
    report = asyncio.run(
        inspect_production_window(0.03, defect_rate=0.12, defect_type="scratch_vertical")
    )
    assert all(
        f.source == "fallback" and f.defect_class == "scratch_vertical"
        for f in report.defect_frames
    )


def test_im05_window_uses_im_presets(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ai_provider", "mock")
    report = asyncio.run(
        inspect_production_window(
            0.03,
            defect_rate=0.1,
            defect_type="short_fill",
            machine_id="IM-05",
            tool_id="MOLD-03",
            scenario="im_damp_material",
        )
    )
    im_ids = {p.id for p in list_presets("im05") if p.expected_defect_detected}
    assert 0 < len(report.defect_frames) <= 2
    assert all(f.preset_id in im_ids and f.kind == "visual" for f in report.defect_frames)
    assert all(f.source == "mock" and f.is_defect for f in report.defect_frames)


def test_no_defects_means_no_frames(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ai_provider", "mock")
    report = asyncio.run(inspect_production_window(0.03, defect_rate=0.0))
    assert report.defect_frames == []
    assert report.defect_type_counts == {}


def test_post_repair_recovery_reaches_target_streak():
    results = _collect(50)
    assert results[-1].good_streak >= 50
    assert results[-1].defect_rate == 0.0


def test_post_repair_persistent_defects_stop_unverified(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(agent_quality_inspector, "_sample_is_defect", lambda: True)
    results = _collect(50)
    assert results[-1].good_streak == 0
    assert results[-1].defect_rate == 1.0
    assert len(results) * VERIFICATION_BATCH_PARTS <= 50 * 3 + VERIFICATION_BATCH_PARTS
