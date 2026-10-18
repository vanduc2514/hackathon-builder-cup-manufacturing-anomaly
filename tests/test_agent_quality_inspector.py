"""Quality Inspector measurement tests: Phase A conveyor SPC window and Phase C streak gatekeeper."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

import pytest

from backend.agents.agent_quality_inspector import (
    VERIFICATION_BATCH_PARTS,
    _sample_indices,
    inspect_post_repair_products,
    inspect_production_window,
)
from backend.agents.workflow_nodes import verification_gate
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


def _collect(target: int, **kwargs) -> list[VerificationResult]:
    async def run() -> list[VerificationResult]:
        return [result async for result in inspect_post_repair_products(target, 0, **kwargs)]

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


def _mock_gemini(monkeypatch: pytest.MonkeyPatch, defect_class: str) -> list[int]:
    calls: list[int] = []

    def fake_inspect(image_bytes, *, machine_id, tool_id, client=None):
        calls.append(len(image_bytes))
        return PartInspectionResult(
            defect_class=defect_class, severity=2, region="center", confidence=0.9
        )

    monkeypatch.setattr(gemini_vision_tool, "is_gemini_vision_available", lambda: True)
    monkeypatch.setattr(gemini_vision_tool, "inspect_part_image", fake_inspect)
    return calls


def _gate(result: VerificationResult, target: int = 50):
    """Runs the verification gate on the Blackboard tally the workflow node would write."""
    blackboard.update_status(
        "verifying", verification_count=result.good_streak, verification_target=target
    )
    ctx = MagicMock()
    ctx.state = {"reopen_count": 0}
    return asyncio.run(verification_gate(ctx, result))


def test_sample_indices_spread_first_middle_last():
    assert _sample_indices(50, 3) == [0, 24, 49]
    assert _sample_indices(50, 1) == [0]
    assert _sample_indices(50, 0) == []
    assert _sample_indices(2, 5) == [0, 1]


def test_post_repair_samples_clean_verifies(monkeypatch: pytest.MonkeyPatch):
    calls = _mock_gemini(monkeypatch, "none")
    monkeypatch.setattr(settings, "demo_scripted", False)
    results = _collect(50)
    final = results[-1]
    assert final.good_streak >= 50
    assert final.defect_rate == 0.0
    assert not final.recurrence
    assert len(calls) == settings.streak_gemini_samples == 3
    streak_good = [p.id for p in list_presets("streak_good")]
    assert [s.preset_id for s in final.samples] == streak_good[:3]
    assert all(s.source == "gemini" and not s.is_defect for s in final.samples)

    event = _gate(final)
    assert event.actions.route == "VERIFIED"
    finding = blackboard.get_state().findings[-1]
    assert finding.source == "gemini"
    assert "3 part(s) image-checked (gemini)" in finding.evidence
    assert all(pid in finding.evidence for pid in streak_good[:3])


def test_post_repair_gemini_defect_resets_streak_and_gate_fails(monkeypatch: pytest.MonkeyPatch):
    calls = _mock_gemini(monkeypatch, "scratch_vertical")
    monkeypatch.setattr(settings, "demo_scripted", False)
    results = _collect(50)
    final = results[-1]
    assert final.recurrence
    assert final.good_streak == 0
    assert final.samples[0].source == "gemini" and final.samples[0].defect_class == "scratch_vertical"
    assert len(calls) == 1
    assert results[-1] is final and len(results) == 1

    event = _gate(final)
    assert event.actions.route == "NOT_VERIFIED"
    assert blackboard.get_state().status != "closed"
    finding = blackboard.get_state().findings[-1]
    assert finding.source == "gemini"
    assert final.samples[0].preset_id in finding.evidence
    assert "scratch_vertical" in finding.evidence


def test_post_repair_demo_scripted_mismatch_keeps_streak(monkeypatch: pytest.MonkeyPatch):
    _mock_gemini(monkeypatch, "scratch_vertical")
    monkeypatch.setattr(settings, "demo_scripted", True)
    final = _collect(50)[-1]
    assert not final.recurrence
    assert final.good_streak >= 50
    assert all(
        s.source == "fallback" and s.defect_class == "none" and not s.is_defect
        for s in final.samples
    )
    assert _gate(final).actions.route == "VERIFIED"
    assert blackboard.get_state().findings[-1].source == "fallback"


def test_post_repair_gemini_unavailable_uses_mock_and_completes(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ai_provider", "mock")
    final = _collect(50)[-1]
    assert final.good_streak >= 50
    assert len(final.samples) == 3
    assert all(s.source == "mock" and not s.is_defect for s in final.samples)
    assert _gate(final).actions.route == "VERIFIED"
    assert blackboard.get_state().findings[-1].source == "mock"


def test_post_repair_gemini_error_is_recorded_as_mock(monkeypatch: pytest.MonkeyPatch):
    def boom(image_bytes, *, machine_id, tool_id, client=None):
        raise RuntimeError("vertex down")

    monkeypatch.setattr(gemini_vision_tool, "is_gemini_vision_available", lambda: True)
    monkeypatch.setattr(gemini_vision_tool, "inspect_part_image", boom)
    monkeypatch.setattr(settings, "demo_scripted", False)
    final = _collect(50)[-1]
    assert final.good_streak >= 50
    assert all(s.source == "mock" for s in final.samples)


def test_post_repair_im05_uses_defect_free_im_preset(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ai_provider", "mock")
    final = _collect(
        50, machine_id="IM-05", tool_id="MOLD-03", scenario="im_damp_material"
    )[-1]
    assert final.good_streak >= 50
    assert {s.preset_id for s in final.samples} == {"preset-im05-normal"}
    assert all(s.kind == "visual" and not s.is_defect for s in final.samples)


def test_post_repair_gemini_samples_setting_zero_skips_images(monkeypatch: pytest.MonkeyPatch):
    calls = _mock_gemini(monkeypatch, "scratch_vertical")
    monkeypatch.setattr(settings, "streak_gemini_samples", 0)
    final = _collect(50)[-1]
    assert final.samples == [] and calls == []
    assert final.good_streak >= 50
    assert _gate(final).actions.route == "VERIFIED"
    assert "No part was image-checked" in blackboard.get_state().findings[-1].evidence


def test_post_repair_persistent_conveyor_defects_stop_unverified(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ai_provider", "mock")
    results = _collect(50, conveyor_defect_rate=1.0)
    assert results[-1].good_streak == 0
    assert results[-1].defect_rate == pytest.approx(1 - 3 / (50 * 3), abs=0.01)
    assert len(results) * VERIFICATION_BATCH_PARTS <= 50 * 3 + VERIFICATION_BATCH_PARTS


def test_post_repair_injected_evaluator_controls_non_sampled_parts(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "ai_provider", "mock")
    results = _collect(50, sample_evaluator=lambda: True)
    assert results[-1].good_streak == 0
    assert len(results) * VERIFICATION_BATCH_PARTS <= 50 * 3 + VERIFICATION_BATCH_PARTS


def test_post_repair_conveyor_draw_is_seeded(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "streak_gemini_samples", 0)
    first = _collect(50, conveyor_defect_rate=0.05, seed=3)
    second = _collect(50, conveyor_defect_rate=0.05, seed=3)
    assert [r.model_dump() for r in first] == [r.model_dump() for r in second]
