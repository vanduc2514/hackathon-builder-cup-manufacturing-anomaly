"""ADK Tool: Statistical Process Control calculations and post-repair consecutive good-product streak counter."""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Literal, Optional, Sequence

from backend.core.models import (
    ControlLimits,
    IncidentState,
    NelsonRuleViolation,
    SpcEvaluationResult,
    SpcSeriesPoint,
    SpcSeriesResponse,
    StreakVerificationResult,
)

logger = logging.getLogger(__name__)

DEFAULT_BASELINE_P = 0.005  # 0.5% nominal defect rate
DEFAULT_VERIFICATION_TARGET = 50  # 50 consecutive defect-free parts required post-repair


def calculate_p_chart_limits(p_bar: float, n: int) -> ControlLimits:
    """Calculates standard Shewhart p-chart control limits.

    Formula:
        sigma = sqrt(p_bar * (1 - p_bar) / n)
        UCL = min(1.0, p_bar + 3 * sigma)
        LCL = max(0.0, p_bar - 3 * sigma)

    Args:
        p_bar: Centerline historical defect rate (0.0 <= p_bar <= 1.0).
        n: Subgroup sample size (n > 0).

    Returns:
        ControlLimits object containing centerline, UCL, LCL, sample_size, and sigma.

    Raises:
        ValueError: If p_bar is outside [0.0, 1.0] or n <= 0.
    """
    if not (0.0 <= p_bar <= 1.0):
        raise ValueError(f"Baseline defect rate p_bar must be between 0.0 and 1.0, got {p_bar}")
    if n <= 0:
        raise ValueError(f"Sample size n must be greater than 0, got {n}")

    variance = p_bar * (1.0 - p_bar) / n
    sigma = math.sqrt(variance)

    ucl = min(1.0, p_bar + 3.0 * sigma)
    lcl = max(0.0, p_bar - 3.0 * sigma)

    return ControlLimits(
        centerline=round(p_bar, 6),
        ucl=round(ucl, 6),
        lcl=round(lcl, 6),
        sample_size=n,
        sigma=round(sigma, 6),
    )


def evaluate_defect_rate(
    defect_count: int,
    sample_size: int,
    baseline_p: float = DEFAULT_BASELINE_P,
    ucl_override: Optional[float] = None,
    lcl_override: Optional[float] = None,
) -> SpcEvaluationResult:
    """Evaluates an inspection subgroup against Shewhart control limits to detect defect spikes.

    Args:
        defect_count: Number of observed defective parts in the subgroup (>= 0).
        sample_size: Total parts evaluated in the subgroup (> 0).
        baseline_p: Centerline defect rate for computing limits if not overridden.
        ucl_override: Optional explicit Upper Control Limit (e.g. 0.030).
        lcl_override: Optional explicit Lower Control Limit (e.g. 0.0).

    Returns:
        SpcEvaluationResult detailing defect rate, control limits, breach status, and violations.

    Raises:
        ValueError: If sample_size <= 0 or defect_count is out of range [0, sample_size].
    """
    if sample_size <= 0:
        raise ValueError(f"sample_size must be greater than 0, got {sample_size}")
    if not (0 <= defect_count <= sample_size):
        raise ValueError(
            f"defect_count must be between 0 and sample_size ({sample_size}), got {defect_count}"
        )

    defect_rate = defect_count / sample_size
    limits = calculate_p_chart_limits(baseline_p, sample_size)

    if ucl_override is not None:
        limits.ucl = round(ucl_override, 6)
    if lcl_override is not None:
        limits.lcl = round(lcl_override, 6)

    is_breached = False
    breach_direction: Optional[str] = None
    violations: List[NelsonRuleViolation] = []

    if defect_rate > limits.ucl:
        is_breached = True
        breach_direction = "upper"
        violations.append(
            NelsonRuleViolation(
                rule_id=1,
                rule_name="Upper Control Limit Breach",
                description=(
                    f"Defect rate ({defect_rate:.4%}) exceeded UCL ({limits.ucl:.4%}) "
                    f"with {defect_count} defects in {sample_size} parts."
                ),
                violation_indices=[0],
            )
        )
    elif defect_rate < limits.lcl:
        is_breached = True
        breach_direction = "lower"
        violations.append(
            NelsonRuleViolation(
                rule_id=1,
                rule_name="Lower Control Limit Breach",
                description=(
                    f"Defect rate ({defect_rate:.4%}) fell below LCL ({limits.lcl:.4%}) "
                    f"with {defect_count} defects in {sample_size} parts."
                ),
                violation_indices=[0],
            )
        )

    return SpcEvaluationResult(
        sample_size=sample_size,
        defect_count=defect_count,
        defect_rate=round(defect_rate, 6),
        limits=limits,
        is_breached=is_breached,
        breach_direction=breach_direction,
        violations=violations,
    )


def evaluate_sliding_window(
    samples: Sequence[bool | int],
    baseline_p: float = DEFAULT_BASELINE_P,
    window_size: Optional[int] = 300,
    ucl_override: Optional[float] = None,
    lcl_override: Optional[float] = None,
) -> SpcEvaluationResult:
    """Evaluates the most recent window of inspection outcomes (True/1=defect, False/0=good).

    Args:
        samples: Sequence of boolean/int inspection flags.
        baseline_p: Baseline defect proportion.
        window_size: Maximum sliding window length (defaults to 300). If None or larger than
                     samples, all samples are evaluated.
        ucl_override: Optional UCL override.
        lcl_override: Optional LCL override.

    Returns:
        SpcEvaluationResult for the sliding window.
    """
    if not samples:
        raise ValueError("samples sequence cannot be empty")

    if window_size is not None and window_size > 0 and len(samples) > window_size:
        active_window = samples[-window_size:]
    else:
        active_window = samples

    sample_size = len(active_window)
    defect_count = sum(1 for item in active_window if bool(item))

    return evaluate_defect_rate(
        defect_count=defect_count,
        sample_size=sample_size,
        baseline_p=baseline_p,
        ucl_override=ucl_override,
        lcl_override=lcl_override,
    )


def evaluate_nelson_rules(
    rates: Sequence[float],
    centerline: float = DEFAULT_BASELINE_P,
    sigma: Optional[float] = None,
    sample_size: Optional[int] = None,
    ucl: Optional[float] = None,
    lcl: Optional[float] = None,
    rule2_run_length: int = 8,
) -> List[NelsonRuleViolation]:
    """Evaluates Nelson control chart rules over a sequence of successive subgroup defect rates.

    Rules evaluated:
        - Rule 1: Point beyond 3-sigma (exceeds UCL or falls below LCL).
        - Rule 2: Consecutive points on the same side of the centerline (default: 8 points).
        - Rule 3: 6 consecutive points continuously increasing or continuously decreasing.
        - Rule 4: 14 consecutive points alternating up and down.
        - Rule 5: 2 out of 3 consecutive points > 2 sigma on the same side.
        - Rule 6: 4 out of 5 consecutive points > 1 sigma on the same side.
        - Rule 7: 15 consecutive points within 1 sigma (Zone C).
        - Rule 8: 8 consecutive points outside 1 sigma with none in Zone C.

    Args:
        rates: Chronological series of subgroup defect rates.
        centerline: Centerline proportion p_bar.
        sigma: Standard error of proportion. If None and sample_size is provided, computed.
        sample_size: Subgroup size used to compute sigma if not explicitly passed.
        ucl: Upper control limit override.
        lcl: Lower control limit override.
        rule2_run_length: Run length for Rule 2 (default 8 per Issue 19 specification).

    Returns:
        List of detected NelsonRuleViolation items.
    """
    violations: List[NelsonRuleViolation] = []
    num_points = len(rates)
    if num_points == 0:
        return violations

    # Resolve sigma and control limits
    if sigma is None:
        if sample_size is not None and sample_size > 0:
            sigma = math.sqrt(centerline * (1.0 - centerline) / sample_size)
        else:
            # Fallback to empirical population standard deviation or conservative default
            if num_points > 1:
                variance = sum((r - centerline) ** 2 for r in rates) / num_points
                sigma = math.sqrt(variance) if variance > 0 else 0.001
            else:
                sigma = 0.001

    upper_limit = ucl if ucl is not None else min(1.0, centerline + 3.0 * sigma)
    lower_limit = lcl if lcl is not None else max(0.0, centerline - 3.0 * sigma)

    # Rule 1: One point beyond 3-sigma (> UCL or < LCL)
    rule1_indices = [idx for idx, val in enumerate(rates) if val > upper_limit or val < lower_limit]
    if rule1_indices:
        violations.append(
            NelsonRuleViolation(
                rule_id=1,
                rule_name="Point Beyond 3-Sigma Limits",
                description=(
                    f"{len(rule1_indices)} point(s) exceeded control limits "
                    f"[LCL={lower_limit:.4f}, UCL={upper_limit:.4f}]."
                ),
                violation_indices=rule1_indices,
            )
        )

    # Rule 2: K consecutive points on same side of centerline (default: 8)
    if num_points >= rule2_run_length:
        for i in range(rule2_run_length, num_points + 1):
            window = rates[i - rule2_run_length : i]
            indices = list(range(i - rule2_run_length, i))
            if all(val > centerline for val in window):
                violations.append(
                    NelsonRuleViolation(
                        rule_id=2,
                        rule_name="Centerline Shift / Bias",
                        description=(
                            f"{rule2_run_length} consecutive points on the upper side of centerline ({centerline:.4f})."
                        ),
                        violation_indices=indices,
                    )
                )
            elif all(val < centerline for val in window):
                violations.append(
                    NelsonRuleViolation(
                        rule_id=2,
                        rule_name="Centerline Shift / Bias",
                        description=(
                            f"{rule2_run_length} consecutive points on the lower side of centerline ({centerline:.4f})."
                        ),
                        violation_indices=indices,
                    )
                )

    # Rule 3: 6 consecutive points continuously increasing or continuously decreasing
    trend_length = 6
    if num_points >= trend_length:
        for i in range(trend_length, num_points + 1):
            window = rates[i - trend_length : i]
            indices = list(range(i - trend_length, i))
            is_increasing = all(window[j] < window[j + 1] for j in range(trend_length - 1))
            is_decreasing = all(window[j] > window[j + 1] for j in range(trend_length - 1))
            if is_increasing:
                violations.append(
                    NelsonRuleViolation(
                        rule_id=3,
                        rule_name="Continuous Trend",
                        description=f"{trend_length} consecutive points continuously increasing.",
                        violation_indices=indices,
                    )
                )
            elif is_decreasing:
                violations.append(
                    NelsonRuleViolation(
                        rule_id=3,
                        rule_name="Continuous Trend",
                        description=f"{trend_length} consecutive points continuously decreasing.",
                        violation_indices=indices,
                    )
                )

    # Rule 4: 14 consecutive points alternating up and down
    alt_length = 14
    if num_points >= alt_length:
        for i in range(alt_length, num_points + 1):
            window = rates[i - alt_length : i]
            indices = list(range(i - alt_length, i))
            diffs = [window[j + 1] - window[j] for j in range(alt_length - 1)]
            # Signs alternate (+, -, +, - ... or -, +, -, + ...)
            alternates = all(diffs[j] * diffs[j + 1] < 0 for j in range(len(diffs) - 1))
            if alternates:
                violations.append(
                    NelsonRuleViolation(
                        rule_id=4,
                        rule_name="Oscillation / Alternation",
                        description=f"{alt_length} consecutive points alternating direction.",
                        violation_indices=indices,
                    )
                )

    # Rule 5: 2 out of 3 consecutive points > 2 sigma on the same side
    zone_a_upper = centerline + 2.0 * sigma
    zone_a_lower = centerline - 2.0 * sigma
    if num_points >= 3:
        for i in range(3, num_points + 1):
            window = rates[i - 3 : i]
            indices = list(range(i - 3, i))
            if sum(1 for v in window if v > zone_a_upper) >= 2:
                violations.append(
                    NelsonRuleViolation(
                        rule_id=5,
                        rule_name="Zone A Breach (Upper)",
                        description="2 out of 3 points beyond 2-sigma on upper side.",
                        violation_indices=indices,
                    )
                )
            elif sum(1 for v in window if v < zone_a_lower) >= 2:
                violations.append(
                    NelsonRuleViolation(
                        rule_id=5,
                        rule_name="Zone A Breach (Lower)",
                        description="2 out of 3 points beyond 2-sigma on lower side.",
                        violation_indices=indices,
                    )
                )

    # Rule 6: 4 out of 5 consecutive points > 1 sigma on the same side
    zone_b_upper = centerline + 1.0 * sigma
    zone_b_lower = centerline - 1.0 * sigma
    if num_points >= 5:
        for i in range(5, num_points + 1):
            window = rates[i - 5 : i]
            indices = list(range(i - 5, i))
            if sum(1 for v in window if v > zone_b_upper) >= 4:
                violations.append(
                    NelsonRuleViolation(
                        rule_id=6,
                        rule_name="Zone B Breach (Upper)",
                        description="4 out of 5 points beyond 1-sigma on upper side.",
                        violation_indices=indices,
                    )
                )
            elif sum(1 for v in window if v < zone_b_lower) >= 4:
                violations.append(
                    NelsonRuleViolation(
                        rule_id=6,
                        rule_name="Zone B Breach (Lower)",
                        description="4 out of 5 points beyond 1-sigma on lower side.",
                        violation_indices=indices,
                    )
                )

    # Rule 7: 15 consecutive points within 1 sigma (Zone C stratification)
    if num_points >= 15:
        for i in range(15, num_points + 1):
            window = rates[i - 15 : i]
            indices = list(range(i - 15, i))
            if all(zone_b_lower <= v <= zone_b_upper for v in window):
                violations.append(
                    NelsonRuleViolation(
                        rule_id=7,
                        rule_name="Stratification in Zone C",
                        description="15 consecutive points within 1-sigma of centerline.",
                        violation_indices=indices,
                    )
                )

    # Rule 8: 8 consecutive points outside Zone C with none in Zone C
    if num_points >= 8:
        for i in range(8, num_points + 1):
            window = rates[i - 8 : i]
            indices = list(range(i - 8, i))
            if all(v > zone_b_upper or v < zone_b_lower for v in window):
                violations.append(
                    NelsonRuleViolation(
                        rule_id=8,
                        rule_name="Mixture / Avoidance of Zone C",
                        description="8 consecutive points outside 1-sigma with none in Zone C.",
                        violation_indices=indices,
                    )
                )

    return violations


def build_spc_series(
    records: Sequence[Dict[str, Any]],
    ucl: float,
    subgroup: int = 20,
    centerline: float = DEFAULT_BASELINE_P,
    machine_id: Optional[str] = None,
    source: Literal["bigquery", "mock_buffer", "seed"] = "seed",
    window: Optional[int] = None,
) -> SpcSeriesResponse:
    """Builds an SPC run chart defect rate series with control limits and Nelson violations.

    Args:
        records: Sequence of raw inspection records (each containing product_id, timestamp,
                 machine_id, and is_defect).
        ucl: Active upper control limit (e.g. from incident blackboard).
        subgroup: Moving subgroup sample size for trailing rate calculation.
        centerline: Baseline historical defect proportion p_bar.
        machine_id: Optional filter identifier for originating machine.
        source: Data provenance source (bigquery, mock_buffer, or seed).
        window: Total window length requested (defaults to len(records)).

    Returns:
        SpcSeriesResponse with calculated control limits, points, peak_rate, and violations.
    """
    limits = calculate_p_chart_limits(p_bar=centerline, n=subgroup)
    sigma = limits.sigma
    lcl = limits.lcl
    ucl_3sigma = limits.ucl

    rates: List[float] = []
    points: List[SpcSeriesPoint] = []
    effective_window = window if window is not None else len(records)

    for i, r in enumerate(records):
        subgroup_n = min(i + 1, subgroup)
        trailing_slice = records[i + 1 - subgroup_n : i + 1]
        defect_count = sum(1 for item in trailing_slice if bool(item.get("is_defect")))
        rate = round(defect_count / subgroup_n, 6)
        rates.append(rate)

        ts = r.get("timestamp", "")
        if hasattr(ts, "isoformat"):
            ts_str = ts.isoformat()
        else:
            ts_str = str(ts)

        is_ooc = rate > ucl or rate < lcl
        points.append(
            SpcSeriesPoint(
                index=i,
                product_id=str(r.get("product_id", "")),
                timestamp=ts_str,
                machine_id=str(r.get("machine_id", "")),
                is_defect=bool(r.get("is_defect", False)),
                defect_rate=rate,
                subgroup_n=subgroup_n,
                out_of_control=is_ooc,
            )
        )

    raw_violations = evaluate_nelson_rules(
        rates=rates,
        centerline=centerline,
        sigma=sigma,
        ucl=ucl,
        lcl=lcl,
    )

    # Filter violations to those with >= 1 index where rate > centerline
    filtered_violations = [
        v
        for v in raw_violations
        if any(0 <= idx < len(rates) and rates[idx] > centerline for idx in v.violation_indices)
    ]

    # Report each rule_id once with merged, sorted, unique indices
    merged_by_rule: Dict[int, NelsonRuleViolation] = {}
    for v in filtered_violations:
        if v.rule_id not in merged_by_rule:
            merged_by_rule[v.rule_id] = NelsonRuleViolation(
                rule_id=v.rule_id,
                rule_name=v.rule_name,
                description=v.description,
                violation_indices=sorted(set(v.violation_indices)),
            )
        else:
            existing = merged_by_rule[v.rule_id]
            existing.violation_indices = sorted(
                set(existing.violation_indices) | set(v.violation_indices)
            )

    violations = sorted(merged_by_rule.values(), key=lambda v: v.rule_id)

    peak_rate = round(max((p.defect_rate for p in points), default=0.0), 6)

    return SpcSeriesResponse(
        machine_id=machine_id,
        window=effective_window,
        subgroup=subgroup,
        centerline=round(centerline, 6),
        ucl=round(ucl, 6),
        ucl_3sigma=ucl_3sigma,
        lcl=lcl,
        sigma=sigma,
        peak_rate=peak_rate,
        points=points,
        violations=violations,
        source=source,
    )


class StreakGatekeeper:
    """Statefully tracks consecutive defect-free parts post-repair.

    Enforces the post-repair verification invariant:
        - verified is set to True strictly when good_streak >= target (default: 50).
        - Any observed defective part instantly resets good_streak to 0 and flags recurrence.
    """

    def __init__(self, target: int = DEFAULT_VERIFICATION_TARGET) -> None:
        if target <= 0:
            raise ValueError(f"target must be greater than 0, got {target}")
        self.target: int = target
        self.current_streak: int = 0
        self.is_verified: bool = False
        self.total_evaluated: int = 0
        self.total_defects: int = 0

    def record_sample(self, is_defect: bool) -> StreakVerificationResult:
        """Records an inspected part and updates verification streak.

        Args:
            is_defect: True if the part is defective; False if defect-free.

        Returns:
            StreakVerificationResult containing streak state and verified boolean.
        """
        self.total_evaluated += 1

        if is_defect:
            self.total_defects += 1
            previous_streak = self.current_streak
            self.current_streak = 0
            self.is_verified = False
            logger.warning(
                "StreakGatekeeper: Defect observed during verification! Resetting streak (was %d).",
                previous_streak,
            )
            return StreakVerificationResult(
                good_streak=0,
                target=self.target,
                verified=False,
                last_was_defect=True,
                recurrence_detected=True,
                message=(
                    f"Recurrence detected! Defective part observed. "
                    f"Verification streak reset to 0/{self.target}."
                ),
            )

        self.current_streak += 1
        if self.current_streak >= self.target:
            self.is_verified = True
            message = (
                f"Verification target met: {self.current_streak}/{self.target} "
                f"consecutive defect-free parts confirmed."
            )
        else:
            self.is_verified = False
            message = (
                f"Verification in progress: {self.current_streak}/{self.target} "
                f"consecutive good parts."
            )

        return StreakVerificationResult(
            good_streak=self.current_streak,
            target=self.target,
            verified=self.is_verified,
            last_was_defect=False,
            recurrence_detected=False,
            message=message,
        )

    def reset(self) -> None:
        """Resets the gatekeeper state back to zero."""
        self.current_streak = 0
        self.is_verified = False
        self.total_evaluated = 0
        self.total_defects = 0


def update_incident_verification(
    incident_state: IncidentState,
    is_defect: bool,
    gatekeeper: Optional[StreakGatekeeper] = None,
) -> StreakVerificationResult:
    """Updates an incident's verification count and status based on physical part outcome.

    If recurrence is observed (is_defect=True):
        - Incident status returns to 'investigating' (if currently 'verifying').
        - Verification count resets to 0.

    If verified (good_streak >= verification_target):
        - Incident status is ready to transition to 'closed' (orchestrator handles closing).

    Args:
        incident_state: IncidentState object to mutate in-place.
        is_defect: True if defective, False if defect-free.
        gatekeeper: Optional StreakGatekeeper instance to maintain state.

    Returns:
        StreakVerificationResult with outcome details.
    """
    gk = gatekeeper or StreakGatekeeper(target=incident_state.verification_target)
    gk.current_streak = incident_state.verification_count
    gk.target = incident_state.verification_target

    result = gk.record_sample(is_defect=is_defect)
    incident_state.verification_count = result.good_streak

    if result.recurrence_detected:
        if incident_state.status == "verifying":
            incident_state.status = "investigating"
            logger.info(
                "Incident %s status reverted to 'investigating' due to recurrence.",
                incident_state.incident_id,
            )
    elif result.verified:
        if incident_state.status == "verifying":
            incident_state.status = "closed"
            logger.info(
                "Incident %s passed verification with %d consecutive good parts; marked closed.",
                incident_state.incident_id,
                result.good_streak,
            )

    return result
