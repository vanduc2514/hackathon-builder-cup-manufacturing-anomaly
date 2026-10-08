"""API Routes: Machine sensor telemetry queries and multi-machine correlation series."""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Query

from backend.core.config import settings
from backend.core.models import (
    MultiMachineTelemetryResponse,
    SensorBaseline,
    TelemetryPoint,
)
from backend.tools.bigquery_tool import get_bigquery_client, get_mock_sensor_telemetry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])

# Standard baseline nominal levels
NOMINAL_BASELINE = SensorBaseline(vibration=1.50, temperature=40.0, current=12.0)
VIBRATION_WARNING_THRESHOLD = 1.95  # 1.50 * 1.30 (+30% warning threshold)
CURRENT_WARNING_THRESHOLD = 13.0

# Canonical pre-incident and incident telemetry series (09:00 - 10:00)
# Captures normal operation on CNC-01 and CNC-03, and the +35% vibration surge on CNC-02 at 09:30
CANONICAL_TELEMETRY_POINTS: List[Dict[str, object]] = [
    # CNC-01 (Nominal baseline control machine)
    {
        "timestamp": "2026-10-05T09:05:00Z",
        "machine_id": "CNC-01",
        "vibration_mm_s": 1.44,
        "temperature_c": 39.7,
        "current_a": 11.9,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.02,
    },
    {
        "timestamp": "2026-10-05T09:15:00Z",
        "machine_id": "CNC-01",
        "vibration_mm_s": 1.45,
        "temperature_c": 39.8,
        "current_a": 11.9,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.03,
    },
    {
        "timestamp": "2026-10-05T09:25:00Z",
        "machine_id": "CNC-01",
        "vibration_mm_s": 1.47,
        "temperature_c": 39.9,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.03,
    },
    {
        "timestamp": "2026-10-05T09:30:00Z",
        "machine_id": "CNC-01",
        "vibration_mm_s": 1.48,
        "temperature_c": 40.0,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.04,
    },
    {
        "timestamp": "2026-10-05T09:35:00Z",
        "machine_id": "CNC-01",
        "vibration_mm_s": 1.46,
        "temperature_c": 40.0,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.03,
    },
    {
        "timestamp": "2026-10-05T09:40:00Z",
        "machine_id": "CNC-01",
        "vibration_mm_s": 1.47,
        "temperature_c": 40.1,
        "current_a": 12.1,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.03,
    },
    {
        "timestamp": "2026-10-05T09:45:00Z",
        "machine_id": "CNC-01",
        "vibration_mm_s": 1.46,
        "temperature_c": 40.1,
        "current_a": 12.1,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.03,
    },
    {
        "timestamp": "2026-10-05T09:50:00Z",
        "machine_id": "CNC-01",
        "vibration_mm_s": 1.48,
        "temperature_c": 40.2,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.04,
    },
    {
        "timestamp": "2026-10-05T09:55:00Z",
        "machine_id": "CNC-01",
        "vibration_mm_s": 1.45,
        "temperature_c": 40.0,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.03,
    },
    # CNC-03 (Nominal baseline control machine)
    {
        "timestamp": "2026-10-05T09:05:00Z",
        "machine_id": "CNC-03",
        "vibration_mm_s": 1.49,
        "temperature_c": 40.1,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.04,
    },
    {
        "timestamp": "2026-10-05T09:15:00Z",
        "machine_id": "CNC-03",
        "vibration_mm_s": 1.50,
        "temperature_c": 40.2,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.04,
    },
    {
        "timestamp": "2026-10-05T09:25:00Z",
        "machine_id": "CNC-03",
        "vibration_mm_s": 1.51,
        "temperature_c": 40.3,
        "current_a": 12.1,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.05,
    },
    {
        "timestamp": "2026-10-05T09:30:00Z",
        "machine_id": "CNC-03",
        "vibration_mm_s": 1.52,
        "temperature_c": 40.4,
        "current_a": 12.2,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.05,
    },
    {
        "timestamp": "2026-10-05T09:35:00Z",
        "machine_id": "CNC-03",
        "vibration_mm_s": 1.50,
        "temperature_c": 40.2,
        "current_a": 12.1,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.04,
    },
    {
        "timestamp": "2026-10-05T09:40:00Z",
        "machine_id": "CNC-03",
        "vibration_mm_s": 1.51,
        "temperature_c": 40.3,
        "current_a": 12.1,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.05,
    },
    {
        "timestamp": "2026-10-05T09:45:00Z",
        "machine_id": "CNC-03",
        "vibration_mm_s": 1.49,
        "temperature_c": 40.1,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.04,
    },
    {
        "timestamp": "2026-10-05T09:50:00Z",
        "machine_id": "CNC-03",
        "vibration_mm_s": 1.52,
        "temperature_c": 40.3,
        "current_a": 12.1,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.05,
    },
    {
        "timestamp": "2026-10-05T09:55:00Z",
        "machine_id": "CNC-03",
        "vibration_mm_s": 1.50,
        "temperature_c": 40.2,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.04,
    },
    # CNC-02 (Suspect machine - Tool Wear T07 anomaly onset at 09:30, +35% vibration surge)
    {
        "timestamp": "2026-10-05T09:05:00Z",
        "machine_id": "CNC-02",
        "vibration_mm_s": 1.49,
        "temperature_c": 39.9,
        "current_a": 11.9,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.03,
    },
    {
        "timestamp": "2026-10-05T09:15:00Z",
        "machine_id": "CNC-02",
        "vibration_mm_s": 1.51,
        "temperature_c": 40.0,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.04,
    },
    {
        "timestamp": "2026-10-05T09:25:00Z",
        "machine_id": "CNC-02",
        "vibration_mm_s": 1.58,
        "temperature_c": 40.5,
        "current_a": 12.2,
        "spindle_speed_rpm": 12000,
        "is_anomalous": False,
        "anomaly_score": 0.12,
    },
    # ANOMALY ONSET: 09:30 (+35% rise above 1.50 baseline = 2.15 mm/s, 10 min prior to defects at 09:40)
    {
        "timestamp": "2026-10-05T09:30:00Z",
        "machine_id": "CNC-02",
        "vibration_mm_s": 2.15,
        "temperature_c": 41.5,
        "current_a": 13.1,
        "spindle_speed_rpm": 11980,
        "is_anomalous": True,
        "anomaly_score": 0.78,
    },
    {
        "timestamp": "2026-10-05T09:35:00Z",
        "machine_id": "CNC-02",
        "vibration_mm_s": 2.30,
        "temperature_c": 41.8,
        "current_a": 13.2,
        "spindle_speed_rpm": 11960,
        "is_anomalous": True,
        "anomaly_score": 0.85,
    },
    {
        "timestamp": "2026-10-05T09:40:00Z",
        "machine_id": "CNC-02",
        "vibration_mm_s": 2.45,
        "temperature_c": 42.2,
        "current_a": 13.4,
        "spindle_speed_rpm": 11940,
        "is_anomalous": True,
        "anomaly_score": 0.92,
    },
    {
        "timestamp": "2026-10-05T09:45:00Z",
        "machine_id": "CNC-02",
        "vibration_mm_s": 2.70,
        "temperature_c": 42.8,
        "current_a": 13.6,
        "spindle_speed_rpm": 11910,
        "is_anomalous": True,
        "anomaly_score": 0.96,
    },
    {
        "timestamp": "2026-10-05T09:50:00Z",
        "machine_id": "CNC-02",
        "vibration_mm_s": 2.85,
        "temperature_c": 43.1,
        "current_a": 13.8,
        "spindle_speed_rpm": 11880,
        "is_anomalous": True,
        "anomaly_score": 0.98,
    },
    {
        "timestamp": "2026-10-05T09:55:00Z",
        "machine_id": "CNC-02",
        "vibration_mm_s": 2.92,
        "temperature_c": 43.5,
        "current_a": 13.9,
        "spindle_speed_rpm": 11860,
        "is_anomalous": True,
        "anomaly_score": 0.99,
    },
]


def _fetch_from_bigquery(
    machine_id: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
) -> Optional[List[Dict[str, object]]]:
    """Attempts to query telemetry rows from BigQuery or BigQuery Emulator."""
    try:
        client = get_bigquery_client()
        dataset_id = f"{client.project}.{settings.bigquery_dataset}"
        where_clauses: List[str] = []

        if machine_id:
            where_clauses.append(f"machine_id = '{machine_id}'")
        if start_time:
            where_clauses.append(f"timestamp >= TIMESTAMP('{start_time}')")
        if end_time:
            where_clauses.append(f"timestamp <= TIMESTAMP('{end_time}')")

        where_str = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        query = f"""
            SELECT
                FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', timestamp) as timestamp,
                machine_id,
                COALESCE(vibration_mm_s, 0.0) as vibration_mm_s,
                COALESCE(temperature_c, 0.0) as temperature_c,
                COALESCE(current_a, 0.0) as current_a,
                COALESCE(spindle_speed_rpm, 12000) as spindle_speed_rpm
            FROM `{dataset_id}.sensor_telemetry`
            {where_str}
            ORDER BY timestamp ASC
        """
        rows = list(client.query(query).result())
        if not rows:
            return None

        result: List[Dict[str, object]] = []
        for r in rows:
            vib = float(r.vibration_mm_s)
            curr = float(r.current_a)
            is_anom = (vib >= VIBRATION_WARNING_THRESHOLD) or (curr >= CURRENT_WARNING_THRESHOLD)
            score = min(1.0, max(0.0, (vib - 1.50) / 1.50)) if vib > 1.50 else 0.03
            result.append(
                {
                    "timestamp": str(r.timestamp),
                    "machine_id": str(r.machine_id),
                    "vibration_mm_s": round(vib, 2),
                    "temperature_c": round(float(r.temperature_c), 1),
                    "current_a": round(curr, 2),
                    "spindle_speed_rpm": int(r.spindle_speed_rpm),
                    "is_anomalous": is_anom,
                    "anomaly_score": round(score, 2),
                }
            )
        return result
    except Exception as exc:
        logger.debug("BigQuery query attempt failed, falling back to canonical seed: %s", exc)
        return None


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
    bq_rows = _fetch_from_bigquery(machine_id, start_time, end_time)
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
