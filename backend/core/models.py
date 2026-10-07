"""Core Models: Pydantic schemas for findings, evidence, confidence, citations, and incident state."""

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


class FindingDraft(BaseModel):
    """LLM output contract for one agent finding (confidence clamped by the orchestrator)."""

    finding: str = Field(description="One-sentence finding.")
    evidence: str = Field(description="Concrete evidence supporting the finding.")
    confidence: float = Field(description="0.0-1.0")
    citation: str = Field(description="Source of the evidence.")


class ScribeDraft(FindingDraft):
    """Incident Scribe output: a finding plus the generated documents."""

    work_order: str = Field(description="Work order text.")
    report_8d: str = Field(description="8D report summary.")
    sop_proposal: str = Field(description="SOP revision proposal.")


class VerificationResult(BaseModel):
    """Post-repair conveyor verification outcome."""

    good_streak: int
    defect_rate: float


class ImpactMetrics(BaseModel):
    scrap_avoided: int = 240
    downtime_minutes: int = 45
    energy_kwh: float = 38.0
    co2_kg: float = 25.0


class IncidentState(BaseModel):
    incident_id: str = "INC-0412"
    # normal, detecting, tracing, investigating, analyzing, awaiting_evidence, repairing,
    # verifying, closed, escalated, error
    status: str = "normal"
    status_reason: Optional[str] = None  # escalation or error reason
    defect_type: Optional[str] = None
    defect_rate: float = 0.005
    spc_ucl: float = 0.030
    suspect_machine: Optional[str] = None
    suspect_tool: Optional[str] = None
    root_cause: Optional[str] = None
    verification_count: int = 0
    verification_target: int = 50
    approved: bool = False  # shift-leader sign-off, recorded by the Orchestrator after close
    findings: List[AgentFinding] = Field(default_factory=list)
    impact: Optional[ImpactMetrics] = None
    documents: Dict[str, Any] = Field(default_factory=dict)
    updated_at: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))


class DefectInjectionRequest(BaseModel):
    """Defect signal the Orchestrator receives to open an incident (demo inject; edge/SPC later)."""

    defect_type: str = "scratch_vertical"
    severity: str = "medium"
    defect_rate: float = 0.077
    machine_id: str = "CNC-02"
    tool_id: str = "T07"
