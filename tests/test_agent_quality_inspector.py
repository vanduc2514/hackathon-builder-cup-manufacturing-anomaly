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
from backend.core.models import VerificationResult


@pytest.fixture(autouse=True)
def clean_line():
    blackboard.reset()
    yield
    blackboard.reset()


def _collect(target: int) -> list[VerificationResult]:
    async def run() -> list[VerificationResult]:
        return [result async for result in inspect_post_repair_products(target, 0)]

    return asyncio.run(run())


def test_cnc_tool_wear_window_breaches_upper_ucl():
    report = asyncio.run(
        inspect_production_window(0.03, defect_rate=0.12, defect_type="scratch_vertical")
    )
    assert report.spc.sample_size == 300
    assert report.spc.breach_direction == "upper"
    counts = report.defect_type_counts
    assert max(counts, key=counts.get) == "scratch_vertical"
    assert 0 < len(report.defect_frames) <= 5
    assert all(frame.is_defect for frame in report.defect_frames)


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
