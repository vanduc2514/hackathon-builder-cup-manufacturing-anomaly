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


class ImpactMetrics(BaseModel):
    scrap_avoided: int = 240
    downtime_minutes: int = 45
    energy_kwh: float = 38.0
    co2_kg: float = 25.0


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
    defect_type: str = "scratch_vertical"
    severity: str = "medium"
    machine_id: str = "CNC-02"
    tool_id: str = "T07"


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
