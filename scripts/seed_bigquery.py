"""Standalone script to bootstrap and seed local BigQuery emulator tables for development."""

from __future__ import annotations

import logging
import os
import sys

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.config import settings
from backend.tools.bigquery_tool import get_bigquery_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

SCHEMA_SQL_PATH = "data/schemas/bigquery_tables.sql"

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


def seed_bigquery() -> None:
    """Creates dataset, tables, and inserts initial development rows."""
    from google.cloud import bigquery

    client = get_bigquery_client()
    dataset_id = f"{client.project}.{settings.bigquery_dataset}"
    dataset = bigquery.Dataset(dataset_id)
    dataset.location = settings.gcp_region
    client.create_dataset(dataset, exists_ok=True)

    if os.path.exists(SCHEMA_SQL_PATH):
        with open(SCHEMA_SQL_PATH, encoding="utf-8") as f:
            ddl = f.read()
            for statement in ddl.split(";"):
                stmt = statement.strip()
                if stmt:
                    try:
                        client.query(stmt).result()
                    except Exception as exc:
                        logger.debug("DDL note: %s", exc)

    traceability_ref = f"{dataset_id}.traceability"
    errs_traceability = client.insert_rows_json(traceability_ref, SEED_TRACEABILITY_ROWS)
    if errs_traceability:
        logger.warning("Errors inserting traceability seed rows: %s", errs_traceability)
    else:
        logger.info(
            "Successfully seeded %d rows into %s", len(SEED_TRACEABILITY_ROWS), traceability_ref
        )

    telemetry_ref = f"{dataset_id}.sensor_telemetry"
    errs_telemetry = client.insert_rows_json(telemetry_ref, SEED_TELEMETRY_ROWS)
    if errs_telemetry:
        logger.warning("Errors inserting telemetry seed rows: %s", errs_telemetry)
    else:
        logger.info("Successfully seeded %d rows into %s", len(SEED_TELEMETRY_ROWS), telemetry_ref)


if __name__ == "__main__":
    seed_bigquery()
