"""Core Models: Pydantic schemas for findings, evidence, confidence, citations, and incident state."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AgentFinding(BaseModel):
    """Four-part contract: finding, evidence, confidence, citation."""

    agent_id: str
    agent_name: str
    phase: str
    finding: str
    evidence: str
    confidence: float = Field(ge=0.0, le=1.0)
    citation: str
    timestamp: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))


class ManufacturingBenchmark(BaseModel):
    """Manufacturing profile benchmarks for impact and sustainability calculations."""

    name: str = "aluminum_cnc"
    description: str = "Automotive aluminum CNC machining"
    line_speed_parts_per_min: float = 2.0
    detection_lead_time_minutes: float = 120.0
    manual_diagnosis_minutes: float = 60.0
    ai_diagnosis_minutes: float = 15.0
    energy_kwh_per_unit: float = 0.15833333333333333  # 38 kWh / 240 units
    part_mass_kg: float = 0.35
    grid_emission_factor_kg_per_kwh: float = 0.40  # Scope 2 grid factor
    material_emission_factor_kg_per_kg: float = 0.11666666666666667  # Material GHG factor
    part_cost_usd: float = 15.0
    downtime_cost_per_hour_usd: float = 0.0


class ImpactMetrics(BaseModel):
    """Environmental, operational, and financial savings per incident."""

    scrap_avoided: int = 240
    downtime_minutes: int = 45
    energy_kwh: float = 38.0
    co2_kg: float = 25.0
    cost_savings_usd: float = 3600.0
    energy_co2_kg: float = 15.2
    material_co2_kg: float = 9.8
    factory_type: str = "aluminum_cnc"


class ImpactCalculationRequest(BaseModel):
    """Request payload for impact calculation with optional factory benchmark overrides."""

    factory_type: Optional[str] = "aluminum_cnc"
    custom_benchmark: Optional[ManufacturingBenchmark] = None
    earlier_detection_minutes: Optional[float] = None
    manual_diagnosis_minutes: Optional[float] = None
    ai_diagnosis_minutes: Optional[float] = None
    line_speed_parts_per_min: Optional[float] = None
    energy_kwh_per_unit: Optional[float] = None
    part_mass_kg: Optional[float] = None
    part_cost_usd: Optional[float] = None
    grid_emission_factor_kg_per_kwh: Optional[float] = None
    material_emission_factor_kg_per_kg: Optional[float] = None
    downtime_cost_per_hour_usd: Optional[float] = None


class IncidentState(BaseModel):
    incident_id: str = "INC-0412"
    status: str = "normal"  # normal, detecting, tracing, investigating, analyzing, repairing, verifying, closed
    defect_type: Optional[str] = None
    defect_rate: float = 0.005
    spc_ucl: float = 0.030
    suspect_machine: Optional[str] = None
    suspect_tool: Optional[str] = None
    root_cause: Optional[str] = None
    verification_count: int = 0
    verification_target: int = 50
    findings: List[AgentFinding] = Field(default_factory=list)
    impact: Optional[ImpactMetrics] = None
    documents: Dict[str, Any] = Field(default_factory=dict)
    updated_at: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))


class DefectInjectionRequest(BaseModel):
    scenario: str = Field(
        default="cnc_tool_wear",
        description="Anomaly scenario: 'cnc_tool_wear' or 'im_damp_material'",
    )
    mode: str = Field(
        default="demo",
        description="Timing mode: 'demo' (90s deterministic envelope) or 'fast' (~8s fast-forward)",
    )
    duration_seconds: Optional[float] = Field(
        default=None,
        description="Explicit duration override in seconds",
    )
    defect_type: Optional[str] = Field(
        default="scratch_vertical",
        description="Defect classification type",
    )
    severity: str = Field(
        default="medium",
        description="Severity level: low, medium, high",
    )
    machine_id: str = Field(
        default="CNC-02",
        description="Target machine identifier",
    )
    tool_id: str = Field(
        default="T07",
        description="Target cutting tool or mold cavity identifier",
    )


class SimulationStatusResponse(BaseModel):
    status: str
    active_scenario: Optional[str] = None
    mode: Optional[str] = None
    target_machine: Optional[str] = None
    target_tool: Optional[str] = None
    elapsed_seconds: Optional[float] = None
    total_seconds: Optional[float] = None


class SuspectCorrelation(BaseModel):
    """Correlation metric for a specific machine and tool pair."""

    machine_id: str
    tool_id: str
    correlation_score: float = Field(
        ge=0.0, le=1.0, description="Defect ratio or normalized correlation score"
    )
    defect_count: int = Field(ge=0)
    total_parts: int = Field(ge=0)
    sample_ratio: float = Field(default=0.0, ge=0.0, le=1.0)

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)


class FactorDistribution(BaseModel):
    """Defect distribution for a discrete manufacturing factor (e.g. lot_id, operator_id)."""

    factor_type: str
    factor_value: str
    defect_count: int = Field(ge=0)
    total_parts: int = Field(ge=0)
    defect_ratio: float = Field(ge=0.0, le=1.0)
    is_anomalous: bool = False

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)


class TraceabilityTopologyResponse(BaseModel):
    """Response payload from cross-lot traceability query."""

    source: str = Field(description="bigquery_live or bigquery_emulator")
    suspects: List[SuspectCorrelation] = Field(default_factory=list)
    excluded_factors: List[str] = Field(default_factory=list)
    factor_distributions: List[FactorDistribution] = Field(default_factory=list)
    time_window: Optional[str] = None

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)


class SensorMetrics(BaseModel):
    """Statistical summary of sensor telemetry within a time window."""

    min_vibration: float
    max_vibration: float
    avg_vibration: float
    std_vibration: float
    avg_temperature: float
    avg_current: float
    sample_count: int = Field(ge=0)

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)


class SensorBaseline(BaseModel):
    """Nominal machine baseline thresholds."""

    vibration: float = 1.5
    temperature: float = 40.0
    current: float = 12.0

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)


class SensorTelemetryWindowResponse(BaseModel):
    """Response payload from machine sensor telemetry window query."""

    source: str = Field(description="bigquery_live or bigquery_emulator")
    machine_id: str
    time_window: str
    metrics: SensorMetrics
    baseline: SensorBaseline = Field(default_factory=SensorBaseline)
    anomaly_detected: bool = False

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)


class ControlLimits(BaseModel):
    """Shewhart p-chart statistical control limits."""

    centerline: float = Field(ge=0.0, le=1.0, description="Centerline proportion p_bar")
    ucl: float = Field(ge=0.0, le=1.0, description="Upper control limit")
    lcl: float = Field(ge=0.0, le=1.0, description="Lower control limit")
    sample_size: int = Field(gt=0, description="Subgroup sample size n")
    sigma: float = Field(ge=0.0, description="Standard error of proportion sqrt(p(1-p)/n)")


class NelsonRuleViolation(BaseModel):
    """Details of a single Nelson control rule violation."""

    rule_id: int = Field(ge=1, le=8, description="Nelson rule number (1-8)")
    rule_name: str = Field(description="Name or title of the rule")
    description: str = Field(description="Detailed explanation of the breach")
    violation_indices: List[int] = Field(
        default_factory=list, description="0-indexed sample indices that triggered the violation"
    )


class SpcEvaluationResult(BaseModel):
    """SPC defect rate window evaluation and anomaly breach result."""

    sample_size: int = Field(gt=0)
    defect_count: int = Field(ge=0)
    defect_rate: float = Field(ge=0.0, le=1.0)
    limits: ControlLimits
    is_breached: bool = Field(
        default=False, description="True if defect_rate exceeds UCL or falls below LCL"
    )
    breach_direction: Optional[str] = Field(default=None, description="'upper', 'lower', or None")
    violations: List[NelsonRuleViolation] = Field(default_factory=list)


class StreakVerificationResult(BaseModel):
    """Result emitted by the post-repair physical confirmation gatekeeper."""

    good_streak: int = Field(ge=0, description="Current count of consecutive defect-free parts")
    target: int = Field(gt=0, description="Required target streak (e.g. 50)")
    verified: bool = Field(default=False, description="True when good_streak >= target")
    last_was_defect: bool = Field(
        default=False, description="True if the last evaluated part was defective"
    )
    recurrence_detected: bool = Field(
        default=False, description="True if a defect occurred during verification, resetting streak"
    )
    message: str = Field(description="Status description")
