"""Data schemas for machine telemetry and conveyor serialization events."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    """Normalized bounding box coordinates [ymin, xmin, ymax, xmax] between 0.0 and 1.0."""

    ymin: float = Field(ge=0.0, le=1.0)
    xmin: float = Field(ge=0.0, le=1.0)
    ymax: float = Field(ge=0.0, le=1.0)
    xmax: float = Field(ge=0.0, le=1.0)

    def to_list(self) -> list[float]:
        return [self.ymin, self.xmin, self.ymax, self.xmax]

    @property
    def area(self) -> float:
        return max(0.0, self.ymax - self.ymin) * max(0.0, self.xmax - self.xmin)


class EdgeClassificationResult(BaseModel):
    """High-speed pass/fail classification and bounding box from Gemma 3 edge model."""

    is_defect: bool
    defect_type: Optional[str] = None
    confidence: float = Field(default=0.98, ge=0.0, le=1.0)
    uncertainty: float = Field(default=0.02, ge=0.0, le=1.0)
    bounding_box: Optional[BoundingBox] = None
    inference_time_ms: float = Field(default=0.0, ge=0.0)
    model_name: str = "gemma-3-2b-edge"
    operating_mode: str = "heuristic"
    diverter_actuated: bool = False
    raw_explanation: Optional[str] = None


class FilteredFramePacket(BaseModel):
    """Edge metrology packet forwarded to cloud Quality Inspector when defect or uncertain."""

    frame_hash: str
    camera_id: str
    product_id: str
    machine_id: str
    tool_id: str
    lot_id: str
    conveyor_timestamp: str
    classification: str
    is_defect: bool
    defect_type: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    uncertainty: float = Field(ge=0.0, le=1.0)
    bounding_box: Optional[BoundingBox] = None
    filter_decision: str
    diverter_actuated: bool = False
    image_token: Optional[str] = None
    cavity_id: Optional[int] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


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


class MachineTelemetry(BaseModel):
    """Real-time machine sensor packet emitted every tick."""

    machine_id: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    tool_id: str
    spindle_vibration: float = Field(description="Spindle vibration in mm/s")
    motor_current: float = Field(description="Motor current in Amperes")
    spindle_temp: float = Field(description="Spindle bearing temperature in Celsius")
    rpm: int = Field(description="Spindle rotational speed")
    operating_status: str = Field(default="NORMAL")  # NORMAL, WARNING, ALARM
    anomaly_score: float = Field(default=0.0, ge=0.0, le=1.0)
    dryer_dew_point: Optional[float] = Field(
        default=None,
        description="Material dryer dew point in Celsius (e.g. -40 C normal, -18 C damp)",
    )


class ConveyorPart(BaseModel):
    """Discrete serialized part moving through the optical inspection station."""

    product_id: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    machine_id: str
    tool_id: str
    lot_id: str = "AL-5083-B4"
    status: str = "PASS"  # PASS, DEFECT_SCRATCH, DEFECT_SHORT_FILL, DEFECT_SINK_MARK
    defect_type: Optional[str] = None
    confidence: float = Field(default=0.98, ge=0.0, le=1.0)
    image_token: Optional[str] = None
    cavity_id: Optional[int] = Field(
        default=None, description="Mold cavity identifier for multi-cavity injection molds"
    )


class MachineTelemetryPayload(BaseModel):
    """Canonical machine telemetry event payload for Pub/Sub topic kaizen-telemetry."""

    machine_id: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    tool_id: str
    spindle_vibration: float
    motor_current: float
    spindle_temp: float
    rpm: int
    operating_status: str = "NORMAL"
    dryer_dew_point: Optional[float] = None


class TraceabilityEventPayload(BaseModel):
    """Discrete traceability event emitted at conveyor optical inspection or tagging stations."""

    product_id: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    machine_id: str
    tool_id: str
    lot_id: str = "AL-5083-B4"
    operator_id: str = "OP-12"
    status: str = "PASS"


class QualityEventPayload(BaseModel):
    """Quality / SPC anomaly event forwarded from edge gateway to Cloud via Pub/Sub."""

    event_id: str = Field(
        default_factory=lambda: f"EVT-{int(datetime.now(timezone.utc).timestamp())}"
    )
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    event_type: str = "defect_spc_breach"
    scenario: str = "cnc_tool_wear"
    mode: str = "demo"
    machine_id: str = "CNC-02"
    tool_id: Optional[str] = "T07"
    defect_type: Optional[str] = "scratch_vertical"
    defect_rate: float = 0.077
    severity: str = "medium"
    filtered_frame: Optional[FilteredFramePacket] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SimulatorTickSummary(BaseModel):
    """Aggregate snapshot produced per simulation tick."""

    tick_index: int
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    telemetry: list[MachineTelemetry]
    parts: list[ConveyorPart]
    edge_stats: Optional[EdgeFilterStatistics] = None
    forwarded_packets: list[FilteredFramePacket] = Field(default_factory=list)
