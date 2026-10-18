"""Core Models: Pydantic schemas for findings, evidence, confidence, citations, incident state, and Copilot streaming."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator


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


class SopMetric(BaseModel):
    """Key metric or tolerance associated with a Standard Operating Procedure."""

    label: str
    value: str
    tone: Optional[str] = None


class SopChangeLine(BaseModel):
    """Diff line for SOP revision history."""

    op: Literal["+", "-"]
    text: str


class SopChange(BaseModel):
    """Audit revision entry for an SOP."""

    rev: str
    date: str
    author: str
    reason: str
    lines: List[SopChangeLine] = Field(default_factory=list)


class SopNoteTrail(BaseModel):
    """Supplemental status indicator or visual trail on an SOP card."""

    kind: Literal["spark", "text", "status"] = "text"
    value: str = ""


class SopSideLink(BaseModel):
    """Contextual side action link on an SOP card."""

    icon: str = "schema"
    label: str = "Schematic"


class SopDocument(BaseModel):
    """Standard Operating Procedure model compliant with Knowledge Hub."""

    code: int
    station: str
    rev: str
    updated: str
    category: str
    title: str
    summary: str
    tags: List[Dict[str, Any]] = Field(default_factory=list)
    metrics: List[SopMetric] = Field(default_factory=list)
    note: str = ""
    note_trail: SopNoteTrail = Field(default_factory=SopNoteTrail, alias="noteTrail")
    side_link: SopSideLink = Field(default_factory=SopSideLink, alias="sideLink")
    action: str = "Launch Procedure"
    safety: Optional[bool] = False
    walkthrough_id: Optional[str] = Field(default=None, alias="walkthroughId")
    changes: List[SopChange] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class WalkthroughChapter(BaseModel):
    """Video chapter timestamp marker."""

    at: int
    label: str


class WalkthroughGate(BaseModel):
    """Interactive inspection checkpoint during video walkthrough playback."""

    at: int
    text: str


class WalkthroughAuthor(BaseModel):
    """Author attribution for technician video walkthrough."""

    initials: str
    name: str
    role: str


class WalkthroughMetadata(BaseModel):
    """Metadata schema for expert technician video walkthroughs."""

    id: str
    station: str
    title: str
    short_title: str = Field(..., alias="shortTitle")
    category: str
    asset: str
    duration_sec: int = Field(..., alias="durationSec")
    image: str
    badge: Dict[str, Any]
    description: str
    author: WalkthroughAuthor
    views: int = 0
    helpful: str = "100% helpful"
    topics: List[str] = Field(default_factory=list)
    required: Optional[bool] = False
    chapters: Optional[List[WalkthroughChapter]] = Field(default_factory=list)
    gates: Optional[List[WalkthroughGate]] = Field(default_factory=list)
    sop: Optional[int] = None

    model_config = ConfigDict(populate_by_name=True)


class GoogleDriveDocument(BaseModel):
    """Schema for document stored or discovered in remote Google Drive."""

    file_id: Optional[str] = Field(default=None, description="Google Drive file ID")
    web_view_link: Optional[str] = Field(
        default=None, description="Direct web link to open file in Drive"
    )
    path: str = Field(description="Remote relative path in Google Drive")
    name: str = Field(description="File name")
    size_bytes: int = Field(default=0, description="Size in bytes")
    is_dir: bool = Field(default=False, description="Whether this item is a folder")
    mime_type: Optional[str] = Field(default=None, description="MIME type if available")
    mod_time: Optional[str] = Field(
        default=None, description="Last modification timestamp (ISO/string)"
    )


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
    engine: str = Field(default="vertex_ai_search", description="'vertex_ai_search'")
    total_found: int = 0

    def __iter__(self):
        return iter(self.citations)

    def __len__(self) -> int:
        return len(self.citations)

    def __getitem__(self, index: int) -> CitationReference:
        return self.citations[index]

    def __bool__(self) -> bool:
        return len(self.citations) > 0


class FiveWhysStep(BaseModel):
    """One step in a 5-Whys causal deduction chain."""

    level: int = Field(ge=1, le=5, description="Step number 1 to 5")
    why: str = Field(description="Why question / cause inquiry")
    answer: str = Field(description="Deduction or causal explanation")
    evidence: Optional[str] = Field(default=None, description="Supporting evidence or metric")
    citation: Optional[str] = Field(default=None, description="Document or telemetry citation")


class IshikawaFactor(BaseModel):
    """An analyzed factor within the 6M Ishikawa (fishbone) classification."""

    category: str = Field(
        description="6M category: Machine, Method, Material, Man, Measurement, or Milieu"
    )
    factor: str = Field(description="Factor description")
    is_causal: bool = Field(
        default=False, description="True if causal factor, False if ruled out / normal"
    )
    detail: Optional[str] = Field(
        default=None, description="Detailed explanation or exclusion rationale"
    )


class AgentFinding(BaseModel):
    """Four-part contract: finding, evidence, confidence, citation."""

    agent_id: str
    agent_name: str
    phase: str
    finding: str
    evidence: str
    confidence: float = Field(ge=0.0, le=1.0)
    citation: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    five_whys: Optional[List[FiveWhysStep]] = None
    ishikawa: Optional[Dict[str, List[str]]] = None
    # Where the finding came from: "gemini" (model output), "fallback" (scripted result
    # used after a model miss/failure in DEMO_SCRIPTED mode) or "mock" (no model configured).
    source: Optional[Literal["gemini", "fallback", "mock"]] = None


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


class RootCauseFindingDraft(FindingDraft):
    """Root Cause Agent output: finding, evidence, 5-Whys, Ishikawa 6M classification, and optional diagnostic probe."""

    five_whys: List[FiveWhysStep] = Field(
        default_factory=list, description="5-Whys sequential causal deduction chain"
    )
    ishikawa: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Ishikawa 6M categories (Machine, Method, Material, Man, Measurement, Milieu)",
    )
    diagnostic_request: Optional[str] = Field(
        default=None,
        description="Diagnostic evidence request for technician if confidence < 0.70",
    )

    @field_validator("ishikawa", mode="before")
    @classmethod
    def _wrap_single_causes(cls, value: Any) -> Any:
        """Gemini does not hold a free-form map's value schema and may answer one string per
        category; keep it as a one-cause list instead of failing the incident."""
        if isinstance(value, dict):
            return {k: [v] if isinstance(v, str) else v for k, v in value.items()}
        return value


class ScribeDraft(FindingDraft):
    """Incident Scribe output: a finding plus the generated documents."""

    work_order: str = Field(description="Work order text.")
    report_8d: str = Field(description="8D report summary.")
    sop_proposal: str = Field(description="SOP revision proposal.")


class EightDReport(BaseModel):
    """Structured 8D Incident Report (D1 through D8) with human-in-the-loop approval tracking."""

    incident_id: str = Field(description="Incident identifier, e.g. INC-0412")
    d1_team: str = Field(description="D1: Cross-functional response team")
    d2_problem: str = Field(description="D2: 5W2H Problem description and defect symptoms")
    d3_containment: str = Field(
        description="D3: Immediate containment actions and quarantined material"
    )
    d4_root_cause: str = Field(description="D4: Root cause 5-Whys and Ishikawa 6M analysis")
    d5_corrective_actions: str = Field(description="D5: Chosen permanent corrective actions")
    d6_implementation: str = Field(
        description="D6: Implementation results and post-repair verification"
    )
    d7_preventive_action: str = Field(description="D7: Preventive actions and SOP modifications")
    d8_congratulate_team: str = Field(description="D8: Team recognition and formal sign-off")
    pending_approval: str = Field(
        default="shift_leader", description="Approver role awaiting sign-off"
    )
    approved: bool = Field(default=False, description="True once approved by shift leader")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class WorkOrder(BaseModel):
    """Maintenance work order generated for equipment repair or tooling replacement."""

    work_order_id: str = Field(description="Work order number, e.g. WO-8821")
    title: str = Field(description="Work order summary title")
    equipment_id: str = Field(description="Target machine or equipment, e.g. CNC-02")
    description: str = Field(description="Detailed maintenance instructions and specifications")
    parts_required: List[str] = Field(
        default_factory=list, description="List of required spare parts and consumables"
    )
    priority: str = Field(default="HIGH", description="Priority level: LOW, MEDIUM, HIGH, CRITICAL")
    status: str = Field(
        default="DRAFT", description="Status: DRAFT, PENDING_APPROVAL, APPROVED, COMPLETED"
    )
    pending_approval: str = Field(
        default="shift_leader", description="Approver role awaiting sign-off"
    )
    approved: bool = Field(default=False, description="True once approved by shift leader")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SOPRevisionProposal(BaseModel):
    """Standard Operating Procedure (SOP) modification proposal to prevent defect recurrence."""

    sop_id: str = Field(description="Target SOP identifier, e.g. SOP-MNT-CNC-04")
    title: str = Field(description="SOP document title")
    equipment_id: str = Field(description="Associated machine or line, e.g. CNC-02")
    current_procedure: str = Field(description="Summary of current standard operating procedure")
    proposed_revision: str = Field(description="Proposed concrete modifications")
    justification: str = Field(description="Technical rationale based on incident root cause")
    threshold_alert_parts: Optional[int] = Field(
        default=None, description="Automated counter threshold alert limit"
    )
    pending_approval: str = Field(
        default="shift_leader", description="Approver role awaiting sign-off"
    )
    approved: bool = Field(default=False, description="True once approved by shift leader")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RepairVideoAnalysis(BaseModel):
    """Video walkthrough analysis of technician repair procedures."""

    video_uri: str = Field(description="URI or storage path of the repair video")
    title: str = Field(description="Procedural walkthrough title")
    equipment_id: str = Field(default="CNC-02", description="Target machine identifier")
    key_steps: List[str] = Field(
        default_factory=list, description="Extracted sequential procedural steps"
    )
    verified_checkpoints: List[str] = Field(
        default_factory=list, description="Quality and tolerance checkpoints verified"
    )
    safety_notices: List[str] = Field(
        default_factory=list, description="Safety and LOTO warnings observed"
    )


class VerificationResult(BaseModel):
    """Post-repair conveyor verification outcome."""

    good_streak: int
    defect_rate: float
    samples: List["QaFrameInspection"] = Field(
        default_factory=list,
        description="Parts classified from real catalog images (Gemini Vision or guarded/mock) so far",
    )
    recurrence: bool = Field(
        default=False,
        description="True when an image-classified part was a defect and verification stopped",
    )


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


class KnowledgeBaseEntry(BaseModel):
    """Defect -> Cause -> Fix institutional memory entry."""

    entry_id: str = Field(description="Unique knowledge entry identifier")
    incident_id: str = Field(description="Originating incident identifier")
    defect_type: str = Field(description="Defect classification")
    machine_id: str = Field(description="Machine identifier")
    tool_id: Optional[str] = Field(default=None, description="Tool identifier")
    root_cause: str = Field(description="Identified root cause")
    resolution_steps: List[str] = Field(
        default_factory=list, description="Steps taken during physical repair"
    )
    preventive_action: str = Field(description="Preventive action taken to avoid recurrence")
    impact: ImpactMetrics = Field(
        default_factory=ImpactMetrics, description="Calculated sustainability and business impact"
    )
    video_metadata: Optional[RepairVideoAnalysis] = Field(
        default=None, description="Associated video walkthrough analysis if available"
    )
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


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

    @model_validator(mode="before")
    @classmethod
    def _normalize_nested_payload(cls, value: Any) -> Any:
        """Adapt competition nested JSON payloads to the canonical flat schema.

        The competition MQTT protocol (see ``AI-sensor-spec.md``) emits a nested
        envelope with ``asset`` / ``operating`` / ``sensor`` / ``health`` keys. The
        legacy internal bus and most existing tests use a flat shape keyed
        directly on the field names. This pre-root validator reshapes a nested
        payload into the flat schema expected by the field validators below,
        leaving flat payloads untouched.
        """
        if not isinstance(value, dict):
            return value

        nested_keys = {"asset", "operating", "sensor", "health"}
        if not nested_keys.intersection(value.keys()):
            # Flat payload (or mixed) — let field validators resolve aliases.
            return value

        normalized: Dict[str, Any] = dict(value)

        # --- asset ---------------------------------------------------------------
        asset = value.get("asset") or {}
        if isinstance(asset, dict):
            machine_id = asset.get("machine_id") or "/".join(
                filter(
                    None,
                    [
                        str(asset.get("factory_id", "")),
                        str(asset.get("line_id", "")),
                        str(asset.get("machine_id", "")),
                    ],
                )
            ).strip("/")
            if machine_id:
                normalized["machine_id"] = machine_id
            tool_id = asset.get("machine_id")
            if isinstance(tool_id, str) and tool_id:
                normalized.setdefault("tool_id", tool_id)

        # --- timestamp -----------------------------------------------------------
        ts = value.get("timestamp")
        if isinstance(ts, str):
            normalized["timestamp"] = ts

        # --- operating_status (health → operating → operating_status fallback chain)
        health = value.get("health") or {}
        operating = value.get("operating") or {}
        raw_status: Any = None
        if isinstance(health, dict):
            raw_status = health.get("status")
        if raw_status is None and isinstance(operating, dict):
            raw_status = operating.get("status")
        if raw_status is not None:
            status_str = str(raw_status).strip().upper()
            if status_str == "NORMAL":
                mapped = "NORMAL"
            elif status_str in {"ANOMALY", "ABNORMAL"}:
                mapped = "ALARM"
            else:
                mapped = "WARNING"
            normalized["operating_status"] = mapped

        # --- sensor block --------------------------------------------------------
        sensor = value.get("sensor") or {}
        if isinstance(sensor, dict):
            vibration = sensor.get("vibration") or {}
            if isinstance(vibration, dict) and "value" in vibration:
                normalized.setdefault("vibration_mm_s", vibration.get("value"))
                normalized.setdefault("spindle_vibration", vibration.get("value"))
            temperature = sensor.get("temperature") or {}
            if isinstance(temperature, dict) and "value" in temperature:
                normalized.setdefault("temperature_c", temperature.get("value"))
                normalized.setdefault("spindle_temp", temperature.get("value"))
            current = sensor.get("current") or {}
            if isinstance(current, dict) and "value" in current:
                normalized.setdefault("current_a", current.get("value"))
                normalized.setdefault("motor_current", current.get("value"))
            rpm = sensor.get("rpm") or {}
            if isinstance(rpm, dict) and "value" in rpm:
                normalized.setdefault("spindle_speed_rpm", rpm.get("value"))
                normalized.setdefault("rpm", rpm.get("value"))

        # --- health --------------------------------------------------------------
        if isinstance(health, dict) and "anomaly_score" in health:
            score = health.get("anomaly_score")
            try:
                normalized["anomaly_score"] = float(score)
            except (TypeError, ValueError):
                # Fallback to 0.0 when the value is not parseable.
                normalized["anomaly_score"] = 0.0

        return normalized


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


class VisualEvidencePayload(BaseModel):
    """Payload representing visual photo evidence submitted by frontline technician."""

    image_id: str = Field(
        default_factory=lambda: f"img-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        description="Unique identifier for uploaded image",
    )
    filename: Optional[str] = Field(default=None, description="Original filename if uploaded")
    mime_type: str = Field(default="image/jpeg", description="MIME type of the evidence photo")
    size_bytes: int = Field(default=0, description="Size of image in bytes")
    image_base64: Optional[str] = Field(
        default=None, description="Optional base64 encoded preview or thumbnail"
    )
    image_url: Optional[str] = Field(
        default=None, description="Web-relative URL or CDN URL for image"
    )
    preset_id: Optional[str] = Field(
        default=None, description="Benchmark preset ID if populated from catalog"
    )
    analysis: str = Field(
        default="", description="Visual Metrology / Copilot assessment of the photo"
    )
    defect_detected: bool = Field(default=True, description="Whether anomaly/wear was confirmed")
    wear_measurement_mm: Optional[float] = Field(
        default=None, description="Measured flank wear VB or chip dimension in mm"
    )
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Capture or upload timestamp",
    )
    citation: str = Field(
        default="Technician diagnostic camera stream via Gemini Live",
        description="Audit trail citation source",
    )
    source: Optional[Literal["gemini", "fallback", "mock"]] = Field(
        default=None, description="Origin of the analysis: model, scripted fallback or mock"
    )
    confidence: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Model self-assessed confidence; scripted expectation value for fallback/mock",
    )


class PartInspectionResult(BaseModel):
    """Closed-schema Gemini Vision result for an end-of-line part photo."""

    defect_class: Literal["scratch_vertical", "chipping", "none"]
    severity: int = Field(ge=1, le=5)
    region: Literal["top", "center", "bottom", "left edge", "right edge"]
    confidence: float = Field(
        ge=0.0, le=1.0, description="Model self-assessed confidence in this classification"
    )


class InsertInspectionResult(BaseModel):
    """Closed-schema Gemini Vision result for a removed cutting-insert photo."""

    flank_wear: Literal["none", "light", "severe"]
    edge_chipping: bool
    replace_insert: bool
    confidence: float = Field(
        ge=0.0, le=1.0, description="Model self-assessed confidence in this assessment"
    )


class GuardedInspection(BaseModel):
    """Outcome of a vision call after the DEMO_SCRIPTED expected-result guard."""

    kind: Literal["part", "insert"]
    part: Optional[PartInspectionResult] = None
    insert: Optional[InsertInspectionResult] = None
    source: Literal["gemini", "fallback", "mock"]
    model: str
    attempts: int = 0
    summary: str = Field(description="Template-rendered display text, never model free text")


class VisualInspectionResult(BaseModel):
    """Structured inspection result returned by Gemini Vision metrology analysis."""

    analysis: str = Field(
        description="Detailed visual inspection and metrology assessment of the uploaded photo."
    )
    defect_detected: bool = Field(
        default=True,
        description="Whether a physical defect, wear pattern, or anomaly is confirmed in the image.",
    )
    wear_measurement_mm: Optional[float] = Field(
        default=None,
        description="Quantitative measurement of tool flank wear (VB), chip width, or defect size in mm if visible.",
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence score between 0.0 and 1.0 of the visual analysis.",
    )


class VisualEvidencePreset(BaseModel):
    """Curated benchmark preset evidence item."""

    id: str = Field(description="Unique alphanumeric preset identifier")
    title: str = Field(description="Human-readable title of the sample")
    category: Literal[
        "surface_scratch",
        "crack",
        "fracture",
        "assembly_gap",
        "normal",
        "scratch_vertical",
        "chipping",
        "tool_wear",
    ] = Field(description="Defect archetype category")
    machine_id: str = Field(default="IM-05", description="Applicable equipment bay")
    tool_id: Optional[str] = Field(default="MOLD-03", description="Suspect tool slot")
    description: str = Field(description="Detailed visual & metrology description")
    analysis: str = Field(description="Visual Metrology ground truth assessment")
    thumbnail_url: str = Field(description="Web-relative URL for preview thumbnail")
    image_url: str = Field(description="Web-relative URL for high-res photo")
    expected_defect_detected: bool = Field(default=True, description="Ground truth defect presence")
    expected_wear_mm: Optional[float] = Field(
        default=None, description="Flank wear dimension in mm"
    )
    suggested_sop_code: Optional[int] = Field(default=None, description="Linked SOP reference")
    role: Literal["qa_defect", "streak_good", "tool_worn", "tool_new", "reference", "im05"] = Field(
        default="im05", description="Demo role the image plays (QA defect, streak good part, ...)"
    )
    expected_class: Optional[str] = Field(
        default=None,
        description=(
            "Expected vision class: part = scratch_vertical|chipping|none; insert = replace|ok"
        ),
    )
    image_file: Optional[str] = Field(
        default=None,
        description="Backend image path relative to data/datasets/preset_evidence/",
    )
    source_url: Optional[str] = Field(default=None, description="Original image source URL")
    author: Optional[str] = Field(default=None, description="Image author / rights holder")
    licence: Optional[str] = Field(default=None, description="Image licence identifier")


class VisualEvidencePresetListResponse(BaseModel):
    """Response envelope for catalog preset listing."""

    presets: List[VisualEvidencePreset] = Field(
        description="List of available preset media samples"
    )


class PresetEvidenceRequest(BaseModel):
    """Request payload to attach a benchmark preset evidence item to active incident."""

    preset_id: str = Field(description="ID of the benchmark preset to attach")
    notes: Optional[str] = Field(default=None, description="Optional frontline technician notes")


class HandoverNote(BaseModel):
    """Technician shift handover note recorded on an incident."""

    author: str = Field(description="Username or technician name who authored the note")
    note: str = Field(description="Handover note content")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC timestamp of the handover note",
    )


class HandoverNoteRequest(BaseModel):
    """Request payload for recording a technician handover note."""

    note: str = Field(..., min_length=1, description="Handover note content")

    @field_validator("note")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Handover note cannot be empty")
        return stripped


class IncidentState(BaseModel):
    incident_id: str = "INC-0412"
    # Monotonic per-incident write counter set by the Blackboard on every persisted write;
    # Firestore snapshot echoes with revision <= the local one are stale and ignored.
    revision: int = 0
    # normal, detecting, tracing, investigating, analyzing, awaiting_evidence, repairing,
    # verifying, pending_approval, closed, dismissed, escalated, error
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
    approved: bool = False  # shift-leader sign-off, recorded by the Orchestrator after learning
    approved_by: Optional[str] = Field(
        default=None,
        description="Username of the shift leader who signed off the incident",
    )
    approved_at: Optional[str] = Field(
        default=None,
        description="ISO 8601 UTC timestamp of the shift-leader sign-off",
    )
    documents_exported: bool = Field(
        default=False,
        description="#333: approved documents rendered to Markdown and uploaded to GCS",
    )
    documents_export_error: Optional[str] = Field(
        default=None,
        description="Reason the document export failed; approval itself still succeeded",
    )
    findings: List[AgentFinding] = Field(default_factory=list)
    impact: Optional[ImpactMetrics] = None
    documents: Dict[str, Any] = Field(default_factory=dict)
    latest_telemetry: Optional[MachineTelemetryPayload] = None
    telemetry_alerts: List[TelemetryAlert] = Field(default_factory=list)
    diagnostic_request: Optional[str] = None
    visual_evidence: Optional[VisualEvidencePayload] = None
    handover_notes: List[HandoverNote] = Field(
        default_factory=list,
        description="Technician shift handover notes recorded for this incident",
    )
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    opened_at: Optional[str] = Field(
        default=None,
        description="ISO 8601 UTC timestamp when the incident was opened",
    )
    closed_at: Optional[str] = Field(
        default=None,
        description="ISO 8601 UTC timestamp when the incident was resolved or closed",
    )
    severity: str = Field(
        default="medium",
        description="Severity level: low, medium, high, critical",
    )
    line_id: str = Field(
        default="cell-line-1",
        description="Production line identifier",
    )
    product: str = Field(
        default="Gearbox Casing",
        description="Active product part name",
    )
    mttr_target_minutes: int = Field(
        default=15,
        description="Target MTTR in minutes for SLA countdown",
    )


class IncidentSummary(BaseModel):
    """Compact summary of an incident for history listing and dashboard feeds."""

    incident_id: str = Field(description="Incident identifier, e.g. INC-0412")
    status: str = Field(description="Incident status lifecycle state")
    status_reason: Optional[str] = Field(
        default=None, description="Reason for escalation, error, or dismissal"
    )
    severity: str = Field(
        default="medium", description="Severity level: low, medium, high, critical"
    )
    defect_type: Optional[str] = Field(default=None, description="Classified defect symptom name")
    defect_rate: float = Field(default=0.0, description="Defect rate at capture or closure")
    spc_ucl: float = Field(default=0.030, description="Upper specification/control limit")
    suspect_machine: Optional[str] = Field(default=None, description="Target suspect equipment ID")
    suspect_tool: Optional[str] = Field(
        default=None, description="Suspect cutter or tool identifier"
    )
    root_cause: Optional[str] = Field(default=None, description="Identified root cause summary")
    repair_done: bool = Field(default=False, description="Whether repair has been executed")
    approved: bool = Field(default=False, description="Whether incident has shift-leader sign-off")
    verification_count: int = Field(default=0, description="Consecutive verified parts count")
    verification_target: int = Field(default=50, description="Target verified parts count")
    opened_at: Optional[str] = Field(default=None, description="ISO timestamp when incident opened")
    closed_at: Optional[str] = Field(default=None, description="ISO timestamp when incident closed")
    updated_at: Optional[str] = Field(default=None, description="ISO timestamp of last update")
    impact: Optional[ImpactMetrics] = Field(
        default=None, description="Calculated impact metrics if closed"
    )

    @classmethod
    def from_incident(cls, incident: IncidentState) -> IncidentSummary:
        return cls(
            incident_id=incident.incident_id,
            status=incident.status,
            status_reason=incident.status_reason,
            severity=incident.severity,
            defect_type=incident.defect_type,
            defect_rate=incident.defect_rate,
            spc_ucl=incident.spc_ucl,
            suspect_machine=incident.suspect_machine,
            suspect_tool=incident.suspect_tool,
            root_cause=incident.root_cause,
            repair_done=incident.repair_done,
            approved=incident.approved,
            verification_count=incident.verification_count,
            verification_target=incident.verification_target,
            opened_at=incident.opened_at,
            closed_at=incident.closed_at,
            updated_at=incident.updated_at,
            impact=incident.impact,
        )


class EsgLedgerTotals(BaseModel):
    """Cumulative ESG and operational savings across signed-off incidents."""

    incidents: int = Field(default=0, description="Total signed-off incidents in the ledger")
    scrap_avoided: int = Field(default=0, description="Cumulative scrap parts avoided")
    downtime_minutes: int = Field(default=0, description="Cumulative downtime minutes prevented")
    energy_kwh: float = Field(default=0.0, description="Cumulative energy savings in kWh")
    co2_kg: float = Field(default=0.0, description="Cumulative CO2 emission savings in kg")
    energy_co2_kg: float = Field(
        default=0.0, description="Cumulative energy-related CO2 savings in kg"
    )
    material_co2_kg: float = Field(
        default=0.0, description="Cumulative material-related CO2 savings in kg"
    )
    cost_savings_usd: float = Field(default=0.0, description="Cumulative cost savings in USD")


class EsgLedgerEntryResponse(BaseModel):
    """One signed-off incident booked into the ESG ledger."""

    incident_id: str = Field(description="Incident identifier, e.g. INC-0412")
    closed_at: Optional[str] = Field(
        default=None, description="ISO timestamp when incident was closed"
    )
    approved: bool = Field(default=True, description="Whether incident has shift-leader sign-off")
    impact: ImpactMetrics = Field(description="Impact metrics computed upon incident resolution")
    incident: IncidentState = Field(
        description="Full incident snapshot for client-side 8D / verified solution derivation"
    )


class EsgLedgerResponse(BaseModel):
    """ESG impact ledger: cumulative totals plus per-incident entries (newest first)."""

    totals: EsgLedgerTotals = Field(description="Cumulative totals across all booked entries")
    entries: List[EsgLedgerEntryResponse] = Field(
        default_factory=list, description="Signed-off incident ledger entries (newest first)"
    )
    factory_type: str = Field(
        default="aluminum_cnc",
        description="Factory type of the newest entry, or aluminum_cnc if empty",
    )
    basis: Literal["benchmark", "measured"] = Field(
        default="benchmark",
        description=(
            "Origin of impact inputs: benchmark estimates or measured production data"
        ),
    )


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
    require_evidence: bool = Field(
        default=False,
        description="If True, forces the workflow to enter awaiting_evidence even if initial RCA confidence is high",
    )


class FactorySyncResult(BaseModel):
    """Result of an asynchronous synchronization call to the Factory Simulator."""

    ok: bool = False
    latency_ms: float = 0.0
    endpoint: Optional[str] = None
    error: Optional[str] = None
    skipped: bool = False
    details: Optional[dict[str, Any]] = None


class SimulationStatusResponse(BaseModel):
    status: str
    active_scenario: Optional[str] = None
    mode: Optional[str] = None
    target_machine: Optional[str] = None
    target_tool: Optional[str] = None
    elapsed_seconds: Optional[float] = None
    total_seconds: Optional[float] = None


class SimulationInjectResponse(BaseModel):
    """Response returned when an anomaly injection is triggered."""

    status: str = "triggered"
    scenario: str
    mode: str
    duration_seconds: float
    defect_type: Optional[str] = None
    target_machine: str
    target_tool: Optional[str] = None
    burst_telemetry: dict[str, Any] = Field(default_factory=dict)
    message: str
    factory_sync: Optional[FactorySyncResult] = None


class SimulationResetResponse(BaseModel):
    """Response returned when the simulation and blackboard are reset."""

    status: str = "reset"
    message: str
    state: dict[str, Any] = Field(default_factory=dict)
    bigquery: dict[str, Any] = Field(default_factory=dict)
    factory_sync: Optional[FactorySyncResult] = None

# ---------------------------------------------------------------------------
# Issue #333 — approved incident document export (Markdown to GCS)
#
# On shift-leader approval the four documents (work order, 8D report, SOP
# proposal, impact card) are rendered to Markdown and written to
# gs://<documents_bucket>/incidents/<incident_id>/ (artifacts/documents/
# outside production). The blobs are private, so the dashboard links to the
# Cloud Console browser path instead.
# ---------------------------------------------------------------------------


class IncidentDocumentsExportResult(BaseModel):
    """Outcome of exporting one approved incident's documents as Markdown."""

    incident_id: str
    destination: Literal["gcs", "local"]
    bucket: Optional[str] = None
    prefix: str = Field(description="Object/folder prefix, e.g. incidents/INC-0412/")
    uris: List[str] = Field(
        default_factory=list, description="gs:// object URIs or local file paths"
    )
    console_url: Optional[str] = None
    note: str = Field(
        default="", description="Human-readable detail, e.g. the local fallback reason"
    )


class IncidentDocumentLink(BaseModel):
    """One exported Markdown document with its storage URI."""

    name: str = Field(description="Markdown file name, e.g. work_order.md")
    title: str = Field(description="Display title, e.g. Work Order")
    uri: str = Field(description="gs:// object URI (GCS) or local file path (dev)")


class IncidentDocumentsResponse(BaseModel):
    """GET /api/incidents/documents payload for the current incident (#333)."""

    incident_id: str
    exported: bool
    export_error: Optional[str] = None
    destination: Literal["gcs", "local"]
    bucket: Optional[str] = None
    console_url: Optional[str] = None
    documents: List[IncidentDocumentLink] = Field(default_factory=list)


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


class TelemetryPoint(BaseModel):
    """Discrete machine sensor measurement record."""

    timestamp: str
    machine_id: str
    vibration_mm_s: float
    temperature_c: float
    current_a: float
    spindle_speed_rpm: int = 12000
    is_anomalous: bool = False
    anomaly_score: float = 0.0

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)


class MultiMachineTelemetryResponse(BaseModel):
    """Multi-machine telemetry time-series payload for comparative correlation."""

    series: Dict[str, List[TelemetryPoint]] = Field(default_factory=dict)
    baseline: SensorBaseline = Field(default_factory=SensorBaseline)
    vibration_warning_threshold: float = 1.95
    current_warning_threshold: float = 13.0
    anomaly_onset_time: Optional[str] = "2026-10-05T09:30:00Z"
    time_window: str = "09:00-10:00"
    source: str = "seed_data"

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


class SpcSeriesPoint(BaseModel):
    """A discrete part inspection point with trailing subgroup defect rate and OOC flag."""

    index: int = Field(ge=0, description="Chronological 0-based point index in inspection window")
    product_id: str = Field(description="Unique part identifier e.g. PRD-1001")
    timestamp: str = Field(description="ISO-8601 inspection timestamp")
    machine_id: str = Field(description="Originating manufacturing machine identifier e.g. CNC-02")
    is_defect: bool = Field(description="True if part failed quality inspection")
    defect_rate: float = Field(
        ge=0.0, le=1.0, description="Defect proportion of trailing subgroup parts"
    )
    subgroup_n: int = Field(
        gt=0, description="Effective sample size of trailing subgroup min(i+1, subgroup)"
    )
    out_of_control: bool = Field(
        default=False, description="True if point breaches UCL or LCL control limits"
    )


class SpcSeriesResponse(BaseModel):
    """Run chart defect proportion time series with control limits and Nelson violations."""

    machine_id: Optional[str] = Field(
        default=None, description="Filtered machine identifier or null"
    )
    window: int = Field(ge=0, description="Inspection window size (number of evaluated parts)")
    subgroup: int = Field(
        gt=0, description="Moving subgroup sample size for trailing rate calculation"
    )
    centerline: float = Field(ge=0.0, le=1.0, description="Baseline defect rate centerline p_bar")
    ucl: float = Field(
        ge=0.0, le=1.0, description="Active upper control limit threshold (e.g. from blackboard)"
    )
    ucl_3sigma: float = Field(ge=0.0, le=1.0, description="Statistical 3-sigma upper control limit")
    lcl: float = Field(ge=0.0, le=1.0, description="Lower control limit (typically 0.0)")
    sigma: float = Field(ge=0.0, description="Standard deviation for subgroup sample size")
    peak_rate: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Maximum defect rate in the window (0.0 if empty)"
    )
    points: List[SpcSeriesPoint] = Field(
        default_factory=list, description="Ordered time series inspection points"
    )
    violations: List[NelsonRuleViolation] = Field(
        default_factory=list, description="Nelson run-rule violations detected"
    )
    source: Literal["bigquery", "mock_buffer", "seed"] = Field(description="Data provenance source")


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


class QaFrameInspection(BaseModel):
    """One end-of-line camera frame classified by Gemini Vision (or guarded/mock) in Phase A."""

    preset_id: str = Field(description="Catalog preset id of the camera image")
    title: str
    image_url: str
    camera_id: str = "CAM-EOL-01"
    machine_id: str
    tool_id: str
    kind: Literal["part", "visual"] = Field(
        description="'part' = closed-schema part classification; 'visual' = free-form visual evidence"
    )
    expected_class: Optional[str] = Field(
        default=None, description="Catalog expected result used by the DEMO_SCRIPTED guard"
    )
    defect_class: Optional[str] = Field(
        default=None, description="Part classification (kind='part' only)"
    )
    severity: Optional[int] = Field(default=None, ge=1, le=5)
    region: Optional[str] = None
    confidence: Optional[float] = Field(
        default=None, ge=0.0, le=1.0, description="Model self-assessed confidence (real calls only)"
    )
    is_defect: bool
    source: Literal["gemini", "fallback", "mock"]
    model: str
    summary: str = Field(description="Template-rendered display text, never model free text")


VerificationResult.model_rebuild()


class QualityInspectionReport(BaseModel):
    """Quality Inspector Phase A evidence: SPC on the latest conveyor window plus vision-classified frames."""

    spc: SpcEvaluationResult
    defect_type_counts: Dict[str, int] = Field(
        default_factory=dict,
        description="SPC defect count from the trigger, labelled with the trigger defect type",
    )
    defect_type_counts_basis: str = Field(
        default="spc_trigger",
        description="Origin of defect_type_counts: the SPC window count, not a per-part census",
    )
    frame_class_counts: Dict[str, int] = Field(
        default_factory=dict,
        description="Class counts over the vision-classified sample frames only",
    )
    defect_frames: List[QaFrameInspection] = Field(default_factory=list)


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


class CopilotTurnRequest(BaseModel):
    """Technician turn sent over `WS /api/gemini-live/ws` (typed text, optionally with a preset photo)."""

    type: Literal["user_turn"] = "user_turn"
    text: str = Field(min_length=1, max_length=2000)
    preset_id: Optional[str] = Field(
        default=None, description="Catalog preset whose image is attached to the turn"
    )


class GeminiLiveServerMessage(BaseModel):
    """Server -> client message of the Technician Copilot WebSocket.

    `type`: setup_complete, text_delta (one streamed text chunk in `text`), turn_complete
    (`interrupted` set when the technician cut the reply), offline / error (terminal for the
    turn, reason in `error_message`) and pong.
    """

    type: str
    session_id: Optional[str] = None
    text: Optional[str] = None
    model: Optional[str] = None
    interrupted: bool = False
    resumption_handle: Optional[str] = None
    error_message: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))


class GeminiLiveSessionStatus(BaseModel):
    session_id: str
    status: str  # "active"
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


class OemRepairManual(BaseModel):
    """OEM equipment repair manual specification and checkpoints."""

    machine_id: str
    title: str
    citation: str
    manual_title: Optional[str] = None
    primary_citation: Optional[str] = None
    equipment_name: Optional[str] = None
    parts: list[str] = Field(default_factory=list)
    supported_actions: list[str] = Field(default_factory=list)
    checkpoints: list[RepairCheckpoint] = Field(default_factory=list)

    def model_post_init(self, __context: Any) -> None:
        if not self.manual_title:
            self.manual_title = self.title
        if not self.primary_citation:
            self.primary_citation = self.citation


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


class TraceabilityEventPayload(BaseModel):
    """Discrete traceability event emitted at conveyor optical inspection or tagging stations."""

    product_id: str = Field(description="Discrete product serial number e.g. PRD-1004")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO-8601 timestamp of inspection/operation",
    )
    machine_id: str = Field(description="Producing machine ID e.g. CNC-02")
    tool_id: str = Field(description="Tool or mold cavity ID e.g. T07")
    lot_id: str = Field(default="AL-5083-B4", description="Material blank lot ID")
    operator_id: str = Field(default="OP-12", description="Assigned operator ID")
    status: str = Field(default="PASS", description="PASS or DEFECT status label")


class QualityEventPayload(BaseModel):
    """Quality / SPC anomaly event forwarded from edge Gemma gateway to Orchestrator via Pub/Sub."""

    event_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Unique quality event identifier",
    )
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Event creation timestamp",
    )
    event_type: str = Field(
        default="defect_spc_breach",
        description="Event classification: defect_spc_breach, optical_anomaly, spc_alarm",
    )
    scenario: str = Field(
        default="cnc_tool_wear",
        description="Associated anomaly scenario e.g. cnc_tool_wear or im_damp_material",
    )
    mode: str = Field(
        default="demo",
        description="Execution mode: demo (90s) or fast (~8s)",
    )
    machine_id: str = Field(
        default="CNC-02",
        description="Suspect machine identifier",
    )
    tool_id: Optional[str] = Field(
        default="T07",
        description="Suspect tool or cavity identifier",
    )
    defect_type: Optional[str] = Field(
        default="scratch_vertical",
        description="Classified defect symptom",
    )
    defect_rate: float = Field(
        default=0.077,
        ge=0.0,
        le=1.0,
        description="Estimated defect rate triggering event",
    )
    severity: str = Field(
        default="medium",
        description="Severity level: low, medium, high",
    )
    filtered_frame: Optional[FilteredFramePacket] = Field(
        default=None,
        description="Filtered camera frame packet from edge classifier",
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional context metadata",
    )

    def to_defect_injection_request(self) -> DefectInjectionRequest:
        """Converts Pub/Sub quality event into standard Orchestrator DefectInjectionRequest."""
        return DefectInjectionRequest(
            scenario=self.scenario,
            mode=self.mode,
            defect_type=self.defect_type,
            severity=self.severity,
            defect_rate=self.defect_rate,
            machine_id=self.machine_id,
            tool_id=self.tool_id or ("MOLD-03" if self.scenario == "im_damp_material" else "T07"),
        )


class PubSubDeliveryReport(BaseModel):
    """Delivery status report for outbound Pub/Sub messages."""

    topic: str = Field(description="Target Google Cloud Pub/Sub topic name")
    message_id: str = Field(description="Pub/Sub message ACK ID or synthetic fallback buffer ID")
    latency_ms: float = Field(ge=0.0, description="Round-trip dispatch latency in milliseconds")
    status: str = Field(
        default="delivered",
        description="Delivery verdict: 'delivered', 'buffered', or 'failed'",
    )
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Dispatch timestamp in ISO-8601 UTC format",
    )
    payload_type: Optional[str] = Field(
        default=None,
        description="Payload category: 'quality_event', 'telemetry', or 'traceability'",
    )
    error: Optional[str] = Field(
        default=None,
        description="Error details if delivery failed",
    )


class AuthRole(str, Enum):
    """Display role of a login account; every role may call every API."""

    TECHNICIAN = "technician"
    SHIFT_LEADER = "shift_leader"


class AuthAccount(BaseModel):
    """One AUTH_USERS entry; plain-text password because these are demo accounts."""

    username: str
    password: str
    role: AuthRole
    display_name: str


class AuthUser(BaseModel):
    """Signed-in identity resolved from an API token."""

    username: str
    display_name: str
    role: AuthRole


class LoginRequest(BaseModel):
    """Username/password submitted to POST /api/auth/login."""

    username: str
    password: str


class LoginResponse(BaseModel):
    """Signed API token plus the identity it carries."""

    token: str
    expires_at: datetime
    user: AuthUser


class DemoAccount(BaseModel):
    """Login screen entry; never carries a password."""

    username: str
    display_name: str
    role: AuthRole


class OeeFactors(BaseModel):
    """Core OEE availability, performance, and quality factors."""

    availability: float = Field(ge=0.0, le=1.0, description="Availability ratio (0.0 to 1.0)")
    performance: float = Field(ge=0.0, le=1.0, description="Performance ratio (0.0 to 1.0)")
    quality: float = Field(ge=0.0, le=1.0, description="Quality ratio (0.0 to 1.0)")
    oee: float = Field(ge=0.0, le=1.0, description="Overall Equipment Effectiveness: A * P * Q")


class OeePoint(OeeFactors):
    """A point in time bucket for OEE trending."""

    timestamp: str = Field(description="ISO 8601 timestamp at bucket end")


class OeeLoss(BaseModel):
    """Categorized loss contributing to 1 - OEE."""

    kind: Literal["planned_stop", "unplanned_downtime", "speed", "quality"] = Field(
        description="Category of OEE loss"
    )
    points: float = Field(ge=0.0, le=1.0, description="OEE points lost (0.0 to 1.0)")
    machine_id: Optional[str] = Field(default=None, description="Suspect or stopped machine ID")
    reason: Optional[str] = Field(default=None, description="Human-readable reason for loss")
    incident_id: Optional[str] = Field(
        default=None, description="Related incident ID if applicable"
    )


class MachineOee(OeeFactors):
    """Station-level OEE metrics and historical trend series."""

    machine_id: str = Field(description="Machine identifier, e.g. CNC-01, CNC-02")
    good_parts: int = Field(default=0, ge=0, description="Count of conforming parts")
    total_parts: int = Field(default=0, ge=0, description="Total parts produced in window")
    series: List[OeePoint] = Field(default_factory=list, description="Trend data points")


class LineOeeResponse(OeeFactors):
    """Cell line-level OEE response schema."""

    line_id: str = Field(description="Production line identifier, e.g. cell-line-1")
    target: float = Field(default=0.85, ge=0.0, le=1.0, description="Configured line OEE target")
    series: List[OeePoint] = Field(default_factory=list, description="Line trend series")
    machines: List[MachineOee] = Field(default_factory=list, description="Station-level breakdowns")
    losses: List[OeeLoss] = Field(default_factory=list, description="Loss attribution breakdown")


class FleetAsset(BaseModel):
    """Manufacturing asset specification for cell fleet registry."""

    machine_id: str = Field(description="Machine identifier, e.g. CNC-01, CNC-02, IM-05")
    machine_type: Literal["cnc", "im"] = Field(
        description="Machine equipment type: cnc for CNC machines or im for injection moulders"
    )
    bay: str = Field(description="Factory floor bay location, e.g. Bay 2, Bay 4")
    part: str = Field(description="Active part model running on this station")
    operation: str = Field(description="Manufacturing process or operation description")
    on_demand: bool = Field(
        default=False,
        description="Whether this asset is provisioned on-demand (e.g. secondary line or material switch)",
    )


class FleetRegistryResponse(BaseModel):
    """Dynamic fleet registry and line-level operational targets."""

    line_id: str = Field(description="Production line identifier, e.g. cell-line-1")
    line_name: str = Field(description="Human-readable line name, e.g. Cell Line 1")
    planned_availability: float = Field(
        ge=0.0,
        le=1.0,
        description="Planned shift availability target (ratio between 0 and 1)",
    )
    mttr_target_minutes: int = Field(
        gt=0,
        description="Mean-time-to-repair SLA target in minutes",
    )
    oee_target: float = Field(
        ge=0.0,
        le=1.0,
        description="Configured line OEE target (ratio between 0 and 1)",
    )
    assets: List[FleetAsset] = Field(
        default_factory=list,
        description="Registered fleet assets in the production cell",
    )


# ---------------------------------------------------------------------------
# TKT-070 / issue #268 — Competition CSV telemetry payload schema
#
# One row in ``data/datasets/competition/*.csv`` maps to this flat schema.
# The same record also lands in ``manufacturing.competition_telemetry``
# (see ``data/schemas/bigquery_tables.sql``) after ``S9`` seeds it. This
# model is the single source of truth for both the wire format (CSV replay)
# and the warehouse row representation, so the validation rules below are
# shared by both ingestion paths.
# ---------------------------------------------------------------------------

# Whitelist of canonical operating statuses emitted by the competition dataset.
# Anything else (e.g. ``IDLE``, ``OFFLINE``, ``STARTUP``) is a schema bug at
# ingestion time and must surface as a ValidationError rather than silently
# pass through to BigQuery and corrupt downstream SPC calculations.
COMPETITION_OPERATING_STATUSES: tuple[str, ...] = ("RUNNING", "FAULT")


def _coerce_competition_timestamp(raw: Any) -> Any:
    """Coerce a competition CSV timestamp string into ``YYYY-MM-DD HH:MM:SS``.

    The two canonical CSV formats emitted by the competition dataset are:

    * ``M/D/YYYY H:MM`` (e.g. ``10/1/2026 8:00``) — ``normal_machine_operating_data_1000_with_timestamp.csv``
    * ``YYYY-MM-DD HH:MM:SS`` (e.g. ``2026-10-01 09:00:00``) — ``abnormal_machine_operating_data_1000.csv``

    Anything already in ISO-8601 (e.g. an MQTT replay that already wrapped the
    CSV timestamp in a ``Z`` suffix) is left untouched so BigQuery can parse
    it. An unrecognised format raises ``ValueError`` so the seed/replay loop
    fails fast instead of storing a malformed value.
    """
    if not isinstance(raw, str):
        return raw
    candidate = raw.strip()
    if not candidate:
        return None
    # Pass through if already ISO-8601 (with optional trailing 'Z' or offset).
    if "T" in candidate or candidate.endswith("Z") or "+" in candidate[10:]:
        return candidate
    # M/D/YYYY H:MM or M/D/YYYY H:MM:SS (US-style without leading zeros).
    if "/" in candidate:
        for fmt in ("%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M"):
            try:
                return datetime.strptime(candidate, fmt).strftime("%Y-%m-%d %H:%M:%S")
            except ValueError:
                continue
    # YYYY-MM-DD HH:MM:SS — already canonical, just normalise spacing.
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(candidate, fmt).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
    raise ValueError(
        f"timestamp {raw!r} is not a recognised competition CSV format "
        "(expected M/D/YYYY H:MM or YYYY-MM-DD HH:MM:SS)"
    )


def _coerce_competition_bool(raw: Any) -> Any:
    """Coerce a competition CSV ``fan_status`` cell into a Python ``bool``.

    The dataset emits ``TRUE``/``true``/``FALSE``/``false``. Empty cells
    represent missing data (the field is optional on the warehouse row) and
    must round-trip as ``None`` so BigQuery stores a true NULL instead of
    a default ``False``.
    """
    if raw is None:
        return None
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)):
        return bool(raw)
    if isinstance(raw, str):
        cell = raw.strip()
        if cell == "":
            return None
        lowered = cell.lower()
        if lowered in {"true", "t", "1"}:
            return True
        if lowered in {"false", "f", "0"}:
            return False
        raise ValueError(f"fan_status {raw!r} is not a recognised boolean value")
    raise ValueError(f"fan_status {raw!r} is not a string-coercible boolean")


def _coerce_competition_optional_int(raw: Any) -> Any:
    """Coerce a competition CSV integer cell into an ``int`` or ``None``.

    The competition dataset emits ``alarm_code`` and ``warning_code`` as
    empty strings when the asset is in baseline state and a numeric string
    when it is in a fault. An empty cell is genuinely missing data and must
    land in BigQuery as ``NULL`` so the histogram and SPC logic does not
    treat a blank cell as a zero-valued code.
    """
    if raw is None:
        return None
    if isinstance(raw, bool):
        # Avoid the Python pitfall where ``bool`` is a subclass of ``int``
        # and ``int(True) == 1`` would silently coerce a stray flag.
        return int(raw)
    if isinstance(raw, int):
        return raw
    if isinstance(raw, float):
        if raw != raw:  # NaN check (defensive — CSVs should not emit NaN).
            return None
        return int(raw)
    if isinstance(raw, str):
        cell = raw.strip()
        if cell == "":
            return None
        try:
            return int(cell)
        except ValueError as exc:
            raise ValueError(f"integer column {raw!r} is not a valid integer") from exc
    raise ValueError(f"integer column {raw!r} is not a string-coercible int")


class CompetitionTelemetryPayload(BaseModel):
    """One row of the competition CSV telemetry dataset.

    The flat schema mirrors the ``manufacturing.competition_telemetry`` BigQuery
    table defined in ``data/schemas/bigquery_tables.sql`` so the same dict
    shape flows into both the in-process Pydantic pipeline and the warehouse
    ``INSERT``. The ``model_validator`` below normalises the two CSV timestamp
    formats, the ``TRUE``/``true``/empty ``fan_status`` cell, and the empty
    integer ``alarm_code`` / ``warning_code`` cells that the dataset emits
    for baseline rows.

    ``operating_status`` is restricted to the canonical values ``RUNNING``
    (baseline) and ``FAULT`` (failure mode); anything else raises a
    ``ValidationError`` so a misspelled enum never ends up in the warehouse.
    """

    model_config = ConfigDict(populate_by_name=True)

    asset_factory_id: str = Field(description="Factory identifier e.g. FACTORY_01")
    asset_line_id: str = Field(description="Production line identifier e.g. LINE_01")
    asset_machine_id: str = Field(description="Machine identifier e.g. MOTOR_01")
    operating_status: Literal["RUNNING", "FAULT"] = Field(
        description="Equipment operating status; only RUNNING or FAULT are accepted"
    )
    operating_load_percent: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=200.0,
        description="Operating load percentage (0-200)",
    )
    operating_runtime_hours: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Cumulative asset runtime in hours",
    )
    sensor_temperature: Optional[float] = Field(
        default=None,
        description="Spindle bearing temperature in Celsius",
    )
    sensor_vibration: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Spindle vibration amplitude in mm/s",
    )
    sensor_rpm: Optional[int] = Field(
        default=None,
        ge=0,
        description="Spindle rotational speed in rpm",
    )
    sensor_current: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Motor current in Amperes",
    )
    health_anomaly_score: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Normalised anomaly score from the asset health estimator (0-1)",
    )
    alarm_code: Optional[int] = Field(
        default=None,
        description="Populated only on failure rows; empty on baseline rows",
    )
    warning_code: Optional[int] = Field(
        default=None,
        description="Populated only on failure rows; empty on baseline rows",
    )
    fan_status: Optional[bool] = Field(
        default=None,
        description="Cooling-fan OK flag (TRUE / true) — empty cell means unknown",
    )
    timestamp: str = Field(
        description="Wall-clock sample timestamp (canonical YYYY-MM-DD HH:MM:SS)"
    )

    @field_validator("operating_status", mode="before")
    @classmethod
    def _uppercase_operating_status(cls, value: Any) -> Any:
        """Normalise dataset casing before the Literal whitelist check.

        The competition CSVs emit ``RUNNING`` / ``FAULT`` in uppercase already,
        but case-insensitive upper-casing keeps the contract forgiving for
        future datasets without weakening the whitelist (lowercased strings
        still need to match the Literal values exactly).
        """
        if isinstance(value, str):
            return value.strip().upper()
        return value

    @field_validator("timestamp", mode="before")
    @classmethod
    def _coerce_timestamp(cls, value: Any) -> Any:
        return _coerce_competition_timestamp(value)

    @field_validator("fan_status", mode="before")
    @classmethod
    def _coerce_fan_status(cls, value: Any) -> Any:
        return _coerce_competition_bool(value)

    @field_validator("alarm_code", "warning_code", mode="before")
    @classmethod
    def _coerce_optional_int(cls, value: Any) -> Any:
        return _coerce_competition_optional_int(value)


# ---------------------------------------------------------------------------
# TKT-070 / issue #268 — BigQuery ingestion summary (S9 / S10)
#
# Structured summary that ``scripts/seed_bigquery.load_competition_csv()``
# and ``backend.tools.bigquery_tool.load_competition_telemetry()`` both
# return. ``schema_version`` matches ``COMPETITION_SCHEMA_VERSION`` in
# ``scripts/seed_bigquery.py``; ``redactor_version`` matches
# ``data.redaction.REDACTION_VERSION``. Together they pin down which
# version of the warehouse DDL and brand map produced a given manifest
# row so an auditor can compare a re-run against the source CSV's sha256.
# ---------------------------------------------------------------------------


class BigQueryIngestionSummary(BaseModel):
    """Typed return value for every competition-telemetry ingestion run.

    Used by ``load_competition_csv()`` (CLI + library) and
    ``load_competition_telemetry()`` (emulator ingestion helper) so both
    code paths produce the same artefact that ``BQ_seed_manifest.json``
    records.
    """

    model_config = ConfigDict(populate_by_name=True)

    rows_loaded: int = Field(
        ge=0,
        description="Number of CSV rows successfully written to BigQuery (excludes malformed rows).",
    )
    rows_skipped: int = Field(
        default=0,
        ge=0,
        description="Number of CSV rows skipped because they failed schema validation.",
    )
    source_sha256: str = Field(
        description="Hex SHA-256 of the source CSV so re-runs can prove idempotency.",
    )
    schema_version: str = Field(
        description="Version stamp of the warehouse DDL used for this run (e.g. '2026-10-18.v1').",
    )
    redactor_version: str = Field(
        description="Version stamp of the BRAND_MAP / REDACTION_VERSION used for this run.",
    )
    target_table: str = Field(
        description="Fully-qualified BigQuery table the rows landed in (e.g. 'project.manufacturing.competition_telemetry').",
    )
    dry_run: bool = Field(
        default=False,
        description="True when the loader parsed the CSV but did not insert into BigQuery.",
    )
