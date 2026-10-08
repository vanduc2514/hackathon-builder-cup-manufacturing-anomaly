"""Core Models: Pydantic schemas for findings, evidence, confidence, citations, incident state, and Gemini Live streaming."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class CitationReference(BaseModel):
    """Auditable citation metadata compliant with strict RAG contract."""

    document_id: str = Field(
        description="Document ID or relative path e.g. manuals/cnc_operating_manual.md"
    )
    title: str = Field(description="Human-readable document title")
    page_number: Optional[int] = Field(default=None, description="Page number anchor if applicable")
    section: Optional[str] = Field(default=None, description="Document section or header")
    snippet: str = Field(description="Verbatim excerpt from document")
    relevance_score: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Relevance score 0.0 - 1.0"
    )
    last_revised: Optional[str] = Field(
        default=None, description="Document last revision date (YYYY-MM-DD)"
    )
    citation: Optional[str] = Field(default=None, description="Formatted auditable citation string")

    def formatted_citation(self) -> str:
        """Auditable citation string e.g. 'CNC Manual p.112, Section 4.5 (revised 2026-03-12)'."""
        parts = [self.title]
        if self.page_number is not None:
            parts.append(f"p.{self.page_number}")
        if self.section:
            parts.append(self.section)
        if self.last_revised:
            parts.append(f"revised {self.last_revised}")
        return ", ".join(parts)


class KnowledgeDocumentMeta(BaseModel):
    """Metadata schema for curated domain documents in the knowledge base."""

    document_id: str
    title: str
    category: str  # manual, maint_log, 8d_report, spec, etc.
    machine_id: Optional[str] = None
    component: Optional[str] = None
    version: str = "1.0"
    pages: int = 1
    last_revised: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class RAGSearchRequest(BaseModel):
    """Query parameters for knowledge base search with dual keys."""

    defect_symptom: str = Field(
        ...,
        description="Mandatory defect symptom key, e.g. 'scratch_vertical', 'short_fill', 'spindle_vibration'",
    )
    suspect_asset: str = Field(
        ...,
        description="Mandatory suspect machine/asset key, e.g. 'CNC-02', 'IM-05'",
    )
    query: Optional[str] = Field(
        default=None,
        description="Optional additional free-text query or symptom detail",
    )
    max_results: int = Field(default=5, ge=1, le=20)
    min_relevance: float = Field(default=0.35, ge=0.0, le=1.0)


class RAGSearchResult(BaseModel):
    """Structured result set from RAG knowledge base search."""

    defect_symptom: str
    suspect_asset: str
    query: str
    citations: List[CitationReference] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    summary: Optional[str] = None
    engine: str = Field(default="local_bm25", description="'vertex_ai_search' or 'local_bm25'")
    total_found: int = 0

    def __iter__(self):
        return iter(self.citations)

    def __len__(self) -> int:
        return len(self.citations)

    def __getitem__(self, index: int) -> CitationReference:
        return self.citations[index]

    def __bool__(self) -> bool:
        return len(self.citations) > 0


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


class MachineTelemetryPayload(BaseModel):
    """Real-time machine sensor packet ingested from edge MQTT broker."""

    model_config = ConfigDict(populate_by_name=True)

    machine_id: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    tool_id: Optional[str] = None
    operating_status: str = Field(default="NORMAL")  # NORMAL, WARNING, ALARM
    spindle_vibration: float = Field(
        default=0.0,
        validation_alias=AliasChoices("spindle_vibration", "vibration_mm_s"),
        description="Spindle vibration in mm/s",
    )
    spindle_temp: float = Field(
        default=0.0,
        validation_alias=AliasChoices("spindle_temp", "temperature_c"),
        description="Spindle bearing temperature in Celsius",
    )
    motor_current: float = Field(
        default=0.0,
        validation_alias=AliasChoices("motor_current", "current_a"),
        description="Motor current in Amperes",
    )
    rpm: int = Field(
        default=0,
        validation_alias=AliasChoices("rpm", "spindle_speed_rpm"),
        description="Spindle rotational speed",
    )
    anomaly_score: float = Field(default=0.0, ge=0.0, le=1.0)


class TelemetryAlert(BaseModel):
    """Alert record created when incoming telemetry exceeds anomaly thresholds."""

    machine_id: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    anomaly_score: float
    operating_status: str
    metric_name: str
    metric_value: float
    threshold: float
    message: str


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
    repair_done: bool = False
    approved: bool = False  # shift-leader sign-off, recorded by the Orchestrator after close
    findings: List[AgentFinding] = Field(default_factory=list)
    impact: Optional[ImpactMetrics] = None
    documents: Dict[str, Any] = Field(default_factory=dict)
    latest_telemetry: Optional[MachineTelemetryPayload] = None
    telemetry_alerts: List[TelemetryAlert] = Field(default_factory=list)
    updated_at: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))


class DefectInjectionRequest(BaseModel):
    """Defect signal the Orchestrator receives to open an incident (demo inject; edge/SPC later)."""

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
    defect_rate: float = 0.077
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


class BoundingBox(BaseModel):
    """Normalized bounding box coordinates [ymin, xmin, ymax, xmax] between 0.0 and 1.0."""

    ymin: float = Field(ge=0.0, le=1.0, description="Top edge normalized coordinate")
    xmin: float = Field(ge=0.0, le=1.0, description="Left edge normalized coordinate")
    ymax: float = Field(ge=0.0, le=1.0, description="Bottom edge normalized coordinate")
    xmax: float = Field(ge=0.0, le=1.0, description="Right edge normalized coordinate")

    def to_list(self) -> List[float]:
        return [self.ymin, self.xmin, self.ymax, self.xmax]

    @property
    def area(self) -> float:
        return max(0.0, self.ymax - self.ymin) * max(0.0, self.xmax - self.xmin)


class InspectionFrame(BaseModel):
    """Raw visual inspection snapshot event from conveyor optical station."""

    product_id: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    machine_id: str
    tool_id: str
    lot_id: str = "AL-5083-B4"
    camera_id: str = "CAM-LINE01-EOL"
    status: Optional[str] = None
    defect_type: Optional[str] = None
    image_token: Optional[str] = None
    image_bytes_b64: Optional[str] = None
    cavity_id: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EdgeClassificationResult(BaseModel):
    """High-speed pass/fail classification and bounding box from Gemma 3 edge model."""

    is_defect: bool
    defect_type: Optional[str] = None
    confidence: float = Field(default=0.98, ge=0.0, le=1.0)
    uncertainty: float = Field(default=0.02, ge=0.0, le=1.0)
    bounding_box: Optional[BoundingBox] = None
    inference_time_ms: float = Field(default=0.0, ge=0.0)
    model_name: str = "gemma-3-2b-edge"
    operating_mode: str = "heuristic"  # heuristic, ollama, dataset_playback
    diverter_actuated: bool = False
    raw_explanation: Optional[str] = None


class FilteredFramePacket(BaseModel):
    """Edge metrology packet forwarded to cloud Quality Inspector when defect or uncertain."""

    frame_hash: str = Field(description="SHA-256 hash of frame attributes for audit provenance")
    camera_id: str
    product_id: str
    machine_id: str
    tool_id: str
    lot_id: str
    conveyor_timestamp: str
    classification: str = Field(description="PASS, DEFECT, or UNCERTAIN")
    is_defect: bool
    defect_type: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    uncertainty: float = Field(ge=0.0, le=1.0)
    bounding_box: Optional[BoundingBox] = None
    filter_decision: str = Field(description="FORWARD or DROP")
    diverter_actuated: bool = False
    image_token: Optional[str] = None
    cavity_id: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EdgeFilterStatistics(BaseModel):
    """Performance and bandwidth reduction telemetry from edge noise filtering."""

    total_frames_evaluated: int = 0
    pass_frames_dropped: int = 0
    defect_frames_forwarded: int = 0
    uncertain_frames_forwarded: int = 0
    audit_sampled_forwarded: int = 0
    total_frames_forwarded: int = 0
    drop_ratio: float = 0.0
    cloud_bandwidth_reduction_pct: float = 0.0
    estimated_bandwidth_saved_mb: float = 0.0


class GeminiLiveModality(str, Enum):
    AUDIO = "AUDIO"
    TEXT = "TEXT"


class GeminiLiveBlob(BaseModel):
    mime_type: str = "audio/pcm;rate=16000"
    data: str  # Base64 encoded payload


class GeminiLiveRealtimeInput(BaseModel):
    media_chunks: List[GeminiLiveBlob] = Field(default_factory=list)


class GeminiLiveClientContent(BaseModel):
    text: Optional[str] = None
    end_of_turn: bool = True


class GeminiLiveSetup(BaseModel):
    model: str = "gemini-2.0-flash-exp"
    voice_name: str = "Aoede"
    language_code: str = "vi-VN"
    system_instruction: Optional[str] = None
    session_id: Optional[str] = None
    mode: str = "live"  # "live" or "simulation"
    session_resumption_handle: Optional[str] = None


class GeminiLiveClientMessage(BaseModel):
    setup: Optional[GeminiLiveSetup] = None
    realtime_input: Optional[GeminiLiveRealtimeInput] = None
    client_content: Optional[GeminiLiveClientContent] = None
    interrupt: bool = False
    message_index: Optional[int] = None


class GeminiLiveServerContent(BaseModel):
    text: Optional[str] = None
    audio_pcm_base64: Optional[str] = None
    input_transcription: Optional[str] = None
    output_transcription: Optional[str] = None
    interrupted: bool = False
    turn_complete: bool = False
    generation_complete: bool = False


class GeminiLiveServerMessage(BaseModel):
    type: str  # "setup_complete", "server_content", "session_resumption_update", "go_away", "error", "pong"
    session_id: Optional[str] = None
    server_content: Optional[GeminiLiveServerContent] = None
    resumption_handle: Optional[str] = None
    last_consumed_client_message_index: Optional[int] = None
    error_message: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))


class GeminiLiveSessionStatus(BaseModel):
    session_id: str
    status: str  # "active", "resumed", "closed", "simulated"
    mode: str  # "live", "simulation"
    client_messages_received: int = 0
    server_messages_sent: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))
    last_active_at: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))


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
