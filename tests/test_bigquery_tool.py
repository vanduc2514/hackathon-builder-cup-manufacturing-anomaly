"""Unit tests for production BigQuery traceability and sensor telemetry query tools."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from backend.core.models import (
    SensorTelemetryWindowResponse,
    TraceabilityTopologyResponse,
)
from backend.tools.bigquery_tool import (
    get_bigquery_client,
    query_sensor_telemetry_window,
    query_traceability_topology,
)


class MockRow:
    """Helper representing a BigQuery Row object with attribute access."""

    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def _query_params(call) -> dict:
    """Maps query parameter names to values from a recorded client.query call."""
    return {
        p.name: p.values if hasattr(p, "values") else p.value
        for p in call.kwargs["job_config"].query_parameters
    }


def test_get_bigquery_client_emulator():
    """Test BigQuery client creation with emulator endpoint and AnonymousCredentials."""
    with (
        patch("backend.tools.bigquery_tool.settings") as mock_settings,
        patch("google.cloud.bigquery.Client") as mock_client_cls,
        patch("google.auth.credentials.AnonymousCredentials") as mock_anon_creds,
    ):
        mock_settings.bigquery_emulator_host = "localhost:9050"
        mock_settings.gcp_project_id = "kaizen-local"

        client = get_bigquery_client()

        mock_anon_creds.assert_called_once()
        mock_client_cls.assert_called_once_with(
            project="kaizen-local",
            credentials=mock_anon_creds.return_value,
            client_options={"api_endpoint": "http://localhost:9050"},
        )
        assert client == mock_client_cls.return_value


def test_get_bigquery_client_failure_raises_runtime_error():
    """Test that client initialization failures raise RuntimeError (no fallback)."""
    with (
        patch("backend.tools.bigquery_tool.settings") as mock_settings,
        patch("google.cloud.bigquery.Client", side_effect=Exception("Connection refused")),
    ):
        mock_settings.bigquery_emulator_host = None
        mock_settings.gcp_project_id = "test-project"

        with pytest.raises(RuntimeError, match="BigQuery client initialization failed"):
            get_bigquery_client()


def test_query_traceability_topology_success():
    """Test cross-lot topology query isolates suspect machine and tool while excluding normal factors."""
    mock_client = MagicMock()
    mock_client.project = "kaizen-local"

    # Query 1 results: CNC-02 / T07 has high defect ratio
    rows_mt = [
        MockRow(
            machine_id="CNC-02",
            tool_id="T07",
            defect_count=4,
            total_parts=5,
            defect_ratio=0.80,
        ),
        MockRow(
            machine_id="CNC-01",
            tool_id="T04",
            defect_count=0,
            total_parts=3,
            defect_ratio=0.00,
        ),
        MockRow(
            machine_id="CNC-03",
            tool_id="T07",
            defect_count=0,
            total_parts=2,
            defect_ratio=0.00,
        ),
    ]

    # Query 2 results: lot_id and operator_id distribution across the line
    rows_factors = [
        MockRow(
            factor_type="lot_id",
            factor_value="AL-5083-B4",
            defect_count=4,
            total_parts=10,
            defect_ratio=0.40,
        ),
        MockRow(
            factor_type="operator_id",
            factor_value="OP-15",
            defect_count=4,
            total_parts=5,
            defect_ratio=0.80,
        ),
        MockRow(
            factor_type="operator_id",
            factor_value="OP-12",
            defect_count=0,
            total_parts=3,
            defect_ratio=0.00,
        ),
    ]

    mock_query_mt = MagicMock()
    mock_query_mt.result.return_value = rows_mt

    mock_query_factors = MagicMock()
    mock_query_factors.result.return_value = rows_factors

    mock_client.query.side_effect = [mock_query_mt, mock_query_factors]

    with patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client):
        response = query_traceability_topology(time_window="09:30-10:00")

        assert isinstance(response, TraceabilityTopologyResponse)
        assert len(response.suspects) == 3
        top_suspect = response.suspects[0]
        assert top_suspect.machine_id == "CNC-02"
        assert top_suspect.tool_id == "T07"
        assert top_suspect.correlation_score == 0.80
        assert top_suspect.defect_count == 4

        # Verify excluded factors contain normal lot distribution
        assert any("AL-5083-B4" in factor for factor in response.excluded_factors)

        # Verify backward compatibility with dict access (used by TraceabilityAgent in PR #48)
        assert response.get("suspects")[0]["machine_id"] == "CNC-02"
        assert response["source"] in ("bigquery_emulator", "bigquery_live")


def test_query_traceability_topology_with_product_ids_and_timestamps():
    """Test query generation when filtering by explicit product IDs and start/end timestamps."""
    mock_client = MagicMock()
    mock_client.project = "kaizen-local"

    mock_query_mt = MagicMock()
    mock_query_mt.result.return_value = []
    mock_query_factors = MagicMock()
    mock_query_factors.result.return_value = []
    mock_client.query.side_effect = [mock_query_mt, mock_query_factors]

    with patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client):
        query_traceability_topology(
            product_ids=["PRD-1004", "PRD-1005"],
            start_time="2026-10-05T09:30:00Z",
            end_time="2026-10-05T10:00:00Z",
        )

        executed_sql = mock_client.query.call_args_list[0][0][0]
        assert "product_id IN UNNEST(@product_ids)" in executed_sql
        assert "timestamp >= @start_time" in executed_sql
        assert "timestamp <= @end_time" in executed_sql
        assert "PRD-1004" not in executed_sql
        params = _query_params(mock_client.query.call_args_list[0])
        assert params["product_ids"] == ["PRD-1004", "PRD-1005"]
        assert params["start_time"].isoformat() == "2026-10-05T09:30:00+00:00"
        assert params["end_time"].isoformat() == "2026-10-05T10:00:00+00:00"


def test_query_traceability_topology_failure_raises_runtime_error():
    """Test that query failures raise RuntimeError without attempting CSV fallback."""
    mock_client = MagicMock()
    mock_client.project = "kaizen-local"
    mock_client.query.side_effect = Exception("BigQuery syntax error")

    with patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client):
        with pytest.raises(RuntimeError, match="BigQuery query failed"):
            query_traceability_topology()


def test_query_sensor_telemetry_window_nominal():
    """Test telemetry query on normal machine does not flag anomaly."""
    mock_client = MagicMock()
    mock_client.project = "kaizen-local"

    row = MockRow(
        min_vibration=1.42,
        max_vibration=1.55,
        avg_vibration=1.48,
        std_vibration=0.04,
        avg_temperature=39.9,
        avg_current=12.0,
        sample_count=15,
    )

    mock_query = MagicMock()
    mock_query.result.return_value = [row]
    mock_client.query.return_value = mock_query

    with patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client):
        response = query_sensor_telemetry_window(machine_id="CNC-01", time_window="30 MINUTE")

        assert isinstance(response, SensorTelemetryWindowResponse)
        assert response.machine_id == "CNC-01"
        assert response.metrics.avg_vibration == 1.48
        assert response.metrics.max_vibration == 1.55
        assert response.metrics.sample_count == 15
        assert response.anomaly_detected is False

        # Verify dict backward compatibility
        assert response.get("metrics")["avg_vibration"] == 1.48


def test_query_sensor_telemetry_window_anomaly_spike():
    """Test telemetry query on worn tool machine detects vibration anomaly spike."""
    mock_client = MagicMock()
    mock_client.project = "kaizen-local"

    # Spindle vibration spike +35% to 2.45 mm/s, peak at 2.70 mm/s
    row = MockRow(
        min_vibration=1.58,
        max_vibration=2.70,
        avg_vibration=2.45,
        std_vibration=0.38,
        avg_temperature=42.5,
        avg_current=13.5,
        sample_count=12,
    )

    mock_query = MagicMock()
    mock_query.result.return_value = [row]
    mock_client.query.return_value = mock_query

    with patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client):
        response = query_sensor_telemetry_window(
            machine_id="CNC-02",
            start_time="2026-10-05T09:30:00Z",
            end_time="2026-10-05T10:00:00Z",
        )

        assert isinstance(response, SensorTelemetryWindowResponse)
        assert response.machine_id == "CNC-02"
        assert response.metrics.avg_vibration == 2.45
        assert response.metrics.max_vibration == 2.70
        assert response.anomaly_detected is True

        # Verify executed query contains timestamp boundaries
        executed_sql = mock_client.query.call_args[0][0]
        assert "machine_id = @machine_id" in executed_sql
        assert "timestamp >= @start_time" in executed_sql
        assert "timestamp <= @end_time" in executed_sql
        params = _query_params(mock_client.query.call_args)
        assert params["machine_id"] == "CNC-02"
        assert params["start_time"].isoformat() == "2026-10-05T09:30:00+00:00"


def test_query_sensor_telemetry_window_clock_bounds():
    """HH:MM start/end (as LLMs often pass) filter by time of day instead of invalid TIMESTAMP()."""
    mock_client = MagicMock()
    mock_client.project = "kaizen-local"
    mock_client.query.return_value.result.return_value = []

    with patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client):
        query_sensor_telemetry_window(machine_id="CNC-02", start_time="09:00", end_time="10:00")

    executed_sql = mock_client.query.call_args[0][0]
    assert "FORMAT_TIMESTAMP('%H:%M', timestamp) >= @start_time" in executed_sql
    assert "FORMAT_TIMESTAMP('%H:%M', timestamp) <= @end_time" in executed_sql
    assert _query_params(mock_client.query.call_args)["start_time"] == "09:00"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"start_time": "9h"},
        {"end_time": "2026-10-05T10:00:00Z' OR '1'='1"},
        {"time_window": "30 MINUTE); DROP TABLE sensor_telemetry; --"},
        {"time_window": "09:00-10:00' OR '1'='1"},
    ],
)
def test_query_sensor_telemetry_window_rejects_malformed_time(kwargs):
    """Malformed time arguments raise ValueError before any query is sent."""
    mock_client = MagicMock()
    with patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client):
        with pytest.raises(ValueError):
            query_sensor_telemetry_window(machine_id="CNC-02", **kwargs)
    mock_client.query.assert_not_called()


def test_query_sensor_telemetry_window_machine_id_is_bound_parameter():
    """machine_id never reaches the SQL text, so quotes cannot alter the query."""
    mock_client = MagicMock()
    mock_client.project = "kaizen-local"
    mock_client.query.return_value.result.return_value = []
    hostile = "CNC-02' OR '1'='1"

    with patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client):
        query_sensor_telemetry_window(machine_id=hostile, time_window="30 MINUTE")

    executed_sql = mock_client.query.call_args[0][0]
    assert hostile not in executed_sql
    params = _query_params(mock_client.query.call_args)
    assert params["machine_id"] == hostile
    assert params["window_count"] == 30
    assert "INTERVAL @window_count MINUTE" in executed_sql


def test_query_sensor_telemetry_window_failure_raises_runtime_error():
    """Test telemetry query failure raises RuntimeError."""
    mock_client = MagicMock()
    mock_client.project = "kaizen-local"
    mock_client.query.side_effect = Exception("BigQuery table not found")

    with patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client):
        with pytest.raises(RuntimeError, match="BigQuery query failed"):
            query_sensor_telemetry_window(machine_id="CNC-02")


def test_query_traceability_topology_mock_fallback():
    """Test client initialization failure falls back to mock traceability fixtures."""
    with patch(
        "backend.tools.bigquery_tool.get_bigquery_client",
        side_effect=RuntimeError("No BigQuery client available"),
    ):
        # Default with fallback enabled
        response = query_traceability_topology(time_window="09:30-10:00")
        assert response.source == "mock_fallback"
        assert len(response.suspects) >= 1
        assert response.suspects[0].machine_id == "CNC-02"
        assert response.suspects[0].tool_id == "T07"

        # With fallback disabled, it raises
        with patch("backend.tools.bigquery_tool.settings.bigquery_fallback_to_mock", False):
            with pytest.raises(RuntimeError, match="No BigQuery client available"):
                query_traceability_topology(time_window="09:30-10:00")


def test_query_sensor_telemetry_window_mock_fallback():
    """Test client initialization failure falls back to mock sensor telemetry fixtures."""
    with patch(
        "backend.tools.bigquery_tool.get_bigquery_client",
        side_effect=RuntimeError("No BigQuery client available"),
    ):
        response_anomaly = query_sensor_telemetry_window(machine_id="CNC-02")
        assert response_anomaly.source == "mock_fallback"
        assert response_anomaly.machine_id == "CNC-02"
        assert response_anomaly.anomaly_detected is True
        assert response_anomaly.metrics.max_vibration == 3.82

        response_normal = query_sensor_telemetry_window(machine_id="CNC-01")
        assert response_normal.anomaly_detected is False

        # With fallback disabled, it raises
        with patch("backend.tools.bigquery_tool.settings.bigquery_fallback_to_mock", False):
            with pytest.raises(RuntimeError, match="No BigQuery client available"):
                query_sensor_telemetry_window(machine_id="CNC-02")


def test_production_bigquery_failure_surfaces_instead_of_mock_topology():
    """APP_ENV=production disables the mock fallback by default: failures raise, no mock topology."""
    from backend.core.config import Settings

    production = Settings(app_env="production")
    assert production.bigquery_fallback_to_mock is False
    with (
        patch("backend.tools.bigquery_tool.settings", production),
        patch(
            "backend.tools.bigquery_tool.get_bigquery_client",
            side_effect=RuntimeError("No BigQuery client available"),
        ),
    ):
        with pytest.raises(RuntimeError, match="No BigQuery client available"):
            query_traceability_topology(time_window="09:30-10:00")
        with pytest.raises(RuntimeError, match="No BigQuery client available"):
            query_sensor_telemetry_window(machine_id="CNC-02")


# ---------------------------------------------------------------------------
# TKT-070 S10 — competition telemetry ingestion helper + distribution query
# ---------------------------------------------------------------------------


def test_load_competition_telemetry_happy_path_emulator():
    """``load_competition_telemetry`` INSERTs in 500-row batches and returns a typed summary."""
    from backend.core.models import BigQueryIngestionSummary
    from backend.tools.bigquery_tool import load_competition_telemetry

    mock_client = MagicMock()
    mock_client.project = "kaizen-local"
    mock_client.insert_rows_json.return_value = []

    with patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client):
        summary = load_competition_telemetry(client=mock_client)

    assert isinstance(summary, BigQueryIngestionSummary)
    assert summary.rows_loaded == 2000
    assert summary.target_table.endswith("manufacturing.competition_telemetry")

    competition_calls = [
        call
        for call in mock_client.insert_rows_json.call_args_list
        if call.args[0].endswith("competition_telemetry")
    ]
    # 2000 rows / 500 batch size = 4 batches.
    assert len(competition_calls) == 4
    assert all(len(call.args[1]) == 500 for call in competition_calls)


def test_load_competition_telemetry_local_csv_fallback_when_client_unavailable():
    """When BigQuery is unreachable and mock fallback is on, the helper still emits staging artefacts."""
    from backend.tools.bigquery_tool import load_competition_telemetry

    with patch(
        "backend.tools.bigquery_tool.get_bigquery_client",
        side_effect=RuntimeError("No BigQuery client available"),
    ):
        summary = load_competition_telemetry()

    # Mock fallback path returns ``None`` so the caller knows no
    # warehouse writes succeeded but the staging CSV + manifest are
    # still on disk for offline inspection.
    assert summary is None


def test_load_competition_telemetry_raises_when_fallback_disabled():
    """Without the mock fallback the helper surfaces the original BigQuery error."""
    from backend.tools.bigquery_tool import load_competition_telemetry

    with patch(
        "backend.tools.bigquery_tool.get_bigquery_client",
        side_effect=RuntimeError("No BigQuery client available"),
    ):
        with patch("backend.tools.bigquery_tool.settings.bigquery_fallback_to_mock", False):
            with pytest.raises(RuntimeError, match="No BigQuery client available"):
                load_competition_telemetry()


def test_load_competition_telemetry_dry_run_skips_inserts(tmp_path):
    """``dry_run=True`` parses CSVs and writes staging artefacts but never INSERTs."""
    from backend.tools.bigquery_tool import load_competition_telemetry

    mock_client = MagicMock()
    mock_client.project = "kaizen-local"

    summary = load_competition_telemetry(
        client=mock_client,
        dry_run=True,
        staging_csv=str(tmp_path / "staging.csv"),
        manifest_path=str(tmp_path / "manifest.json"),
    )
    assert summary is not None
    assert summary.dry_run is True
    assert summary.rows_loaded == 2000
    assert mock_client.insert_rows_json.call_count == 0
    assert (tmp_path / "staging.csv").exists()
    assert (tmp_path / "manifest.json").exists()


def test_query_competition_telemetry_distribution_returns_per_machine_shape():
    """``query_competition_telemetry_distribution`` aggregates by ``asset_machine_id``."""
    from backend.tools.bigquery_tool import query_competition_telemetry_distribution

    # The SQL is ``ORDER BY avg_anomaly_score DESC`` — the mock returns
    # rows in that pre-sorted order to mimic the live warehouse.
    rows_iter = [
        MockRow(
            asset_machine_id="MOTOR_ABNORMAL_0001",
            sample_count=400,
            avg_anomaly_score=0.78,
            max_anomaly_score=0.95,
            fault_count=400,
            fault_status_count=400,
        ),
        MockRow(
            asset_machine_id="MOTOR_NORMAL_0001",
            sample_count=600,
            avg_anomaly_score=0.05,
            max_anomaly_score=0.18,
            fault_count=0,
            fault_status_count=0,
        ),
    ]
    mock_client = MagicMock()
    mock_client.project = "kaizen-local"

    with (
        patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client),
        patch(
            "backend.tools.bigquery_tool._run_query",
            return_value=iter(rows_iter),
        ),
    ):
        result = query_competition_telemetry_distribution()

    assert result["source"] == "bigquery_live"
    assert result["sample_count"] == 1000
    assert len(result["machines"]) == 2
    # ``avg_anomaly_score DESC`` ordering: abnormal machine first.
    assert result["machines"][0]["asset_machine_id"] == "MOTOR_ABNORMAL_0001"
    assert result["machines"][0]["fault_count"] == 400


def test_query_competition_telemetry_distribution_empty_table_returns_empty_payload():
    """An empty warehouse (post-emulator, pre-seed) returns a defensive empty payload."""
    from backend.tools.bigquery_tool import query_competition_telemetry_distribution

    mock_client = MagicMock()
    mock_client.project = "kaizen-local"

    with (
        patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client),
        patch("backend.tools.bigquery_tool._run_query", return_value=iter([])),
    ):
        result = query_competition_telemetry_distribution()

    assert result["machines"] == []
    assert result["sample_count"] == 0


def test_query_competition_telemetry_distribution_mock_fallback_when_client_unavailable():
    """When BigQuery is unreachable and mock fallback is on, the helper returns ``mock_fallback``."""
    from backend.tools.bigquery_tool import query_competition_telemetry_distribution

    with patch(
        "backend.tools.bigquery_tool.get_bigquery_client",
        side_effect=RuntimeError("No BigQuery client available"),
    ):
        result = query_competition_telemetry_distribution()

    assert result["source"] == "mock_fallback"
    assert result["machines"] == []


def test_query_competition_telemetry_distribution_filters_by_machine_id():
    """Passing ``machine_id`` adds a ``WHERE`` clause; empty result is still a valid payload."""
    from backend.tools.bigquery_tool import query_competition_telemetry_distribution

    mock_client = MagicMock()
    mock_client.project = "kaizen-local"

    with (
        patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client),
        patch("backend.tools.bigquery_tool._run_query", return_value=iter([])) as mock_query,
    ):
        result = query_competition_telemetry_distribution(machine_id="MOTOR_NORMAL_0042")

    assert result["machine_id"] == "MOTOR_NORMAL_0042"
    assert result["machines"] == []
    # The WHERE clause was added to the SQL (machine_id filter).
    sql_arg = mock_query.call_args.args[1]
    assert "asset_machine_id = @machine_id" in sql_arg


def test_reset_buffers_reseeds_only_the_emulator(monkeypatch):
    """A demo reset must never append seed rows to a real (production) BigQuery project."""
    from backend.core.config import settings
    from backend.tools import bigquery_tool

    calls: list[bool] = []
    monkeypatch.setattr("scripts.seed_bigquery.seed_bigquery", lambda: calls.append(True))

    monkeypatch.setattr(settings, "bigquery_emulator_host", None)
    bigquery_tool.reset_buffers()
    assert calls == []

    monkeypatch.setattr(settings, "bigquery_emulator_host", "http://localhost:9050")
    bigquery_tool.reset_buffers()
    assert calls == [True]
