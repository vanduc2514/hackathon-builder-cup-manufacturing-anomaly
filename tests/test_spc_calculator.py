"""Unit tests for Statistical Process Control (SPC) calculator and gatekeeper."""

from __future__ import annotations

import pytest

from backend.core.models import IncidentState
from backend.tools.spc_calculator import (
    DEFAULT_BASELINE_P,
    DEFAULT_VERIFICATION_TARGET,
    StreakGatekeeper,
    build_spc_series,
    calculate_p_chart_limits,
    evaluate_defect_rate,
    evaluate_nelson_rules,
    evaluate_sliding_window,
    update_incident_verification,
)


class TestControlLimitComputation:
    """Tests for Shewhart p-chart control limit computation."""

    def test_standard_control_limits(self):
        # Centerline 0.005, sample size 300
        limits = calculate_p_chart_limits(p_bar=0.005, n=300)
        assert limits.centerline == 0.005
        assert limits.sample_size == 300
        assert limits.sigma > 0.0
        # UCL should be greater than centerline and LCL clamped to 0.0
        assert limits.ucl > 0.005
        assert limits.lcl == 0.0  # since p_bar - 3*sigma is negative

    def test_symmetric_control_limits(self):
        # Centerline 0.5 with large n should produce symmetric non-clamped limits
        limits = calculate_p_chart_limits(p_bar=0.5, n=1000)
        assert limits.centerline == 0.5
        assert limits.lcl > 0.0
        assert limits.ucl < 1.0
        diff_ucl = round(limits.ucl - limits.centerline, 5)
        diff_lcl = round(limits.centerline - limits.lcl, 5)
        assert diff_ucl == diff_lcl

    def test_zero_variance_boundaries(self):
        # p_bar = 0.0 -> variance = 0, sigma = 0, UCL = 0, LCL = 0
        limits_zero = calculate_p_chart_limits(p_bar=0.0, n=100)
        assert limits_zero.sigma == 0.0
        assert limits_zero.ucl == 0.0
        assert limits_zero.lcl == 0.0

        # p_bar = 1.0 -> variance = 0, sigma = 0, UCL = 1, LCL = 1
        limits_one = calculate_p_chart_limits(p_bar=1.0, n=100)
        assert limits_one.sigma == 0.0
        assert limits_one.ucl == 1.0
        assert limits_one.lcl == 1.0

    def test_invalid_parameters_raise(self):
        with pytest.raises(
            ValueError, match="Baseline defect rate p_bar must be between 0.0 and 1.0"
        ):
            calculate_p_chart_limits(p_bar=-0.01, n=100)

        with pytest.raises(
            ValueError, match="Baseline defect rate p_bar must be between 0.0 and 1.0"
        ):
            calculate_p_chart_limits(p_bar=1.05, n=100)

        with pytest.raises(ValueError, match="Sample size n must be greater than 0"):
            calculate_p_chart_limits(p_bar=0.05, n=0)

        with pytest.raises(ValueError, match="Sample size n must be greater than 0"):
            calculate_p_chart_limits(p_bar=0.05, n=-10)


class TestDefectSpikeDetection:
    """Tests for defect spike and sliding window breach evaluation."""

    def test_defect_spike_breach_sample_issue_criteria(self):
        # Issue 19 scenario: 23 defects in 300 products (7.67%), baseline 0.5%, UCL 3.0%
        result = evaluate_defect_rate(
            defect_count=23,
            sample_size=300,
            baseline_p=DEFAULT_BASELINE_P,
            ucl_override=0.030,
        )
        assert round(result.defect_rate, 4) == 0.0767
        assert result.is_breached is True
        assert result.breach_direction == "upper"
        assert len(result.violations) == 1
        assert result.violations[0].rule_id == 1
        assert "exceeded UCL" in result.violations[0].description

    def test_defect_rate_within_control_limits(self):
        # 1 defect in 300 products (0.33%), well within UCL
        result = evaluate_defect_rate(
            defect_count=1,
            sample_size=300,
            baseline_p=DEFAULT_BASELINE_P,
            ucl_override=0.030,
        )
        assert result.defect_rate < 0.030
        assert result.is_breached is False
        assert result.breach_direction is None
        assert len(result.violations) == 0

    def test_lower_control_limit_breach(self):
        # Centerline 0.5, LCL override 0.40, rate 0.20
        result = evaluate_defect_rate(
            defect_count=20,
            sample_size=100,
            baseline_p=0.5,
            lcl_override=0.40,
        )
        assert result.is_breached is True
        assert result.breach_direction == "lower"
        assert len(result.violations) == 1
        assert result.violations[0].rule_name == "Lower Control Limit Breach"

    def test_evaluate_defect_rate_invalid_arguments(self):
        with pytest.raises(ValueError, match="sample_size must be greater than 0"):
            evaluate_defect_rate(defect_count=0, sample_size=0)

        with pytest.raises(ValueError, match="defect_count must be between 0 and sample_size"):
            evaluate_defect_rate(defect_count=50, sample_size=40)

        with pytest.raises(ValueError, match="defect_count must be between 0 and sample_size"):
            evaluate_defect_rate(defect_count=-1, sample_size=40)

    def test_evaluate_sliding_window_boolean_stream(self):
        # 300 samples with 23 defects
        samples = [True] * 23 + [False] * 277
        result = evaluate_sliding_window(samples=samples, ucl_override=0.030)
        assert result.defect_count == 23
        assert result.sample_size == 300
        assert result.is_breached is True

    def test_evaluate_sliding_window_recent_window_slicing(self):
        # Stream has 500 parts: first 200 had many defects, last 300 are defect-free
        stream = [True] * 50 + [False] * 150 + [False] * 300
        result = evaluate_sliding_window(samples=stream, window_size=300, ucl_override=0.030)
        assert result.sample_size == 300
        assert result.defect_count == 0
        assert result.is_breached is False

    def test_evaluate_sliding_window_empty_raises(self):
        with pytest.raises(ValueError, match="samples sequence cannot be empty"):
            evaluate_sliding_window(samples=[])


class TestNelsonRulesEvaluation:
    """Tests for Nelson run-rules detection."""

    def test_nelson_rule_1_outlier(self):
        # Centerline 0.01, UCL 0.03, one rate is 0.08
        rates = [0.01, 0.012, 0.08, 0.009]
        violations = evaluate_nelson_rules(rates, centerline=0.01, ucl=0.03, lcl=0.0)
        r1 = [v for v in violations if v.rule_id == 1]
        assert len(r1) == 1
        assert 2 in r1[0].violation_indices

    def test_nelson_rule_2_eight_consecutive_points_above_centerline(self):
        # 8 consecutive points strictly above centerline (0.01)
        rates = [0.015] * 8
        violations = evaluate_nelson_rules(rates, centerline=0.01, rule2_run_length=8)
        r2 = [v for v in violations if v.rule_id == 2]
        assert len(r2) >= 1
        assert "upper side" in r2[0].description

    def test_nelson_rule_2_eight_consecutive_points_below_centerline(self):
        # 8 consecutive points strictly below centerline (0.05)
        rates = [0.02] * 8
        violations = evaluate_nelson_rules(rates, centerline=0.05, rule2_run_length=8)
        r2 = [v for v in violations if v.rule_id == 2]
        assert len(r2) >= 1
        assert "lower side" in r2[0].description

    def test_nelson_rule_3_continuous_rising_trend(self):
        # 6 consecutive increasing points
        rates = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06]
        violations = evaluate_nelson_rules(rates, centerline=0.03)
        r3 = [v for v in violations if v.rule_id == 3]
        assert len(r3) >= 1
        assert "continuously increasing" in r3[0].description

    def test_nelson_rule_3_continuous_decreasing_trend(self):
        # 6 consecutive decreasing points
        rates = [0.06, 0.05, 0.04, 0.03, 0.02, 0.01]
        violations = evaluate_nelson_rules(rates, centerline=0.03)
        r3 = [v for v in violations if v.rule_id == 3]
        assert len(r3) >= 1
        assert "continuously decreasing" in r3[0].description

    def test_nelson_rule_4_fourteen_points_alternating(self):
        # 14 alternating points
        rates = [0.01, 0.03] * 7
        violations = evaluate_nelson_rules(rates, centerline=0.02)
        r4 = [v for v in violations if v.rule_id == 4]
        assert len(r4) >= 1
        assert r4[0].rule_name == "Oscillation / Alternation"

    def test_empty_rates_returns_empty_violations(self):
        assert evaluate_nelson_rules([]) == []


class TestStreakGatekeeper:
    """Tests for consecutive good-product streak counter and verification gatekeeper."""

    def test_initial_state(self):
        gk = StreakGatekeeper(target=DEFAULT_VERIFICATION_TARGET)
        assert gk.current_streak == 0
        assert gk.is_verified is False
        assert gk.target == 50

    def test_streak_progression_to_target(self):
        gk = StreakGatekeeper(target=50)

        # Feed 49 good products
        for i in range(1, 50):
            res = gk.record_sample(is_defect=False)
            assert res.good_streak == i
            assert res.verified is False
            assert res.recurrence_detected is False

        # Feed 50th good product
        final_res = gk.record_sample(is_defect=False)
        assert final_res.good_streak == 50
        assert final_res.verified is True
        assert gk.is_verified is True
        assert "Verification target met" in final_res.message

    def test_streak_reset_on_defect_recurrence(self):
        gk = StreakGatekeeper(target=50)

        # Feed 30 good products
        for _ in range(30):
            gk.record_sample(is_defect=False)
        assert gk.current_streak == 30

        # Feed 1 defective product
        res = gk.record_sample(is_defect=True)
        assert res.good_streak == 0
        assert res.verified is False
        assert res.last_was_defect is True
        assert res.recurrence_detected is True
        assert gk.current_streak == 0
        assert gk.is_verified is False

    def test_streak_reset_after_verified(self):
        gk = StreakGatekeeper(target=5)
        for _ in range(5):
            gk.record_sample(is_defect=False)
        assert gk.is_verified is True

        # Defect occurs after verification
        res = gk.record_sample(is_defect=True)
        assert res.good_streak == 0
        assert res.verified is False
        assert res.recurrence_detected is True

    def test_manual_reset(self):
        gk = StreakGatekeeper(target=10)
        for _ in range(7):
            gk.record_sample(is_defect=False)
        assert gk.current_streak == 7
        gk.reset()
        assert gk.current_streak == 0
        assert gk.is_verified is False

    def test_invalid_target_raises(self):
        with pytest.raises(ValueError, match="target must be greater than 0"):
            StreakGatekeeper(target=0)


class TestIncidentStateIntegration:
    """Tests for update_incident_verification integrating with IncidentState."""

    def test_incident_streak_verification_closure(self):
        incident = IncidentState(
            incident_id="INC-001",
            status="verifying",
            verification_count=49,
            verification_target=50,
        )
        res = update_incident_verification(incident_state=incident, is_defect=False)
        assert res.good_streak == 50
        assert res.verified is True
        assert incident.verification_count == 50
        assert incident.status == "closed"

    def test_incident_recurrence_reverts_to_investigating(self):
        incident = IncidentState(
            incident_id="INC-002",
            status="verifying",
            verification_count=35,
            verification_target=50,
        )
        res = update_incident_verification(incident_state=incident, is_defect=True)
        assert res.good_streak == 0
        assert res.recurrence_detected is True
        assert incident.verification_count == 0
        assert incident.status == "investigating"


class TestBuildSpcSeries:
    """Tests for pure build_spc_series defect proportion run chart generator."""

    def test_empty_records_returns_empty_points(self):
        res = build_spc_series([], ucl=0.03, subgroup=20, centerline=0.005)
        assert res.points == []
        assert res.peak_rate == 0.0
        assert res.violations == []
        assert res.ucl == 0.03
        assert res.centerline == 0.005
        assert res.subgroup == 20
        assert res.source == "seed"

    def test_hand_built_rates_and_subgroup_trailing_window(self):
        records = [
            {
                "product_id": "P0",
                "timestamp": "2026-10-05T09:00:00Z",
                "machine_id": "CNC-01",
                "is_defect": False,
            },
            {
                "product_id": "P1",
                "timestamp": "2026-10-05T09:01:00Z",
                "machine_id": "CNC-01",
                "is_defect": False,
            },
            {
                "product_id": "P2",
                "timestamp": "2026-10-05T09:02:00Z",
                "machine_id": "CNC-01",
                "is_defect": True,
            },
            {
                "product_id": "P3",
                "timestamp": "2026-10-05T09:03:00Z",
                "machine_id": "CNC-01",
                "is_defect": False,
            },
            {
                "product_id": "P4",
                "timestamp": "2026-10-05T09:04:00Z",
                "machine_id": "CNC-01",
                "is_defect": False,
            },
        ]
        res = build_spc_series(records, ucl=0.03, subgroup=3)
        assert len(res.points) == 5
        assert res.points[0].subgroup_n == 1
        assert res.points[0].defect_rate == 0.0
        assert res.points[1].subgroup_n == 2
        assert res.points[1].defect_rate == 0.0
        assert res.points[2].subgroup_n == 3
        assert res.points[2].defect_rate == 0.333333
        assert res.points[3].subgroup_n == 3
        assert res.points[3].defect_rate == 0.333333
        assert res.points[4].subgroup_n == 3
        assert res.points[4].defect_rate == 0.333333

    def test_ucl_passthrough_and_peak_rate(self):
        records = [
            {
                "product_id": f"P{i}",
                "timestamp": "2026-10-05T09:00:00Z",
                "machine_id": "CNC-02",
                "is_defect": i % 5 == 0,
            }
            for i in range(10)
        ]
        custom_ucl = 0.045
        res = build_spc_series(records, ucl=custom_ucl, subgroup=5)
        assert res.ucl == custom_ucl
        expected_max = max(p.defect_rate for p in res.points)
        assert res.peak_rate == expected_max
        assert res.peak_rate > 0.0

    def test_out_of_control_on_synthetic_spike_and_nelson_rule_1(self):
        records = [
            {
                "product_id": f"P{i}",
                "timestamp": f"2026-10-05T09:{i:02d}:00Z",
                "machine_id": "CNC-02",
                "is_defect": False,
            }
            for i in range(19)
        ]
        records.append(
            {
                "product_id": "P19",
                "timestamp": "2026-10-05T09:20:00Z",
                "machine_id": "CNC-02",
                "is_defect": True,
            }
        )
        res = build_spc_series(records, ucl=0.03, subgroup=20)
        assert res.points[-1].defect_rate == 0.05
        assert all(not p.out_of_control for p in res.points[:19])
        assert res.points[-1].out_of_control is True
        rule_1_violations = [v for v in res.violations if v.rule_id == 1]
        assert len(rule_1_violations) == 1
        assert 19 in rule_1_violations[0].violation_indices

    def test_all_pass_window_zero_ooc_and_empty_violations(self):
        records = [
            {
                "product_id": f"P{i}",
                "timestamp": f"2026-10-05T09:{i:02d}:00Z",
                "machine_id": "CNC-02",
                "is_defect": False,
            }
            for i in range(40)
        ]
        res = build_spc_series(records, ucl=0.03, subgroup=20, centerline=0.005)
        assert len(res.points) == 40
        ooc_count = sum(1 for p in res.points if p.out_of_control)
        assert ooc_count == 0
        assert res.violations == []

    def test_single_excursion_only_excursion_points_ooc(self):
        records = [
            {
                "product_id": f"P{i}",
                "timestamp": f"2026-10-05T09:{i:02d}:00Z",
                "machine_id": "CNC-02",
                "is_defect": (i == 25),
            }
            for i in range(40)
        ]
        res = build_spc_series(records, ucl=0.03, subgroup=20, centerline=0.005)
        # Prior to defect at 25, defect rate is 0.0 <= UCL -> out_of_control must be False
        assert all(not p.out_of_control for p in res.points[:25])
        # At index 25, rate is 1/20 = 0.05 > 0.03 -> out_of_control is True
        assert res.points[25].out_of_control is True
        # Verify strictly that out_of_control matches rate > ucl
        for p in res.points:
            assert p.out_of_control == (p.defect_rate > 0.03)

    def test_no_duplicate_rule_id_and_merged_unique_indices(self):
        records = [
            {
                "product_id": f"P{i}",
                "timestamp": f"2026-10-05T09:{i:02d}:00Z",
                "machine_id": "CNC-02",
                "is_defect": (i >= 15 and i <= 25),
            }
            for i in range(35)
        ]
        res = build_spc_series(records, ucl=0.03, subgroup=10, centerline=0.005)
        rule_ids = [v.rule_id for v in res.violations]
        assert len(rule_ids) == len(set(rule_ids)), f"Duplicate rule IDs found: {rule_ids}"
        for v in res.violations:
            assert v.violation_indices == sorted(set(v.violation_indices))
            assert len(v.violation_indices) > 0
