"""BigQuery schema allowlist guard (issue #266).

The previous BigQuery access layer validated SQL only at runtime inside the
emulator / live client. A typo (e.g. ``FROM manufacturing.traceablility``)
or a regression in column naming surfaced as confusing emulator errors
instead of a clear ``ValueError`` at the call site. Issue #266 introduces a
YAML-driven allowlist that validates every query / streaming insert against
``data/schemas/bigquery/<table>.yaml`` BEFORE the client is invoked.

Coverage:
- ``dataset unknown`` -> ``_assert_query_safe`` rejects queries that
  reference a `dataset.table` not declared in the allowlist YAMLs.
- ``_PARTITIONTIME forbidden`` -> the legacy streaming-buffer pseudo-column
  is rejected explicitly; ``_PARTITIONDATE`` remains accepted so existing
  partition pruning rewrites keep working.
- ``column 'spindle_vibration' not in sensor_telemetry`` -> inserts / queries
  referencing columns not declared in the YAML are rejected; the canonical
  example is the legacy ``spindle_vibration`` alias that the column was
  renamed to ``vibration_mm_s`` from; today no production path emits it,
  but a regression in the row builder would now fail loudly.
"""

from __future__ import annotations

import pytest

from backend.tools import bigquery_tool


def _reset_allowlist() -> None:
    """Force the lazy allowlist loader to re-read YAML between tests."""
    bigquery_tool._ALLOWLIST_LOADED = False  # noqa: SLF001
    bigquery_tool._SCHEMA_ALLOWLIST.clear()  # noqa: SLF001


@pytest.fixture(autouse=True)
def _reload_allowlist():
    _reset_allowlist()
    yield
    _reset_allowlist()


def test_dataset_unknown_is_rejected_before_client():
    """``FROM <unknown_dataset>.<unknown_table>``` raises ValueError."""
    sql = """
        SELECT asset_machine_id FROM `manufacturing.unknown_table`
        WHERE asset_machine_id = 'CNC-99'
    """
    with pytest.raises(ValueError, match="unknown table"):
        bigquery_tool._assert_query_safe(
            sql,
            default_dataset_id="manufacturing",
        )


def test_partitiontime_is_forbidden_even_with_known_table():
    """Legacy _PARTITIONTIME pseudo-column raises ValueError."""
    sql = """
        SELECT product_id FROM `manufacturing.traceability`
        WHERE _PARTITIONTIME = TIMESTAMP('2026-10-01')
    """
    with pytest.raises(ValueError, match="_PARTITIONTIME"):
        bigquery_tool._assert_query_safe(
            sql,
            default_dataset_id="manufacturing",
        )


def test_partitiondate_is_accepted_for_partition_pruning():
    """``_PARTITIONDATE`` remains allowed for the modern sharded column."""
    sql = """
        SELECT product_id FROM `manufacturing.traceability`
        WHERE _PARTITIONDATE = '2026-10-01'
    """
    # Should not raise; the assertion path accepts _PARTITIONDATE because
    # it is in traceability.yaml `allowed_pseudo_columns`.
    bigquery_tool._assert_query_safe(
        sql,
        default_dataset_id="manufacturing",
    )


def test_unknown_column_in_known_table_is_rejected():
    """``spindle_vibration`` is not a column in sensor_telemetry (vibration_mm_s is).

    The brief calls this out by name: a regression in the row builder that
    references the pre-rename column must fail loudly instead of silently
    returning nulls from the warehouse.
    """
    sql = """
        SELECT spindle_vibration FROM `manufacturing.sensor_telemetry`
        WHERE machine_id = 'CNC-02'
    """
    with pytest.raises(ValueError, match="spindle_vibration"):
        bigquery_tool._assert_query_safe(
            sql,
            default_dataset_id="manufacturing",
        )


def test_known_columns_and_functions_pass_allowlist():
    """A canonical query against sensor_telemetry passes the guard."""
    sql = """
        SELECT
            machine_id,
            AVG(vibration_mm_s) as avg_vibration,
            AVG(temperature_c) as avg_temperature,
            COUNT(*) as sample_count
        FROM `manufacturing.sensor_telemetry`
        WHERE machine_id = @machine_id AND timestamp > @start
        GROUP BY machine_id
        ORDER BY avg_vibration DESC
        LIMIT 100
    """
    bigquery_tool._assert_query_safe(sql, default_dataset_id="manufacturing")


def test_validate_insert_payload_rejects_unknown_key():
    """A row dict with an unknown key for traceability fails BEFORE insert."""
    row = {
        "product_id": "PART-1",
        "timestamp": "2026-10-01T00:00:00Z",
        "machine_id": "CNC-01",
        "tool_id": "T01",
        "lot_id": "L-1",
        "operator_id": "OP-1",
        "status": "PASS",
        "phantom_column": "boom",
    }
    with pytest.raises(ValueError, match="phantom_column"):
        bigquery_tool._validate_insert_payload(
            "manufacturing.traceability", row
        )


def test_validate_insert_payload_accepts_declared_keys():
    """Happy-path row against traceability passes."""
    row = {
        "product_id": "PART-1",
        "timestamp": "2026-10-01T00:00:00Z",
        "machine_id": "CNC-01",
        "tool_id": "T01",
        "lot_id": "L-1",
        "operator_id": "OP-1",
        "status": "PASS",
    }
    bigquery_tool._validate_insert_payload("manufacturing.traceability", row)


def test_validate_insert_payload_unknown_table_fails_closed():
    """An unknown insert target is rejected with a directive message."""
    with pytest.raises(ValueError, match="not in schema allowlist"):
        bigquery_tool._validate_insert_payload("manufacturing.ghost_table", {})


def test_validate_insert_payload_uses_configured_dataset(monkeypatch):
    """Cloud Run's dataset (kaizen_manufacturing) must accept the same tables as the DDL one."""
    monkeypatch.setattr(bigquery_tool.settings, "bigquery_dataset", "kaizen_manufacturing")
    row = {
        "timestamp": "2026-10-18T05:00:00Z",
        "machine_id": "CNC-01",
        "vibration_mm_s": 1.4,
        "temperature_c": 40.0,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
    }
    bigquery_tool._validate_insert_payload("kaizen_manufacturing.sensor_telemetry", row)
    with pytest.raises(ValueError, match="not in schema allowlist"):
        bigquery_tool._validate_insert_payload("manufacturing.sensor_telemetry", row)


def test_competition_telemetry_known_columns_pass():
    """All declared competition_telemetry columns are accepted."""
    sql = """
        SELECT asset_machine_id, AVG(health_anomaly_score) AS s
        FROM `manufacturing.competition_telemetry`
        GROUP BY asset_machine_id
        ORDER BY s DESC
    """
    bigquery_tool._assert_query_safe(sql, default_dataset_id="manufacturing")
