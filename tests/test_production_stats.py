"""Unit tests for production stats and real-time OEE engine."""

from __future__ import annotations

from backend.core.config import settings
from backend.core.models import IncidentState, LineOeeResponse
from backend.tools.production_stats import (
    DEFAULT_LINE_ID,
    build_oee_series,
    calculate_availability,
    calculate_oee_losses,
    calculate_performance,
    calculate_production_stats,
    fetch_telemetry_points,
    get_inspection_window,
    get_inspection_window_with_source,
    query_traceability_counts,
)


def test_query_traceability_counts():
    """Verify aggregation returns counts for all 3 CNC machines and line total."""
    counts = query_traceability_counts()
    assert "CNC-01" in counts
    assert "CNC-02" in counts
    assert "CNC-03" in counts
    assert "line" in counts

    # Line totals must equal sum of individual machines
    sum_parts = (
        counts["CNC-01"]["total_parts"]
        + counts["CNC-02"]["total_parts"]
        + counts["CNC-03"]["total_parts"]
    )
    assert counts["line"]["total_parts"] == sum_parts

    sum_defects = (
        counts["CNC-01"]["defect_count"]
        + counts["CNC-02"]["defect_count"]
        + counts["CNC-03"]["defect_count"]
    )
    assert counts["line"]["defect_count"] == sum_defects
    assert 0.0 <= counts["line"]["quality"] <= 1.0


def test_calculate_availability_normal():
    """Verify normal baseline availability matches planned availability (0.92)."""
    incident = IncidentState(status="normal")
    line_avail = calculate_availability(incident=incident, window_minutes=60, machine_id=None)
    assert line_avail == settings.planned_availability

    m_avail = calculate_availability(incident=incident, window_minutes=60, machine_id="CNC-02")
    assert m_avail == settings.planned_availability


def test_calculate_availability_repairing_suspect_machine():
    """Verify repairing status decreases availability for suspect machine and line."""
    incident = IncidentState(
        incident_id="INC-TEST",
        status="repairing",
        suspect_machine="CNC-02",
        opened_at="2026-10-05T09:30:00Z",
        mttr_target_minutes=15,
    )
    # CNC-01 (not affected)
    cnc01_avail = calculate_availability(incident=incident, window_minutes=60, machine_id="CNC-01")
    assert cnc01_avail == settings.planned_availability

    # CNC-02 (suspect machine repairing)
    cnc02_avail = calculate_availability(incident=incident, window_minutes=60, machine_id="CNC-02")
    assert cnc02_avail < settings.planned_availability

    # Line availability is reduced proportionally across 3 machines
    line_avail = calculate_availability(incident=incident, window_minutes=60, machine_id=None)
    assert line_avail < settings.planned_availability
    assert line_avail > cnc02_avail


def test_calculate_performance():
    """Verify performance ratio calculation from RPM vs nominal (12000)."""
    nominal = 12000
    points_normal = [{"spindle_speed_rpm": 12000}]
    ratio, rpm = calculate_performance(points_normal, nominal)
    assert ratio == 1.0
    assert rpm == 12000

    points_slow = [{"spindle_speed_rpm": 11400}]
    ratio_slow, rpm_slow = calculate_performance(points_slow, nominal)
    assert ratio_slow == 0.95
    assert rpm_slow == 11400


def test_calculate_oee_losses_waterfall():
    """Verify 4 standard loss categories sum and reconcile with 1 - OEE."""
    planned_a = 0.92
    a = 0.85
    p = 0.98
    q = 0.90
    oee = a * p * q  # 0.85 * 0.98 * 0.90 = 0.7497

    losses = calculate_oee_losses(
        availability=a,
        performance=p,
        quality=q,
        planned_availability=planned_a,
        suspect_machine="CNC-02",
        incident_id="INC-001",
        defect_label="Surface Scratches",
        defect_count=10,
        total_parts=100,
        slowest_machine="CNC-02",
        slowest_rpm=11760,
    )

    assert len(losses) == 4
    kinds = {loss.kind for loss in losses}
    assert kinds == {"planned_stop", "unplanned_downtime", "speed", "quality"}

    total_loss_points = sum(loss.points for loss in losses)
    # Total losses + OEE should equal 1.0 (within roundoff tolerance)
    assert abs((total_loss_points + oee) - 1.0) < 0.01

    # Downtime and quality losses should have CNC-02 attribution
    dt_loss = next(loss for loss in losses if loss.kind == "unplanned_downtime")
    assert dt_loss.machine_id == "CNC-02"
    assert dt_loss.incident_id == "INC-001"

    q_loss = next(loss for loss in losses if loss.kind == "quality")
    assert q_loss.machine_id == "CNC-02"
    assert "Surface Scratches" in str(q_loss.reason)


def test_build_oee_series():
    """Verify series builder returns ordered OeePoint objects."""
    points = [
        {"timestamp": "2026-10-05T09:00:00Z", "spindle_speed_rpm": 12000, "is_anomalous": False},
        {"timestamp": "2026-10-05T09:30:00Z", "spindle_speed_rpm": 11980, "is_anomalous": True},
    ]
    series = build_oee_series(points, availability=0.92, quality=0.95, num_buckets=5)
    assert len(series) == 2
    assert series[0].timestamp == "2026-10-05T09:00:00Z"
    assert series[0].oee > 0.0
    assert series[1].timestamp == "2026-10-05T09:30:00Z"


def test_calculate_production_stats_model():
    """Verify calculate_production_stats returns a fully populated LineOeeResponse."""
    resp = calculate_production_stats(line_id=DEFAULT_LINE_ID, window_minutes=60)
    assert isinstance(resp, LineOeeResponse)
    assert resp.line_id == DEFAULT_LINE_ID
    assert resp.target == settings.oee_target
    assert 0.0 <= resp.availability <= 1.0
    assert 0.0 <= resp.performance <= 1.0
    assert 0.0 <= resp.quality <= 1.0
    assert 0.0 <= resp.oee <= 1.0

    # Machines breakdown
    assert len(resp.machines) == 3
    machine_ids = {m.machine_id for m in resp.machines}
    assert machine_ids == {"CNC-01", "CNC-02", "CNC-03"}

    for m in resp.machines:
        assert m.total_parts >= m.good_parts
        assert len(m.series) > 0

    # Losses
    assert len(resp.losses) == 4
    # Series
    assert len(resp.series) > 0


def test_fetch_telemetry_points():
    """Verify fetch_telemetry_points returns sorted telemetry samples."""
    pts = fetch_telemetry_points(machine_id="CNC-01")
    assert len(pts) > 0
    for p in pts:
        assert p["machine_id"] == "CNC-01"
        assert "vibration_mm_s" in p
        assert "spindle_speed_rpm" in p


def test_get_inspection_window():
    """Verify get_inspection_window returns discrete inspection records for SPC."""
    records = get_inspection_window(limit=30)
    assert len(records) > 0
    assert "status" in records[0]
    assert "is_defect" in records[0]
    assert "timestamp" in records[0]
    assert isinstance(records[0]["is_defect"], bool)


def test_get_inspection_window_with_source_seed_fallback():
    records, source = get_inspection_window_with_source(limit=5)
    assert source == "seed"
    assert len(records) == 5
    timestamps = [r["timestamp"] for r in records]
    assert timestamps == sorted(timestamps)


def test_get_inspection_window_with_source_machine_filter():
    records, source = get_inspection_window_with_source(limit=10, machine_id="CNC-02")
    assert all(r["machine_id"] == "CNC-02" for r in records)
    assert len(records) > 0


def test_get_inspection_window_with_source_mock_buffer():
    from backend.tools.bigquery_tool import (
        MOCK_TRACEABILITY_RECORDS,
        clear_mock_traceability_records,
    )

    clear_mock_traceability_records()
    try:
        MOCK_TRACEABILITY_RECORDS.append(
            {
                "product_id": "PRD-MOCK-1",
                "timestamp": "2026-10-05T12:00:00Z",
                "machine_id": "CNC-02",
                "status": "DEFECT_BURR",
            }
        )
        records, source = get_inspection_window_with_source(limit=5, machine_id="CNC-02")
        assert source == "mock_buffer"
        assert any(r["product_id"] == "PRD-MOCK-1" for r in records)
        assert records[-1]["product_id"] == "PRD-MOCK-1"
        assert records[-1]["is_defect"] is True
    finally:
        clear_mock_traceability_records()


def test_get_inspection_window_with_source_bigquery_parameterized():
    from unittest.mock import MagicMock, patch

    mock_client = MagicMock()
    mock_client.project = "test-project"

    mock_rows = [
        {
            "product_id": "PRD-02",
            "timestamp": "2026-10-05T10:01:00Z",
            "machine_id": "CNC-02",
            "status": "DEFECT_SCRATCH",
        },
        {
            "product_id": "PRD-01",
            "timestamp": "2026-10-05T10:00:00Z",
            "machine_id": "CNC-02",
            "status": "PASS",
        },
    ]

    with (
        patch("backend.tools.production_stats.get_bigquery_client", return_value=mock_client),
        patch("backend.tools.bigquery_tool._run_query", return_value=mock_rows) as mock_run_query,
    ):
        records, source = get_inspection_window_with_source(limit=2, machine_id="CNC-02")
        assert source == "bigquery"
        assert len(records) == 2
        assert records[0]["product_id"] == "PRD-01"
        assert records[1]["product_id"] == "PRD-02"

        mock_run_query.assert_called_once()
        sql = mock_run_query.call_args[0][1]
        params = mock_run_query.call_args[0][2]

        assert "CNC-02" not in sql
        assert "@limit" in sql
        assert "@machine_id" in sql

        param_names = {p.name: p for p in params}
        assert "limit" in param_names
        assert param_names["limit"].value == 2
        assert param_names["limit"].type_ == "INT64"
        assert "machine_id" in param_names
        assert param_names["machine_id"].value == "CNC-02"
        assert param_names["machine_id"].type_ == "STRING"


def test_fetch_telemetry_from_bigquery_parameterized_and_bounded():
    """User input reaches BigQuery only as parameters; no start_time means a bounded window."""
    from unittest.mock import MagicMock, patch

    from backend.tools.production_stats import (
        TELEMETRY_DEFAULT_WINDOW_HOURS,
        fetch_telemetry_from_bigquery,
    )

    mock_client = MagicMock()
    mock_client.project = "test-project"
    hostile = "x' OR '1'='1"

    with (
        patch("backend.tools.production_stats.get_bigquery_client", return_value=mock_client),
        patch("backend.tools.bigquery_tool._run_query", return_value=[]) as mock_run_query,
    ):
        assert fetch_telemetry_from_bigquery(machine_id=hostile) is None
        sql, params = mock_run_query.call_args[0][1:3]
        by_name = {p.name: p for p in params}
        assert hostile not in sql
        assert by_name["machine_id"].value == hostile
        assert "@window_hours" in sql
        assert by_name["window_hours"].value == TELEMETRY_DEFAULT_WINDOW_HOURS == 6

        fetch_telemetry_from_bigquery(start_time="2026-10-05T09:00:00Z' --")
        sql, params = mock_run_query.call_args[0][1:3]
        by_name = {p.name: p for p in params}
        assert "--" not in sql
        assert "@window_hours" not in sql
        assert set(by_name) == {"start_time"}


def test_get_inspection_window_wrapper():
    records = get_inspection_window(limit=5)
    assert isinstance(records, list)
    assert len(records) == 5
