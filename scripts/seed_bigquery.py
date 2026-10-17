"""Standalone script to bootstrap and seed local BigQuery emulator tables for development."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import List, Optional

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.config import settings
from backend.core.models import BigQueryIngestionSummary
from backend.tools.bigquery_tool import get_bigquery_client
from data.competition_loader import (
    emit_staging_csv,
    summarize_ingestion,
    write_seed_manifest,
)
from data.competition_loader import (
    load_competition_csv as parse_competition_csv,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

SCHEMA_SQL_PATH = "data/schemas/bigquery_tables.sql"

# Default staging artefacts produced by ``load_competition_csv``. The CLI
# accepts overrides so CI can point at a tmpdir, but the defaults keep
# ``mise run seed`` predictable.
DEFAULT_STAGING_CSV = Path("data/datasets/competition_telemetry.csv")
DEFAULT_MANIFEST = Path("artifacts/BQ_seed_manifest.json")

# BigQuery ``insert_rows_json`` accepts up to 500 rows per call. We pick
# the documented ceiling so the emulator stays happy and the live
# BigQuery path stays under the per-request streaming limit.
BIGQUERY_INSERT_BATCH = 500

SEED_TRACEABILITY_ROWS = [
    {
        "product_id": "PRD-1001",
        "timestamp": "2026-10-05T09:20:00Z",
        "machine_id": "CNC-01",
        "tool_id": "T04",
        "lot_id": "AL-5083-B4",
        "operator_id": "OP-12",
        "status": "PASS",
    },
    {
        "product_id": "PRD-1002",
        "timestamp": "2026-10-05T09:25:00Z",
        "machine_id": "CNC-03",
        "tool_id": "T07",
        "lot_id": "AL-5083-B4",
        "operator_id": "OP-08",
        "status": "PASS",
    },
    {
        "product_id": "PRD-1003",
        "timestamp": "2026-10-05T09:35:00Z",
        "machine_id": "CNC-02",
        "tool_id": "T07",
        "lot_id": "AL-5083-B4",
        "operator_id": "OP-15",
        "status": "PASS",
    },
    {
        "product_id": "PRD-1004",
        "timestamp": "2026-10-05T09:40:00Z",
        "machine_id": "CNC-02",
        "tool_id": "T07",
        "lot_id": "AL-5083-B4",
        "operator_id": "OP-15",
        "status": "DEFECT_SCRATCH",
    },
    {
        "product_id": "PRD-1005",
        "timestamp": "2026-10-05T09:42:00Z",
        "machine_id": "CNC-02",
        "tool_id": "T07",
        "lot_id": "AL-5083-B4",
        "operator_id": "OP-15",
        "status": "DEFECT_SCRATCH",
    },
    {
        "product_id": "PRD-1006",
        "timestamp": "2026-10-05T09:44:00Z",
        "machine_id": "CNC-01",
        "tool_id": "T04",
        "lot_id": "AL-5083-B4",
        "operator_id": "OP-12",
        "status": "PASS",
    },
    {
        "product_id": "PRD-1007",
        "timestamp": "2026-10-05T09:45:00Z",
        "machine_id": "CNC-02",
        "tool_id": "T07",
        "lot_id": "AL-5083-B4",
        "operator_id": "OP-15",
        "status": "DEFECT_SCRATCH",
    },
    {
        "product_id": "PRD-1008",
        "timestamp": "2026-10-05T09:48:00Z",
        "machine_id": "CNC-01",
        "tool_id": "T04",
        "lot_id": "AL-5083-B4",
        "operator_id": "OP-12",
        "status": "PASS",
    },
    {
        "product_id": "PRD-1009",
        "timestamp": "2026-10-05T09:50:00Z",
        "machine_id": "CNC-03",
        "tool_id": "T07",
        "lot_id": "AL-5083-B4",
        "operator_id": "OP-08",
        "status": "PASS",
    },
    {
        "product_id": "PRD-1010",
        "timestamp": "2026-10-05T09:52:00Z",
        "machine_id": "CNC-02",
        "tool_id": "T07",
        "lot_id": "AL-5083-B4",
        "operator_id": "OP-15",
        "status": "DEFECT_SCRATCH",
    },
]

SEED_TELEMETRY_ROWS = [
    {
        "timestamp": "2026-10-05T09:15:00Z",
        "machine_id": "CNC-01",
        "vibration_mm_s": 1.45,
        "temperature_c": 39.8,
        "current_a": 11.9,
        "spindle_speed_rpm": 12000,
    },
    {
        "timestamp": "2026-10-05T09:30:00Z",
        "machine_id": "CNC-01",
        "vibration_mm_s": 1.48,
        "temperature_c": 40.0,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
    },
    {
        "timestamp": "2026-10-05T09:45:00Z",
        "machine_id": "CNC-01",
        "vibration_mm_s": 1.46,
        "temperature_c": 40.1,
        "current_a": 12.1,
        "spindle_speed_rpm": 12000,
    },
    {
        "timestamp": "2026-10-05T09:15:00Z",
        "machine_id": "CNC-03",
        "vibration_mm_s": 1.50,
        "temperature_c": 40.2,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
    },
    {
        "timestamp": "2026-10-05T09:30:00Z",
        "machine_id": "CNC-03",
        "vibration_mm_s": 1.52,
        "temperature_c": 40.4,
        "current_a": 12.2,
        "spindle_speed_rpm": 12000,
    },
    {
        "timestamp": "2026-10-05T09:45:00Z",
        "machine_id": "CNC-03",
        "vibration_mm_s": 1.49,
        "temperature_c": 40.1,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
    },
    {
        "timestamp": "2026-10-05T09:15:00Z",
        "machine_id": "CNC-02",
        "vibration_mm_s": 1.51,
        "temperature_c": 40.0,
        "current_a": 12.0,
        "spindle_speed_rpm": 12000,
    },
    {
        "timestamp": "2026-10-05T09:25:00Z",
        "machine_id": "CNC-02",
        "vibration_mm_s": 1.58,
        "temperature_c": 40.5,
        "current_a": 12.2,
        "spindle_speed_rpm": 12000,
    },
    {
        "timestamp": "2026-10-05T09:30:00Z",
        "machine_id": "CNC-02",
        "vibration_mm_s": 2.15,
        "temperature_c": 41.5,
        "current_a": 13.1,
        "spindle_speed_rpm": 12000,
    },
    {
        "timestamp": "2026-10-05T09:40:00Z",
        "machine_id": "CNC-02",
        "vibration_mm_s": 2.45,
        "temperature_c": 42.2,
        "current_a": 13.4,
        "spindle_speed_rpm": 12000,
    },
    {
        "timestamp": "2026-10-05T09:45:00Z",
        "machine_id": "CNC-02",
        "vibration_mm_s": 2.70,
        "temperature_c": 42.8,
        "current_a": 13.6,
        "spindle_speed_rpm": 12000,
    },
]


def seed_bigquery(
    *,
    dry_run: bool = False,
    staging_csv: Optional[Path] = None,
    manifest_path: Optional[Path] = None,
    client: Optional[object] = None,
) -> Optional[BigQueryIngestionSummary]:
    """Creates dataset, tables, and inserts initial development rows.

    When ``dry_run`` is true the function still parses the competition
    CSV, emits the staging CSV + manifest, but skips the BigQuery
    INSERT (and the legacy traceability / sensor_telemetry INSERTs) so
    a CI job can validate mapping + schema without a running emulator.
    Returns ``None`` on the dry-run path and a populated
    ``BigQueryIngestionSummary`` on the real path.

    ``client`` is an injection seam for tests: callers can pass a mock
    BigQuery client (with the same shape as ``google.cloud.bigquery.Client``)
    instead of relying on ``get_bigquery_client()``.
    """
    from google.api_core.exceptions import NotFound
    from google.cloud import bigquery

    dataset_id = f"{settings.gcp_project_id}.{settings.bigquery_dataset}"
    bq_client: Optional[object] = None
    if not dry_run:
        bq_client = client if client is not None else get_bigquery_client()
        dataset_id = f"{bq_client.project}.{settings.bigquery_dataset}"
        # The emulator answers a duplicate create with 500 (not 409), which the client retries
        # forever, so only create the dataset when it is actually missing.
        try:
            bq_client.get_dataset(dataset_id)
        except NotFound:
            dataset = bigquery.Dataset(dataset_id)
            dataset.location = settings.gcp_region
            bq_client.create_dataset(dataset)

        if os.path.exists(SCHEMA_SQL_PATH):
            with open(SCHEMA_SQL_PATH, encoding="utf-8") as f:
                # The DDL names the default `manufacturing` dataset; target the configured one.
                ddl = f.read().replace("`manufacturing.", f"`{settings.bigquery_dataset}.")
                for statement in ddl.split(";"):
                    stmt = statement.strip()
                    if stmt:
                        try:
                            bq_client.query(stmt).result()
                        except Exception as exc:
                            logger.debug("DDL note: %s", exc)

        traceability_ref = f"{dataset_id}.traceability"
        errs_traceability = bq_client.insert_rows_json(traceability_ref, SEED_TRACEABILITY_ROWS)
        if errs_traceability:
            logger.warning("Errors inserting traceability seed rows: %s", errs_traceability)
        else:
            logger.info(
                "Successfully seeded %d rows into %s",
                len(SEED_TRACEABILITY_ROWS),
                traceability_ref,
            )

        telemetry_ref = f"{dataset_id}.sensor_telemetry"
        errs_telemetry = bq_client.insert_rows_json(telemetry_ref, SEED_TELEMETRY_ROWS)
        if errs_telemetry:
            logger.warning("Errors inserting telemetry seed rows: %s", errs_telemetry)
        else:
            logger.info(
                "Successfully seeded %d rows into %s", len(SEED_TELEMETRY_ROWS), telemetry_ref
            )

    # TKT-070 S9 — competition CSV telemetry ingestion (idempotent re-seed).
    return load_competition_csv(
        client=bq_client,
        dataset_id=dataset_id,
        dry_run=dry_run,
        staging_csv=staging_csv,
        manifest_path=manifest_path,
    )


def load_competition_csv(
    *,
    client: object,
    dataset_id: str,
    dry_run: bool = False,
    staging_csv: Optional[Path] = None,
    manifest_path: Optional[Path] = None,
    batch_size: int = BIGQUERY_INSERT_BATCH,
) -> Optional[BigQueryIngestionSummary]:
    """Load the competition CSVs into ``manufacturing.competition_telemetry``.

    Returns ``None`` on the dry-run path (CSV parsed, staging artefacts
    emitted, no INSERTs) and a populated ``BigQueryIngestionSummary`` on
    the real path. The loader is idempotent: BigQuery's ``INSERT`` does
    not deduplicate by primary key, but the warehouse table has no
    natural primary key, so a re-run simply appends. The
    ``source_sha256`` recorded in the manifest lets a downstream auditor
    notice when the source CSV has changed between two re-runs.

    The function delegates parsing + validation to
    ``data.competition_loader.load_competition_csv()`` and writes the
    staging CSV + manifest via the same module's helpers, keeping the
    redaction map version stamped on every artefact.
    """
    rows, skipped, source_sha256s = _safe_load_competition_csv()
    target_table = f"{dataset_id}.competition_telemetry"
    composite_sha = _composite_source_sha(source_sha256s)

    staging_csv = staging_csv or DEFAULT_STAGING_CSV
    manifest_path = manifest_path or DEFAULT_MANIFEST

    summary = summarize_ingestion(
        rows_loaded=len(rows),
        rows_skipped=skipped,
        source_sha256=composite_sha,
        target_table=target_table,
        dry_run=dry_run,
    )

    # Always emit the staging CSV + manifest so a dry-run CI job can
    # validate them in-place.
    emit_staging_csv(rows, staging_csv)
    write_seed_manifest(manifest_path, summary=summary, source_sha256s=source_sha256s)

    if dry_run:
        logger.info(
            "Dry-run: would load %d rows into %s (skipped %d malformed)",
            summary.rows_loaded,
            target_table,
            summary.rows_skipped,
        )
        return None

    errs = _insert_in_batches(client, target_table, rows, batch_size=batch_size)
    if errs:
        logger.warning("Errors inserting competition_telemetry seed rows: %s", errs)
    else:
        logger.info(
            "Successfully seeded %d rows into %s (skipped %d malformed)",
            summary.rows_loaded,
            target_table,
            summary.rows_skipped,
        )
    return summary


def _safe_load_competition_csv() -> tuple[List[dict], int, dict[str, str]]:
    """Wrap ``parse_competition_csv`` to surface parse errors as ``RuntimeError``.

    The helper is split out so a future caller can swap in a fixture
    without re-implementing the try/except ladder.
    """
    try:
        return parse_competition_csv()
    except FileNotFoundError as exc:
        raise RuntimeError(
            "Competition CSV missing — restore the dataset or re-run mise run drive:pull"
        ) from exc


def _composite_source_sha(source_sha256s: dict[str, str]) -> str:
    """Combine per-source SHAs into one stable hex digest for the manifest.

    Order-independent so a re-run that processes CSVs in a different
    order still hashes to the same composite. SHA-256 of the joined
    sorted ``tag:sha\n`` lines.
    """
    import hashlib

    joined = "\n".join(f"{tag}:{sha}" for tag, sha in sorted(source_sha256s.items()))
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def _insert_in_batches(
    client: object,
    table_ref: str,
    rows: List[dict],
    *,
    batch_size: int = BIGQUERY_INSERT_BATCH,
) -> list:
    """Insert ``rows`` into ``table_ref`` in chunks of ``batch_size``.

    BigQuery's ``insert_rows_json`` accepts up to 500 rows per call.
    Empty batches are skipped, and the returned error list is the
    concatenation of every batch's errors so the caller can log them.
    """
    errors: list = []
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        if not batch:
            continue
        batch_errors = client.insert_rows_json(table_ref, batch)
        if batch_errors:
            errors.extend(batch_errors)
    return errors


def _parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    """Parse CLI arguments. Split out so tests can drive it directly."""
    parser = argparse.ArgumentParser(description="Seed BigQuery emulator tables for development")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse CSVs and emit staging artefacts without INSERTing into BigQuery.",
    )
    parser.add_argument(
        "--staging-csv",
        type=Path,
        default=None,
        help="Override the default staging CSV output path (data/datasets/competition_telemetry.csv).",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=None,
        help="Override the default seed manifest output path (artifacts/BQ_seed_manifest.json).",
    )
    return parser.parse_args(argv)


def _main(argv: Optional[List[str]] = None) -> int:
    args = _parse_args(argv)
    summary = seed_bigquery(
        dry_run=args.dry_run,
        staging_csv=args.staging_csv,
        manifest_path=args.manifest,
    )
    if args.dry_run or summary is None:
        logger.info("Dry-run complete; no BigQuery writes performed.")
    else:
        # Print the summary as a single JSON line so CI can grep it.
        logger.info(
            "Seed summary: %s",
            json.dumps(summary.model_dump(), separators=(",", ":")),
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
