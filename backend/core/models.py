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
    repair_done: bool = False
    findings: List[AgentFinding] = Field(default_factory=list)
    impact: Optional[ImpactMetrics] = None
    documents: Dict[str, Any] = Field(default_factory=dict)
    updated_at: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))


class DefectInjectionRequest(BaseModel):
    defect_type: str = "scratch_vertical"
    severity: str = "medium"
    machine_id: str = "CNC-02"
    tool_id: str = "T07"


class RepairCheckpoint(BaseModel):
    """Intermediate verification checkpoint for physical equipment repair."""

    step_number: int
    title_vi: str
    instruction_vi: str
    citation: str
    metric_name: Optional[str] = None
    target_threshold: Optional[float] = None
    comparator: Optional[str] = "<="
    unit: Optional[str] = None
    is_verified: bool = False
    measured_value: Optional[float] = None
    notes: Optional[str] = None


class CopilotTurn(BaseModel):
    """A single turn in the interactive technician guidance session."""

    turn_id: int
    speaker: str  # "technician" or "copilot"
    message_vi: str
    citation: Optional[str] = None
    step_number: Optional[int] = None
    checkpoint_verified: Optional[bool] = None
    metric_value: Optional[float] = None
    timestamp: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))


class CopilotSessionTelemetry(BaseModel):
    """Telemetry data captured during a technician repair guidance session."""

    session_id: str
    incident_id: str
    machine_id: str
    tool_id: Optional[str] = None
    total_turns: int = 0
    checkpoints_total: int = 0
    checkpoints_passed: int = 0
    repair_done: bool = False
    hallucination_refusals: int = 0
    verified_metrics: Dict[str, float] = Field(default_factory=dict)
    transcript: List[CopilotTurn] = Field(default_factory=list)
    started_at: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))
    completed_at: Optional[str] = None
