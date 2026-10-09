"""Quality Inspector measurement tests: Phase A conveyor SPC window and Phase C streak gatekeeper."""

from __future__ import annotations

import asyncio

import pytest

from backend.agents.agent_quality_inspector import (
    VERIFICATION_BATCH_PARTS,
    inspect_post_repair_products,
    inspect_production_window,
)
from backend.core.models import VerificationResult
from simulator.injection_engine import injection_engine
from simulator.models import ConveyorPart


@pytest.fixture(autouse=True)
def clean_line():
    injection_engine.reset()
    yield
    injection_engine.reset()


def _collect(target: int) -> list[VerificationResult]:
    async def run() -> list[VerificationResult]:
        return [result async for result in inspect_post_repair_products(target, 0)]

    return asyncio.run(run())


def test_cnc_tool_wear_window_breaches_upper_ucl():
    injection_engine.inject_scenario_1_cnc_tool_wear()
    report = asyncio.run(inspect_production_window(0.03))
    assert report.spc.sample_size == 300
    assert report.spc.breach_direction == "upper"
    counts = report.defect_type_counts
    assert max(counts, key=counts.get) == "scratch_vertical"
    assert 0 < len(report.defect_frames) <= 5
    assert all(frame.is_defect for frame in report.defect_frames)


def test_post_repair_recovery_reaches_target_streak():
    injection_engine.inject_scenario_1_cnc_tool_wear()
    injection_engine.set_verification_recovery()
    results = _collect(50)
    assert results[-1].good_streak >= 50
    assert results[-1].defect_rate == 0.0


def test_post_repair_persistent_defects_stop_unverified(monkeypatch: pytest.MonkeyPatch):
    defect = ConveyorPart(
        product_id="PRD-X",
        machine_id="CNC-02",
        tool_id="T07",
        status="DEFECT_SCRATCH",
        defect_type="scratch_vertical",
    )
    monkeypatch.setattr(injection_engine.conveyor_sim, "tick", lambda: [defect])
    results = _collect(50)
    assert results[-1].good_streak == 0
    assert results[-1].defect_rate == 1.0
    assert len(results) * VERIFICATION_BATCH_PARTS <= 50 * 3 + VERIFICATION_BATCH_PARTS
