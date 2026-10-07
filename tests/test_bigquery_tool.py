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
    seed_mock_data,
)


class MockRow:
    """Helper representing a BigQuery Row object with attribute access."""

    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


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
        assert "product_id IN ('PRD-1004', 'PRD-1005')" in executed_sql
        assert "timestamp >= TIMESTAMP('2026-10-05T09:30:00Z')" in executed_sql
        assert "timestamp <= TIMESTAMP('2026-10-05T10:00:00Z')" in executed_sql


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
        assert "machine_id = 'CNC-02'" in executed_sql
        assert "timestamp >= TIMESTAMP('2026-10-05T09:30:00Z')" in executed_sql
        assert "timestamp <= TIMESTAMP('2026-10-05T10:00:00Z')" in executed_sql


def test_query_sensor_telemetry_window_failure_raises_runtime_error():
    """Test telemetry query failure raises RuntimeError."""
    mock_client = MagicMock()
    mock_client.project = "kaizen-local"
    mock_client.query.side_effect = Exception("BigQuery table not found")

    with patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client):
        with pytest.raises(RuntimeError, match="BigQuery query failed"):
            query_sensor_telemetry_window(machine_id="CNC-02")


def test_sync_seed_to_bigquery():
    """Test seeding records into BigQuery dataset creates tables and inserts rows."""
    mock_client = MagicMock()
    mock_client.project = "kaizen-local"
    mock_client.insert_rows_json.return_value = []  # No errors

    with (
        patch("os.path.exists", return_value=True),
        patch("builtins.open", MagicMock()),
        patch("backend.tools.bigquery_tool.get_bigquery_client", return_value=mock_client),
    ):
        seed_mock_data()

        mock_client.create_dataset.assert_called_once()
        assert mock_client.insert_rows_json.call_count == 2
