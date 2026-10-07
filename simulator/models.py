"""Data schemas for machine telemetry and conveyor serialization events."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


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


class SimulatorTickSummary(BaseModel):
    """Aggregate snapshot produced per simulation tick."""

    tick_index: int
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    telemetry: list[MachineTelemetry]
    parts: list[ConveyorPart]
