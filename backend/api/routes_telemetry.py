"""API Routes: Machine sensor telemetry queries and multi-machine correlation series."""

from __future__ import annotations

import asyncio
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Query

from backend.core.models import (
    MultiMachineTelemetryResponse,
    SensorBaseline,
    TelemetryPoint,
)
from backend.tools.bigquery_tool import get_mock_sensor_telemetry
from backend.tools.production_stats import (
    CANONICAL_TELEMETRY_POINTS,
    fetch_telemetry_from_bigquery,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])

# Standard baseline nominal levels
NOMINAL_BASELINE = SensorBaseline(vibration=1.50, temperature=40.0, current=12.0)
VIBRATION_WARNING_THRESHOLD = 1.95  # 1.50 * 1.30 (+30% warning threshold)
CURRENT_WARNING_THRESHOLD = 13.0


@router.get("/history", response_model=MultiMachineTelemetryResponse)
async def get_telemetry_history(
    machine_id: Optional[str] = Query(None, description="Optional machine ID filter"),
    start_time: Optional[str] = Query(None, description="ISO timestamp start filter"),
    end_time: Optional[str] = Query(None, description="ISO timestamp end filter"),
) -> MultiMachineTelemetryResponse:
    """Returns multi-machine time-series telemetry records for comparative sensor correlation.

    Compares CNC-02 (suspect machine with +35% vibration spike at 09:30) against
    baseline controls CNC-01 and CNC-03.
    """
    bq_rows = await asyncio.to_thread(
        fetch_telemetry_from_bigquery, machine_id, start_time, end_time
    )
    source = "bigquery" if bq_rows else "canonical_seed"
    raw_points = bq_rows if bq_rows is not None else list(CANONICAL_TELEMETRY_POINTS)

    # Ingest any in-memory mock buffer records
    mock_buffer = get_mock_sensor_telemetry()
    for m in mock_buffer:
        raw_points.append(
            {
                "timestamp": m.get("timestamp", ""),
                "machine_id": m.get("machine_id", ""),
                "vibration_mm_s": round(float(m.get("vibration_mm_s", 0.0)), 2),
                "temperature_c": round(float(m.get("temperature_c", 0.0)), 1),
                "current_a": round(float(m.get("current_a", 0.0)), 2),
                "spindle_speed_rpm": int(m.get("spindle_speed_rpm", 12000)),
                "is_anomalous": float(m.get("vibration_mm_s", 0.0)) >= VIBRATION_WARNING_THRESHOLD,
                "anomaly_score": 0.85
                if float(m.get("vibration_mm_s", 0.0)) >= VIBRATION_WARNING_THRESHOLD
                else 0.04,
            }
        )

    # Filter by machine_id if requested
    if machine_id:
        raw_points = [p for p in raw_points if p.get("machine_id") == machine_id]

    # Filter by timestamps if provided
    if start_time:
        raw_points = [p for p in raw_points if str(p.get("timestamp")) >= start_time]
    if end_time:
        raw_points = [p for p in raw_points if str(p.get("timestamp")) <= end_time]

    # Group into machine series
    series_dict: Dict[str, List[TelemetryPoint]] = {}
    for p in raw_points:
        mid = str(p.get("machine_id"))
        if mid not in series_dict:
            series_dict[mid] = []
        series_dict[mid].append(
            TelemetryPoint(
                timestamp=str(p.get("timestamp")),
                machine_id=mid,
                vibration_mm_s=float(p.get("vibration_mm_s", 0.0)),
                temperature_c=float(p.get("temperature_c", 0.0)),
                current_a=float(p.get("current_a", 0.0)),
                spindle_speed_rpm=int(p.get("spindle_speed_rpm", 12000)),
                is_anomalous=bool(p.get("is_anomalous", False)),
                anomaly_score=float(p.get("anomaly_score", 0.0)),
            )
        )

    # Sort each series by timestamp
    for mid in series_dict:
        series_dict[mid].sort(key=lambda x: x.timestamp)

    return MultiMachineTelemetryResponse(
        series=series_dict,
        baseline=NOMINAL_BASELINE,
        vibration_warning_threshold=VIBRATION_WARNING_THRESHOLD,
        current_warning_threshold=CURRENT_WARNING_THRESHOLD,
        anomaly_onset_time="2026-10-05T09:30:00Z",
        time_window="09:00-10:00",
        source=source,
    )


@router.get("/baseline")
async def get_telemetry_baseline() -> Dict[str, object]:
    """Returns baseline and anomaly thresholds for sensor metrics."""
    return {
        "baseline": NOMINAL_BASELINE.model_dump(),
        "vibration_warning_threshold": VIBRATION_WARNING_THRESHOLD,
        "current_warning_threshold": CURRENT_WARNING_THRESHOLD,
        "anomaly_onset_time": "2026-10-05T09:30:00Z",
        "description": (
            "Spindle vibration nominal baseline is 1.50 mm/s. "
            "A rise above 1.95 mm/s (+30%) indicates severe tool wear and defect propagation."
        ),
    }
