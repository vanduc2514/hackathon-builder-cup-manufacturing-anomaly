"""Unit tests for the competition CSV loader + seed CLI (TKT-070 S9)."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from backend.core.models import BigQueryIngestionSummary
from data.competition_loader import (
    COMPETITION_SCHEMA_VERSION,
    CompetitionSource,
    emit_staging_csv,
    load_competition_csv,
    summarize_ingestion,
    write_seed_manifest,
)

# ---------------------------------------------------------------------------
# Pure-Python loader tests (no BigQuery, no GCP)
# ---------------------------------------------------------------------------


def test_load_competition_csv_default_sources_returns_2000_rows():
    """End-to-end: every row in both source CSVs validates against ``CompetitionTelemetryPayload``."""
    rows, skipped, sha_map = load_competition_csv()

    assert skipped == 0
    assert len(rows) == 2000  # 1000 normal + 1000 abnormal
    assert set(sha_map.keys()) == {"normal", "abnormal"}
    # Every row has the deterministic asset context the loader assigns.
    factories = {row["asset_factory_id"] for row in rows}
    assert factories == {"FACTORY_NORMAL", "FACTORY_FAULT"}
    # The placeholder machine IDs include a tag (NORMAL / ABNORMAL).
    machine_ids = {row["asset_machine_id"] for row in rows}
    assert any(mid.startswith("MOTOR_NORMAL_") for mid in machine_ids)
    assert any(mid.startswith("MOTOR_ABNORMAL_") for mid in machine_ids)


def test_load_competition_csv_is_deterministic_across_runs():
    """Two consecutive runs over the same CSVs produce identical rows."""
    first_rows, first_skipped, first_sha = load_competition_csv()
    second_rows, second_skipped, second_sha = load_competition_csv()

    assert first_skipped == second_skipped == 0
    assert first_sha == second_sha
    # Compare field-by-field (dicts compare equal key-by-key + value-by-value).
    assert first_rows == second_rows


def test_load_competition_csv_distributes_status_across_both_factories():
    """Normal file contributes only RUNNING rows; abnormal only FAULT."""
    rows, _, _ = load_competition_csv()

    normal_rows = [r for r in rows if r["asset_factory_id"] == "FACTORY_NORMAL"]
    fault_rows = [r for r in rows if r["asset_factory_id"] == "FACTORY_FAULT"]

    assert {r["operating_status"] for r in normal_rows} == {"RUNNING"}
    assert {r["operating_status"] for r in fault_rows} == {"FAULT"}


def test_load_competition_csv_alarm_code_mapping():
    """Normal rows have ``alarm_code is None``; fault rows have a populated int."""
    rows, _, _ = load_competition_csv()
    normal_alarms = [r["alarm_code"] for r in rows if r["asset_factory_id"] == "FACTORY_NORMAL"]
    fault_alarms = [r["alarm_code"] for r in rows if r["asset_factory_id"] == "FACTORY_FAULT"]

    assert all(alarm is None for alarm in normal_alarms), "baseline rows must skip alarm_code"
    assert all(isinstance(alarm, int) and alarm > 0 for alarm in fault_alarms)


def test_load_competition_csv_raises_when_source_missing(tmp_path):
    """Missing CSV surfaces a clear ``FileNotFoundError`` so the CLI can convert it."""
    missing = CompetitionSource(
        csv_path=tmp_path / "absent.csv",
        asset_factory_id="FACTORY_X",
        asset_line_id="LINE_X",
    )
    with pytest.raises(FileNotFoundError, match="missing"):
        load_competition_csv(sources=(missing,))


def test_load_competition_csv_skips_malformed_rows(tmp_path):
    """Rows that violate ``CompetitionTelemetryPayload`` are skipped, not aborted."""
    # Build a minimal CSV with one valid row and one row that breaks the
    # Literal["RUNNING","FAULT"] whitelist via an unknown status.
    csv_path = tmp_path / "bad.csv"
    csv_path.write_text(
        "timestamp,speed,temperature,load_percent,current_percent,torque_percent,"
        "overload_percent,position_error,feedback_error,vibration,fan_status,"
        "alarm_code,warning_code,operating_status\n"
        "2026-10-01 09:00:00,1500,60,50,50,50,50,1,0.5,1.0,TRUE,,,RUNNING\n"
        "2026-10-01 09:00:01,1500,60,50,50,50,50,1,0.5,1.0,TRUE,,,IDLE\n",
        encoding="utf-8",
    )
    src = CompetitionSource(
        csv_path=csv_path,
        asset_factory_id="FACTORY_X",
        asset_line_id="LINE_X",
    )
    rows, skipped, _ = load_competition_csv(sources=(src,))
    assert len(rows) == 1
    assert skipped == 1


# ---------------------------------------------------------------------------
# Summarise + manifest helpers
# ---------------------------------------------------------------------------


def test_summarize_ingestion_stamps_both_versions():
    """``summarize_ingestion`` stamps ``COMPETITION_SCHEMA_VERSION`` and ``REDACTION_VERSION``."""
    summary = summarize_ingestion(
        rows_loaded=10,
        rows_skipped=2,
        source_sha256="abc123",
        target_table="kaizen-local.manufacturing.competition_telemetry",
        dry_run=False,
    )
    assert isinstance(summary, BigQueryIngestionSummary)
    assert summary.schema_version == COMPETITION_SCHEMA_VERSION
    assert summary.redactor_version == "2026-10-18.v1"
    assert summary.rows_loaded == 10
    assert summary.rows_skipped == 2
    assert summary.dry_run is False


def test_emit_staging_csv_round_trip(tmp_path):
    """Staging CSV is writable + has the same columns as the warehouse schema."""
    rows, _, _ = load_competition_csv()
    output = tmp_path / "staging.csv"
    emit_staging_csv(rows, output)
    assert output.exists()
    # Re-parse to confirm the writer preserved the row count and headers.
    import csv as _csv

    with output.open("r", encoding="utf-8", newline="") as fh:
        reader = _csv.DictReader(fh)
        reparsed = list(reader)
    assert len(reparsed) == len(rows)
    assert set(reparsed[0].keys()) == set(rows[0].keys())


def test_write_seed_manifest_round_trip(tmp_path):
    """Manifest is JSON, contains the summary + per-file SHA-256s."""
    summary = summarize_ingestion(
        rows_loaded=2000,
        rows_skipped=0,
        source_sha256="composite",
        target_table="kaizen-local.manufacturing.competition_telemetry",
    )
    source_sha = {"normal": "a", "abnormal": "b"}
    manifest_path = tmp_path / "BQ_seed_manifest.json"
    write_seed_manifest(manifest_path, summary=summary, source_sha256s=source_sha)

    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert payload["summary"]["rows_loaded"] == 2000
    assert payload["summary"]["schema_version"] == COMPETITION_SCHEMA_VERSION
    assert {f["tag"] for f in payload["source_files"]} == {"normal", "abnormal"}


# ---------------------------------------------------------------------------
# CLI / orchestrator integration with a mocked BigQuery client
# ---------------------------------------------------------------------------


def _mock_bq_client() -> MagicMock:
    client = MagicMock()
    client.project = "kaizen-local"
    # ``insert_rows_json`` returns an empty list to signal "all rows accepted".
    client.insert_rows_json.return_value = []
    return client


def test_seed_bigquery_loads_competition_into_warehouse(tmp_path):
    """``seed_bigquery`` calls the loader and INSERTs into ``competition_telemetry``."""
    from scripts.seed_bigquery import seed_bigquery as cli_seed

    mock_client = _mock_bq_client()
    staging = tmp_path / "staging.csv"
    manifest = tmp_path / "manifest.json"

    with patch("scripts.seed_bigquery.get_bigquery_client", return_value=mock_client):
        summary = cli_seed(
            dry_run=False,
            staging_csv=staging,
            manifest_path=manifest,
            client=mock_client,
        )

    assert isinstance(summary, BigQueryIngestionSummary)
    assert summary.rows_loaded == 2000
    assert summary.target_table.endswith(".competition_telemetry")
    # ``insert_rows_json`` was called at least once with the competition table.
    table_refs = [call.args[0] for call in mock_client.insert_rows_json.call_args_list]
    assert any(ref.endswith("competition_telemetry") for ref in table_refs)
    # The loader splits 2000 rows into 500-row batches ⇒ 4 INSERTs per source.
    competition_calls = [
        call for call in mock_client.insert_rows_json.call_args_list
        if call.args[0].endswith("competition_telemetry")
    ]
    assert len(competition_calls) == 4
    assert all(len(call.args[1]) == 500 for call in competition_calls)


def test_seed_bigquery_dry_run_skips_inserts(tmp_path):
    """``--dry-run`` parses CSVs but never calls ``insert_rows_json`` for competition."""
    from scripts.seed_bigquery import seed_bigquery as cli_seed

    mock_client = _mock_bq_client()
    staging = tmp_path / "staging.csv"
    manifest = tmp_path / "manifest.json"

    with patch("scripts.seed_bigquery.get_bigquery_client", return_value=mock_client):
        summary = cli_seed(
            dry_run=True,
            staging_csv=staging,
            manifest_path=manifest,
            client=mock_client,
        )

    assert summary is None
    # No competition INSERTs were issued, but the staging CSV + manifest
    # are still written so a CI job can validate the schema mapping.
    competition_calls = [
        call for call in mock_client.insert_rows_json.call_args_list
        if call.args[0].endswith("competition_telemetry")
    ]
    assert competition_calls == []
    assert staging.exists()
    assert manifest.exists()


def _count_result(n: int) -> MagicMock:
    job = MagicMock()
    job.result.return_value = [{"n": n}]
    return job


def test_seed_competition_only_skips_legacy_rows_and_loads_empty_table(tmp_path):
    """``competition_only`` loads competition rows but never the legacy seed tables."""
    from scripts.seed_bigquery import seed_bigquery as cli_seed

    mock_client = _mock_bq_client()
    mock_client.query.return_value = _count_result(0)

    summary = cli_seed(
        staging_csv=tmp_path / "staging.csv",
        manifest_path=tmp_path / "manifest.json",
        client=mock_client,
        competition_only=True,
    )

    assert summary is not None and summary.rows_loaded == 2000
    table_refs = {call.args[0] for call in mock_client.insert_rows_json.call_args_list}
    assert all(ref.endswith("competition_telemetry") for ref in table_refs)


def test_seed_competition_only_does_not_duplicate_loaded_table(tmp_path):
    """A re-run against an already loaded table inserts nothing."""
    from scripts.seed_bigquery import seed_bigquery as cli_seed

    mock_client = _mock_bq_client()
    mock_client.query.return_value = _count_result(2000)

    summary = cli_seed(
        staging_csv=tmp_path / "staging.csv",
        manifest_path=tmp_path / "manifest.json",
        client=mock_client,
        competition_only=True,
    )

    assert summary is None
    mock_client.insert_rows_json.assert_not_called()


def test_load_competition_csv_idempotent_on_re_run(tmp_path):
    """Re-running the loader produces the same row count + sha256."""
    from scripts.seed_bigquery import seed_bigquery as cli_seed

    mock_client = _mock_bq_client()
    staging = tmp_path / "staging.csv"
    manifest = tmp_path / "manifest.json"

    with patch("scripts.seed_bigquery.get_bigquery_client", return_value=mock_client):
        first = cli_seed(
            dry_run=False,
            staging_csv=staging,
            manifest_path=manifest,
            client=mock_client,
        )
        second = cli_seed(
            dry_run=False,
            staging_csv=staging,
            manifest_path=manifest,
            client=mock_client,
        )

    assert first is not None and second is not None
    assert first.rows_loaded == second.rows_loaded == 2000
    assert first.source_sha256 == second.source_sha256
