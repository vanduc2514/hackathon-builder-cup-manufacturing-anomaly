"""ADK Tool: Executes queries against BigQuery (or bigquery-emulator) for traceability and sensor telemetry."""

from __future__ import annotations

import csv
import logging
import os
from typing import Any, Dict, List, Optional

from backend.core.config import settings

logger = logging.getLogger(__name__)

MOCK_TRACEABILITY_PATH = "data/datasets/mock_traceability.csv"
SCHEMA_SQL_PATH = "data/schemas/bigquery_tables.sql"

SEED_ROWS = [
    ["product_id", "timestamp", "machine_id", "tool_id", "lot_id", "operator_id", "status"],
    ["PRD-1001", "2026-10-05T09:20:00", "CNC-01", "T04", "AL-5083-B4", "OP-12", "PASS"],
    ["PRD-1002", "2026-10-05T09:25:00", "CNC-03", "T07", "AL-5083-B4", "OP-08", "PASS"],
    ["PRD-1003", "2026-10-05T09:35:00", "CNC-02", "T07", "AL-5083-B4", "OP-15", "PASS"],
    ["PRD-1004", "2026-10-05T09:40:00", "CNC-02", "T07", "AL-5083-B4", "OP-15", "DEFECT_SCRATCH"],
    ["PRD-1005", "2026-10-05T09:42:00", "CNC-02", "T07", "AL-5083-B4", "OP-15", "DEFECT_SCRATCH"],
    ["PRD-1006", "2026-10-05T09:44:00", "CNC-01", "T04", "AL-5083-B4", "OP-12", "PASS"],
    ["PRD-1007", "2026-10-05T09:45:00", "CNC-02", "T07", "AL-5083-B4", "OP-15", "DEFECT_SCRATCH"],
]


def get_bigquery_client() -> Optional[Any]:
    """Returns a BigQuery client targeting the emulator or GCP, or None if unavailable."""
    emulator_host = settings.bigquery_emulator_host or os.getenv("BIGQUERY_EMULATOR_HOST")

    try:
        from google.auth.credentials import AnonymousCredentials
        from google.cloud import bigquery

        if emulator_host:
            logger.info("Connecting to BigQuery Emulator at %s", emulator_host)
            endpoint = emulator_host if "://" in emulator_host else f"http://{emulator_host}"
            return bigquery.Client(
                project=settings.gcp_project_id,
                credentials=AnonymousCredentials(),
                client_options={"api_endpoint": endpoint},
            )

        if os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or os.getenv("GCP_PROJECT_ID"):
            return bigquery.Client(project=settings.gcp_project_id)

    except Exception as exc:
        logger.debug("BigQuery client initialization bypassed (%s); using in-memory mock", exc)

    return None


def seed_mock_data() -> None:
    """Generates mock traceability CSV and syncs to BigQuery/Emulator if connected."""
    os.makedirs(os.path.dirname(MOCK_TRACEABILITY_PATH), exist_ok=True)
    with open(MOCK_TRACEABILITY_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(SEED_ROWS)
    logger.info("Seeded mock traceability data at: %s", MOCK_TRACEABILITY_PATH)

    client = get_bigquery_client()
    if client:
        try:
            _sync_seed_to_bigquery(client)
        except Exception as exc:
            logger.warning("Could not sync seed data to BigQuery/Emulator: %s", exc)


def _sync_seed_to_bigquery(client: Any) -> None:
    """Creates dataset and table in BigQuery/Emulator and loads seed records."""
    from google.cloud import bigquery

    dataset_id = f"{client.project}.{settings.bigquery_dataset}"
    dataset = bigquery.Dataset(dataset_id)
    dataset.location = settings.gcp_region
    client.create_dataset(dataset, exists_ok=True)

    # Initialize schema DDL if file is available
    if os.path.exists(SCHEMA_SQL_PATH):
        with open(SCHEMA_SQL_PATH, encoding="utf-8") as f:
            ddl = f.read()
            for statement in ddl.split(";"):
                stmt = statement.strip()
                if stmt:
                    try:
                        client.query(stmt).result()
                    except Exception as exc:
                        logger.debug("DDL execution note: %s", exc)

    table_ref = f"{dataset_id}.traceability"
    rows_to_insert = [
        {
            "product_id": r[0],
            "timestamp": f"{r[1]}Z",
            "machine_id": r[2],
            "tool_id": r[3],
            "lot_id": r[4],
            "operator_id": r[5],
            "status": r[6],
        }
        for r in SEED_ROWS[1:]
    ]
    errors = client.insert_rows_json(table_ref, rows_to_insert)
    if errors:
        logger.warning("Errors inserting seed rows into BigQuery: %s", errors)
    else:
        logger.info(
            "Successfully seeded %d rows into BigQuery/Emulator table %s",
            len(rows_to_insert),
            table_ref,
        )


def query_traceability_topology(time_window: str = "09:30-10:00") -> Dict[str, Any]:
    """Queries discrete topology diff from BigQuery / Emulator, with graceful mock fallback."""
    client = get_bigquery_client()

    if client:
        try:
            dataset_id = f"{client.project}.{settings.bigquery_dataset}"
            query = f"""
                SELECT
                    machine_id,
                    tool_id,
                    COUNTIF(status LIKE 'DEFECT%') as defect_count,
                    COUNT(*) as total_parts,
                    SAFE_DIVIDE(COUNTIF(status LIKE 'DEFECT%'), COUNT(*)) as defect_ratio
                FROM `{dataset_id}.traceability`
                GROUP BY machine_id, tool_id
                ORDER BY defect_ratio DESC, defect_count DESC
            """
            results = client.query(query).result()
            suspects: List[Dict[str, Any]] = []
            for row in results:
                ratio = float(row.defect_ratio or 0.0)
                suspects.append(
                    {
                        "machine_id": row.machine_id,
                        "tool_id": row.tool_id,
                        "correlation_score": round(ratio, 2),
                        "defect_count": row.defect_count,
                        "total_parts": row.total_parts,
                    }
                )

            if suspects:
                return {
                    "source": "bigquery_emulator"
                    if settings.bigquery_emulator_host
                    else "bigquery_live",
                    "suspects": suspects,
                    "excluded_factors": [
                        "lot_id: AL-5083-B4 (normal defect distribution across lots)"
                    ],
                }
        except Exception as exc:
            logger.warning("BigQuery query failed (%s); falling back to mock topology", exc)

    # In-memory mock fallback (Key Invariant 4: Mock data must always work)
    return {
        "source": "mock_fallback",
        "suspects": [
            {"machine_id": "CNC-02", "tool_id": "T07", "correlation_score": 0.95},
            {"machine_id": "CNC-01", "tool_id": "T04", "correlation_score": 0.02},
            {"machine_id": "CNC-03", "tool_id": "T07", "correlation_score": 0.01},
        ],
        "excluded_factors": ["lot_id: AL-5083-B4 (normal on CNC-01/03)"],
    }


def query_sensor_telemetry(machine_id: str, time_window: str = "30 MINUTE") -> Dict[str, Any]:
    """Queries high-frequency sensor streams from BigQuery / Emulator, with mock fallback."""
    client = get_bigquery_client()

    if client:
        try:
            dataset_id = f"{client.project}.{settings.bigquery_dataset}"
            query = f"""
                SELECT
                    AVG(vibration_mm_s) as avg_vibration,
                    MAX(vibration_mm_s) as max_vibration,
                    AVG(temperature_c) as avg_temperature,
                    AVG(current_a) as avg_current
                FROM `{dataset_id}.sensor_telemetry`
                WHERE machine_id = @machine_id
                # Note: simplified for emulator/mock compatibility, real query would use timestamp
            """
            job_config = client.query_job_config.__class__(
                query_parameters=[
                    client.query_job_config.__class__.module.ScalarQueryParameter("machine_id", "STRING", machine_id)
                ]
            ) if hasattr(client, "query_job_config") else None
            # Doing a simpler string format to avoid SDK issues across mock/emulator
            query = f"""
                SELECT
                    AVG(vibration_mm_s) as avg_vibration,
                    MAX(vibration_mm_s) as max_vibration,
                    AVG(temperature_c) as avg_temperature,
                    AVG(current_a) as avg_current
                FROM `{dataset_id}.sensor_telemetry`
                WHERE machine_id = '{machine_id}'
            """
            
            results = client.query(query).result()
            row = next(iter(results), None)
            
            if row and row.avg_vibration is not None:
                return {
                    "source": "bigquery_emulator" if settings.bigquery_emulator_host else "bigquery_live",
                    "machine_id": machine_id,
                    "metrics": {
                        "avg_vibration": float(row.avg_vibration),
                        "max_vibration": float(row.max_vibration),
                        "avg_temperature": float(row.avg_temperature),
                        "avg_current": float(row.avg_current)
                    }
                }
        except Exception as exc:
            logger.warning("BigQuery telemetry query failed (%s); falling back to mock", exc)

    # In-memory mock fallback
    return {
        "source": "mock_fallback",
        "machine_id": machine_id,
        "metrics": {
            "avg_vibration": 2.1,
            "max_vibration": 35.5,  # Indicates a spike (+35% from baseline)
            "avg_temperature": 42.0,
            "avg_current": 18.2
        },
        "baseline": {
            "vibration": 1.5,
            "temperature": 40.0,
            "current": 16.0
        }
    }

