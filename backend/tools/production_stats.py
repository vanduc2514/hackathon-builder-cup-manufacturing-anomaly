"""Production statistics and real-time OEE engine for Cell Line 1."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import (
    IncidentState,
    LineOeeResponse,
    MachineOee,
    OeeLoss,
    OeePoint,
)
from backend.tools.bigquery_tool import (
    get_bigquery_client,
    get_mock_sensor_telemetry,
    get_mock_traceability_records,
    query_traceability_topology,
)

logger = logging.getLogger(__name__)

DEFAULT_LINE_ID = "cell-line-1"
DEFAULT_TARGET_OEE = 0.85
DEFAULT_PLANNED_AVAILABILITY = 0.92
DEFAULT_MACHINES = ("CNC-01", "CNC-02", "CNC-03")
NOMINAL_SPINDLE_RPM = 12000
VIBRATION_WARNING_THRESHOLD = 1.95
CURRENT_WARNING_THRESHOLD = 13.0

# Canonical pre-incident and incident telemetry series (09:00 - 10:00)
# Captures normal operation on CNC-01 and CNC-03, and the +35% vibration surge on CNC-02 at 09:30
CANONICAL_TELEMETRY_POINTS: List[Dict[str, Any]] = [
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
    # ANOMALY ONSET: 09:30 (+35% rise above 1.50 baseline = 2.15 mm/s)
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
        "vibration_mm_s": 2.95,
        "temperature_c": 43.4,
        "current_a": 14.0,
        "spindle_speed_rpm": 11860,
        "is_anomalous": True,
        "anomaly_score": 0.99,
    },
]


def _fetch_telemetry_from_bigquery(
    machine_id: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
) -> Optional[List[Dict[str, Any]]]:
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
                COALESCE(spindle_speed_rpm, {NOMINAL_SPINDLE_RPM}) as spindle_speed_rpm
            FROM `{dataset_id}.sensor_telemetry`
            {where_str}
            ORDER BY timestamp ASC
        """
        rows = list(client.query(query).result())
        if not rows:
            return None

        result: List[Dict[str, Any]] = []
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


def fetch_telemetry_points(
    machine_id: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetches telemetry points from BigQuery or falls back to canonical mock series and buffer."""
    bq_rows = _fetch_telemetry_from_bigquery(machine_id, start_time, end_time)
    raw_points = [dict(p) for p in (bq_rows if bq_rows is not None else CANONICAL_TELEMETRY_POINTS)]

    mock_buffer = get_mock_sensor_telemetry()
    for m in mock_buffer:
        vib = float(m.get("vibration_mm_s", 0.0))
        raw_points.append(
            {
                "timestamp": m.get("timestamp", ""),
                "machine_id": m.get("machine_id", ""),
                "vibration_mm_s": round(vib, 2),
                "temperature_c": round(float(m.get("temperature_c", 0.0)), 1),
                "current_a": round(float(m.get("current_a", 0.0)), 2),
                "spindle_speed_rpm": int(m.get("spindle_speed_rpm", NOMINAL_SPINDLE_RPM)),
                "is_anomalous": vib >= VIBRATION_WARNING_THRESHOLD,
                "anomaly_score": 0.85 if vib >= VIBRATION_WARNING_THRESHOLD else 0.04,
            }
        )

    if machine_id:
        raw_points = [p for p in raw_points if p.get("machine_id") == machine_id]
    if start_time:
        raw_points = [p for p in raw_points if str(p.get("timestamp")) >= start_time]
    if end_time:
        raw_points = [p for p in raw_points if str(p.get("timestamp")) <= end_time]

    return sorted(raw_points, key=lambda x: str(x.get("timestamp", "")))


def query_traceability_counts(
    time_window: Optional[str] = "09:30-10:00",
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    incident: Optional[IncidentState] = None,
) -> Dict[str, Dict[str, Any]]:
    """Aggregates part counts and defect stats per machine and across the line."""
    machine_counts: Dict[str, Dict[str, int]] = {
        m: {"total_parts": 0, "defect_count": 0, "good_parts": 0} for m in DEFAULT_MACHINES
    }

    try:
        topo = query_traceability_topology(
            time_window=time_window,
            start_time=start_time,
            end_time=end_time,
        )
        for suspect in topo.suspects:
            mid = suspect.machine_id
            if mid not in machine_counts:
                machine_counts[mid] = {"total_parts": 0, "defect_count": 0, "good_parts": 0}
            machine_counts[mid]["total_parts"] += suspect.total_parts
            machine_counts[mid]["defect_count"] += suspect.defect_count
    except Exception as exc:
        logger.warning("Traceability topology query failed: %s; using mock counts", exc)

    mock_records = get_mock_traceability_records()
    for rec in mock_records:
        mid = rec.get("machine_id", "CNC-02")
        status = rec.get("status", "PASS")
        if mid not in machine_counts:
            machine_counts[mid] = {"total_parts": 0, "defect_count": 0, "good_parts": 0}
        machine_counts[mid]["total_parts"] += 1
        if str(status).startswith("DEFECT"):
            machine_counts[mid]["defect_count"] += 1

    total_found = sum(m["total_parts"] for m in machine_counts.values())
    if total_found == 0:
        machine_counts["CNC-01"] = {"total_parts": 28, "defect_count": 0, "good_parts": 28}
        machine_counts["CNC-03"] = {"total_parts": 27, "defect_count": 0, "good_parts": 27}
        if incident and incident.suspect_machine:
            sm = incident.suspect_machine
            d_rate = max(0.0, min(1.0, incident.defect_rate))
            defects = int(round(25 * d_rate))
            machine_counts[sm] = {
                "total_parts": 25,
                "defect_count": defects,
                "good_parts": 25 - defects,
            }
        else:
            machine_counts["CNC-02"] = {"total_parts": 25, "defect_count": 0, "good_parts": 25}

    res: Dict[str, Dict[str, Any]] = {}
    total_line_parts = 0
    total_line_defects = 0

    for mid, counts in machine_counts.items():
        tp = counts["total_parts"]
        dc = counts["defect_count"]
        gp = max(0, tp - dc)
        quality = (gp / tp) if tp > 0 else 1.0
        defect_rate = (dc / tp) if tp > 0 else 0.0
        res[mid] = {
            "total_parts": tp,
            "defect_count": dc,
            "good_parts": gp,
            "defect_rate": round(defect_rate, 4),
            "quality": round(quality, 4),
        }
        total_line_parts += tp
        total_line_defects += dc

    total_line_good = max(0, total_line_parts - total_line_defects)
    line_quality = (total_line_good / total_line_parts) if total_line_parts > 0 else 1.0
    line_defect_rate = (total_line_defects / total_line_parts) if total_line_parts > 0 else 0.0

    res["line"] = {
        "total_parts": total_line_parts,
        "defect_count": total_line_defects,
        "good_parts": total_line_good,
        "defect_rate": round(line_defect_rate, 4),
        "quality": round(line_quality, 4),
    }

    return res


def calculate_availability(
    incident: Optional[IncidentState] = None,
    window_minutes: int = 60,
    machine_id: Optional[str] = None,
    planned_availability: float = DEFAULT_PLANNED_AVAILABILITY,
) -> float:
    """Calculates availability taking into account repair downtime from incident timestamps."""
    if incident is None:
        incident = blackboard.get_state()

    if not incident or incident.status in ("normal", "closed", "dismissed"):
        return planned_availability

    is_affected = False
    if machine_id is None:
        is_affected = True
    elif incident.suspect_machine == machine_id:
        is_affected = True

    if not is_affected:
        return planned_availability

    downtime_minutes = 0.0
    if incident.opened_at:
        try:
            opened_str = incident.opened_at.replace("Z", "+00:00")
            opened_dt = datetime.fromisoformat(opened_str)
            if incident.closed_at:
                closed_str = incident.closed_at.replace("Z", "+00:00")
                closed_dt = datetime.fromisoformat(closed_str)
                downtime_minutes = max(0.0, (closed_dt - opened_dt).total_seconds() / 60.0)
            else:
                now_dt = datetime.now(timezone.utc)
                downtime_minutes = max(0.0, (now_dt - opened_dt).total_seconds() / 60.0)
        except Exception as exc:
            logger.debug("Failed parsing incident timestamps: %s; using mttr_target", exc)
            downtime_minutes = float(incident.mttr_target_minutes or 15.0)
    else:
        downtime_minutes = float(incident.mttr_target_minutes or 15.0)

    if incident.status == "repairing":
        multiplier = 1.0
    elif incident.status in ("awaiting_evidence", "investigating", "tracing", "detecting"):
        multiplier = 0.5
    else:
        multiplier = 1.0

    downtime_minutes *= multiplier
    clamped_downtime = min(float(window_minutes), max(0.0, downtime_minutes))
    downtime_ratio = clamped_downtime / float(window_minutes) if window_minutes > 0 else 0.0

    if machine_id is not None:
        return round(max(0.0, min(1.0, planned_availability * (1.0 - downtime_ratio))), 4)
    else:
        num_machines = len(DEFAULT_MACHINES)
        line_impact = downtime_ratio / num_machines
        return round(max(0.0, min(1.0, planned_availability * (1.0 - line_impact))), 4)


def calculate_performance(
    telemetry_points: List[Dict[str, Any]],
    nominal_rpm: int = NOMINAL_SPINDLE_RPM,
) -> Tuple[float, int]:
    """Calculates performance ratio from spindle RPM vs nominal RPM."""
    if not telemetry_points:
        return 1.0, nominal_rpm

    rpms = [int(p.get("spindle_speed_rpm", nominal_rpm)) for p in telemetry_points]
    if not rpms:
        return 1.0, nominal_rpm

    latest_rpm = rpms[-1]
    ratio = min(1.0, max(0.0, latest_rpm / nominal_rpm)) if nominal_rpm > 0 else 1.0
    return round(ratio, 4), latest_rpm


def calculate_oee_losses(
    availability: float,
    performance: float,
    quality: float,
    planned_availability: float = DEFAULT_PLANNED_AVAILABILITY,
    suspect_machine: Optional[str] = None,
    incident_id: Optional[str] = None,
    defect_label: Optional[str] = None,
    defect_count: int = 0,
    total_parts: int = 0,
    slowest_machine: Optional[str] = None,
    slowest_rpm: Optional[int] = None,
) -> List[OeeLoss]:
    """Calculates standard 4-category OEE loss waterfall summing to 1.0 - OEE."""
    loss_planned = round(max(0.0, 1.0 - planned_availability), 4)
    loss_downtime = round(max(0.0, planned_availability - availability), 4)
    dt_reason = (
        f"{suspect_machine or 'Line'} stopped for repair/investigation"
        if loss_downtime > 0.0005
        else "No unplanned downtime recorded"
    )

    loss_speed = round(max(0.0, availability * (1.0 - performance)), 4)
    speed_reason = (
        f"Spindle speed drop on {slowest_machine or 'line'} ({slowest_rpm or 'low'} RPM)"
        if loss_speed > 0.0005
        else "All spindles operating at nominal speed"
    )

    loss_quality = round(max(0.0, availability * performance * (1.0 - quality)), 4)
    q_reason = (
        f"{suspect_machine or 'Line'} · {defect_label or 'Defects'} scrap "
        f"({defect_count}/{total_parts} parts)"
        if loss_quality > 0.0005
        else "Zero defect scrap recorded"
    )

    losses = [
        OeeLoss(
            kind="planned_stop",
            points=loss_planned,
            machine_id=None,
            reason="Scheduled breaks, changeovers, warmup",
            incident_id=None,
        ),
        OeeLoss(
            kind="unplanned_downtime",
            points=loss_downtime,
            machine_id=suspect_machine if loss_downtime > 0.0005 else None,
            reason=dt_reason,
            incident_id=incident_id if loss_downtime > 0.0005 else None,
        ),
        OeeLoss(
            kind="speed",
            points=loss_speed,
            machine_id=slowest_machine if loss_speed > 0.0005 else None,
            reason=speed_reason,
            incident_id=None,
        ),
        OeeLoss(
            kind="quality",
            points=loss_quality,
            machine_id=suspect_machine if loss_quality > 0.0005 else None,
            reason=q_reason,
            incident_id=incident_id if loss_quality > 0.0005 else None,
        ),
    ]

    return sorted(losses, key=lambda loss_item: loss_item.points, reverse=True)


def build_oee_series(
    telemetry_points: List[Dict[str, Any]],
    availability: float,
    quality: float,
    nominal_rpm: int = NOMINAL_SPINDLE_RPM,
    num_buckets: int = 15,
) -> List[OeePoint]:
    """Generates chronological OEE trend points across telemetry samples."""
    if not telemetry_points:
        return []

    sorted_pts = sorted(telemetry_points, key=lambda p: str(p.get("timestamp", "")))
    n = len(sorted_pts)

    if n <= num_buckets:
        sampled = sorted_pts
    else:
        step = n / float(num_buckets)
        sampled = [sorted_pts[int(i * step)] for i in range(num_buckets)]
        if sorted_pts[-1] not in sampled:
            sampled[-1] = sorted_pts[-1]

    series: List[OeePoint] = []
    for p in sampled:
        ts = str(p.get("timestamp", ""))
        rpm = int(p.get("spindle_speed_rpm", nominal_rpm))
        perf = min(1.0, max(0.0, rpm / nominal_rpm)) if nominal_rpm > 0 else 1.0
        is_anom = bool(p.get("is_anomalous", False))
        pt_quality = quality if not is_anom else max(0.0, quality * 0.9)
        pt_oee = availability * perf * pt_quality
        series.append(
            OeePoint(
                timestamp=ts,
                availability=round(availability, 4),
                performance=round(perf, 4),
                quality=round(pt_quality, 4),
                oee=round(pt_oee, 4),
            )
        )
    return series


def calculate_production_stats(
    line_id: str = DEFAULT_LINE_ID,
    window_minutes: int = 60,
    incident: Optional[IncidentState] = None,
) -> LineOeeResponse:
    """Calculates line-level and station-level OEE using BigQuery, telemetry, and incident state."""
    if incident is None:
        incident = blackboard.get_state()

    counts = query_traceability_counts(incident=incident)
    line_counts = counts.get(
        "line", {"total_parts": 0, "defect_count": 0, "good_parts": 0, "quality": 1.0}
    )

    machine_oee_list: List[MachineOee] = []
    machine_perfs: Dict[str, float] = {}
    machine_rpms: Dict[str, int] = {}

    all_telemetry = fetch_telemetry_points()

    for mid in DEFAULT_MACHINES:
        m_counts = counts.get(
            mid, {"total_parts": 0, "defect_count": 0, "good_parts": 0, "quality": 1.0}
        )
        m_pts = [p for p in all_telemetry if p.get("machine_id") == mid]
        m_perf, m_rpm = calculate_performance(m_pts, NOMINAL_SPINDLE_RPM)
        machine_perfs[mid] = m_perf
        machine_rpms[mid] = m_rpm

        m_avail = calculate_availability(
            incident=incident,
            window_minutes=window_minutes,
            machine_id=mid,
        )
        m_qual = float(m_counts.get("quality", 1.0))
        m_oee = round(m_avail * m_perf * m_qual, 4)

        m_series = build_oee_series(m_pts, m_avail, m_qual, NOMINAL_SPINDLE_RPM)

        machine_oee_list.append(
            MachineOee(
                machine_id=mid,
                availability=m_avail,
                performance=m_perf,
                quality=m_qual,
                oee=m_oee,
                good_parts=int(m_counts.get("good_parts", 0)),
                total_parts=int(m_counts.get("total_parts", 0)),
                series=m_series,
            )
        )

    line_avail = calculate_availability(
        incident=incident,
        window_minutes=window_minutes,
        machine_id=None,
    )
    line_perf = round(sum(machine_perfs.values()) / max(len(machine_perfs), 1), 4)
    line_qual = float(line_counts.get("quality", 1.0))
    line_oee = round(line_avail * line_perf * line_qual, 4)

    line_series = build_oee_series(all_telemetry, line_avail, line_qual, NOMINAL_SPINDLE_RPM)

    slowest_mid = min(machine_perfs.keys(), key=lambda k: machine_perfs[k])
    slowest_rpm = machine_rpms[slowest_mid]
    suspect_m = incident.suspect_machine if incident and incident.suspect_machine else None
    inc_id = incident.incident_id if incident and incident.incident_id else None
    defect_label = (
        incident.defect_type if incident and incident.defect_type else "Surface Scratches"
    )

    losses = calculate_oee_losses(
        availability=line_avail,
        performance=line_perf,
        quality=line_qual,
        planned_availability=DEFAULT_PLANNED_AVAILABILITY,
        suspect_machine=suspect_m,
        incident_id=inc_id,
        defect_label=defect_label,
        defect_count=int(line_counts.get("defect_count", 0)),
        total_parts=int(line_counts.get("total_parts", 0)),
        slowest_machine=slowest_mid if machine_perfs[slowest_mid] < 0.999 else None,
        slowest_rpm=slowest_rpm if machine_perfs[slowest_mid] < 0.999 else None,
    )

    return LineOeeResponse(
        line_id=line_id,
        target=DEFAULT_TARGET_OEE,
        availability=line_avail,
        performance=line_perf,
        quality=line_qual,
        oee=line_oee,
        series=line_series,
        machines=machine_oee_list,
        losses=losses,
    )


def get_inspection_window(
    limit: int = 60,
    machine_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Returns discrete inspection records for SPC calculations and run charts."""
    mock_records = get_mock_traceability_records()
    records: List[Dict[str, Any]] = []

    for r in mock_records:
        if machine_id and r.get("machine_id") != machine_id:
            continue
        records.append(
            {
                "product_id": r.get("product_id", ""),
                "timestamp": r.get("timestamp", ""),
                "machine_id": r.get("machine_id", ""),
                "status": r.get("status", "PASS"),
                "is_defect": str(r.get("status", "")).startswith("DEFECT"),
            }
        )

    if len(records) < limit:
        from scripts.seed_bigquery import SEED_TRACEABILITY_ROWS

        for r in SEED_TRACEABILITY_ROWS:
            if machine_id and r.get("machine_id") != machine_id:
                continue
            records.append(
                {
                    "product_id": r.get("product_id", ""),
                    "timestamp": r.get("timestamp", ""),
                    "machine_id": r.get("machine_id", ""),
                    "status": r.get("status", "PASS"),
                    "is_defect": str(r.get("status", "")).startswith("DEFECT"),
                }
            )

    return records[:limit]
