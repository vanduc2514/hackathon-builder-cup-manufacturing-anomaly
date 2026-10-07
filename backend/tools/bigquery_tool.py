"""ADK Tool: Executes queries against BigQuery (or bigquery-emulator) for traceability and sensor telemetry."""

from __future__ import annotations

import logging
import os
from typing import Any, List, Optional

from backend.core.config import settings
from backend.core.models import (
    FactorDistribution,
    SensorBaseline,
    SensorMetrics,
    SensorTelemetryWindowResponse,
    SuspectCorrelation,
    TraceabilityTopologyResponse,
)

logger = logging.getLogger(__name__)


def get_bigquery_client() -> Any:
    """Returns a BigQuery client targeting the emulator or GCP.

    Raises:
        RuntimeError: If google-cloud-bigquery is unavailable or initialization fails.
    """
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

        return bigquery.Client(project=settings.gcp_project_id)

    except Exception as exc:
        logger.error("Failed to initialize BigQuery client: %s", exc)
        raise RuntimeError(f"BigQuery client initialization failed: {exc}") from exc


def query_traceability_topology(
    time_window: Optional[str] = "09:30-10:00",
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    product_ids: Optional[List[str]] = None,
) -> TraceabilityTopologyResponse:
    """Queries discrete topology correlation directly from BigQuery / Emulator.

    Accepts defective product IDs or defect timestamps and joins across machines, tools,
    blank lots, and operators. Compares PASS vs DEFECT populations to isolate suspect
    machines and tools while ruling out non-causal factors.

    Raises:
        RuntimeError: If query execution against BigQuery fails.
    """
    client = get_bigquery_client()
    dataset_id = f"{client.project}.{settings.bigquery_dataset}"

    where_clauses: List[str] = []
    if product_ids:
        quoted_ids = ", ".join(f"'{p}'" for p in product_ids)
        where_clauses.append(f"product_id IN ({quoted_ids})")
    if start_time:
        where_clauses.append(f"timestamp >= TIMESTAMP('{start_time}')")
    if end_time:
        where_clauses.append(f"timestamp <= TIMESTAMP('{end_time}')")
    if time_window and not start_time and not end_time and "-" in time_window:
        parts = time_window.split("-")
        if len(parts) == 2 and ":" in parts[0] and ":" in parts[1]:
            where_clauses.append(
                f"FORMAT_TIMESTAMP('%H:%M', timestamp) >= '{parts[0]}' "
                f"AND FORMAT_TIMESTAMP('%H:%M', timestamp) <= '{parts[1]}'"
            )

    where_str = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    # Primary correlation query across machine_id and tool_id
    query_machine_tool = f"""
        SELECT
            machine_id,
            tool_id,
            COUNTIF(status LIKE 'DEFECT%') as defect_count,
            COUNT(*) as total_parts,
            SAFE_DIVIDE(COUNTIF(status LIKE 'DEFECT%'), COUNT(*)) as defect_ratio
        FROM `{dataset_id}.traceability`
        {where_str}
        GROUP BY machine_id, tool_id
        ORDER BY defect_ratio DESC, defect_count DESC
    """

    # Secondary multi-factor population analysis across lot_id and operator_id
    query_factors = f"""
        SELECT
            'lot_id' as factor_type,
            lot_id as factor_value,
            COUNTIF(status LIKE 'DEFECT%') as defect_count,
            COUNT(*) as total_parts,
            SAFE_DIVIDE(COUNTIF(status LIKE 'DEFECT%'), COUNT(*)) as defect_ratio
        FROM `{dataset_id}.traceability`
        {where_str}
        GROUP BY lot_id
        UNION ALL
        SELECT
            'operator_id' as factor_type,
            operator_id as factor_value,
            COUNTIF(status LIKE 'DEFECT%') as defect_count,
            COUNT(*) as total_parts,
            SAFE_DIVIDE(COUNTIF(status LIKE 'DEFECT%'), COUNT(*)) as defect_ratio
        FROM `{dataset_id}.traceability`
        {where_str}
        GROUP BY operator_id
    """

    try:
        results_mt = client.query(query_machine_tool).result()
        suspects: List[SuspectCorrelation] = []
        for row in results_mt:
            ratio = float(row.defect_ratio or 0.0)
            suspects.append(
                SuspectCorrelation(
                    machine_id=str(row.machine_id),
                    tool_id=str(row.tool_id),
                    correlation_score=round(ratio, 2),
                    defect_count=int(row.defect_count),
                    total_parts=int(row.total_parts),
                    sample_ratio=round(ratio, 2),
                )
            )

        results_factors = client.query(query_factors).result()
        factor_distributions: List[FactorDistribution] = []
        excluded_factors: List[str] = []

        for row in results_factors:
            ratio = float(row.defect_ratio or 0.0)
            f_type = str(row.factor_type)
            f_val = str(row.factor_value)
            d_count = int(row.defect_count)
            t_parts = int(row.total_parts)

            # A factor is considered anomalous only if defect ratio is high and affects multiple parts
            is_anomalous = ratio >= 0.8 and d_count > 2
            factor_distributions.append(
                FactorDistribution(
                    factor_type=f_type,
                    factor_value=f_val,
                    defect_count=d_count,
                    total_parts=t_parts,
                    defect_ratio=round(ratio, 2),
                    is_anomalous=is_anomalous,
                )
            )

            if not is_anomalous:
                excluded_factors.append(f"{f_type}: {f_val} (normal distribution across line)")

        source = "bigquery_emulator" if settings.bigquery_emulator_host else "bigquery_live"
        return TraceabilityTopologyResponse(
            source=source,
            suspects=suspects,
            excluded_factors=excluded_factors,
            factor_distributions=factor_distributions,
            time_window=time_window,
        )

    except Exception as exc:
        logger.error("BigQuery traceability topology query failed: %s", exc)
        raise RuntimeError(f"BigQuery query failed: {exc}") from exc


def query_sensor_telemetry_window(
    machine_id: str,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    time_window: Optional[str] = "30 MINUTE",
) -> SensorTelemetryWindowResponse:
    """Queries sensor telemetry for a machine and time window from BigQuery.

    Calculates min, max, average, and standard deviation for vibration, current,
    and temperature, comparing against nominal line baselines.

    Raises:
        RuntimeError: If query execution against BigQuery fails.
    """
    client = get_bigquery_client()
    dataset_id = f"{client.project}.{settings.bigquery_dataset}"

    where_clauses: List[str] = [f"machine_id = '{machine_id}'"]
    if start_time:
        where_clauses.append(f"timestamp >= TIMESTAMP('{start_time}')")
    if end_time:
        where_clauses.append(f"timestamp <= TIMESTAMP('{end_time}')")
    if time_window and not start_time and not end_time:
        if "-" in time_window and ":" in time_window:
            parts = time_window.split("-")
            where_clauses.append(
                f"FORMAT_TIMESTAMP('%H:%M', timestamp) >= '{parts[0]}' "
                f"AND FORMAT_TIMESTAMP('%H:%M', timestamp) <= '{parts[1]}'"
            )
        elif "MINUTE" in time_window or "HOUR" in time_window:
            where_clauses.append(
                f"timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {time_window})"
            )

    where_str = f"WHERE {' AND '.join(where_clauses)}"

    query = f"""
        SELECT
            COALESCE(MIN(vibration_mm_s), 0.0) as min_vibration,
            COALESCE(MAX(vibration_mm_s), 0.0) as max_vibration,
            COALESCE(AVG(vibration_mm_s), 0.0) as avg_vibration,
            COALESCE(STDDEV(vibration_mm_s), 0.0) as std_vibration,
            COALESCE(AVG(temperature_c), 0.0) as avg_temperature,
            COALESCE(AVG(current_a), 0.0) as avg_current,
            COUNT(*) as sample_count
        FROM `{dataset_id}.sensor_telemetry`
        {where_str}
    """

    try:
        results = client.query(query).result()
        row = next(iter(results), None)

        min_vib = float(row.min_vibration or 0.0) if row else 0.0
        max_vib = float(row.max_vibration or 0.0) if row else 0.0
        avg_vib = float(row.avg_vibration or 0.0) if row else 0.0
        std_vib = float(row.std_vibration or 0.0) if row else 0.0
        avg_temp = float(row.avg_temperature or 0.0) if row else 0.0
        avg_curr = float(row.avg_current or 0.0) if row else 0.0
        sample_cnt = int(row.sample_count or 0) if row else 0

        baseline = SensorBaseline(vibration=1.5, temperature=40.0, current=12.0)
        # Spike detection: +30% average vibration rise or +50% peak vibration indicates tool wear
        anomaly_detected = (avg_vib >= baseline.vibration * 1.30) or (
            max_vib >= baseline.vibration * 1.50
        )

        metrics = SensorMetrics(
            min_vibration=round(min_vib, 2),
            max_vibration=round(max_vib, 2),
            avg_vibration=round(avg_vib, 2),
            std_vibration=round(std_vib, 2),
            avg_temperature=round(avg_temp, 2),
            avg_current=round(avg_curr, 2),
            sample_count=sample_cnt,
        )

        source = "bigquery_emulator" if settings.bigquery_emulator_host else "bigquery_live"
        return SensorTelemetryWindowResponse(
            source=source,
            machine_id=machine_id,
            time_window=time_window or "custom",
            metrics=metrics,
            baseline=baseline,
            anomaly_detected=anomaly_detected,
        )

    except Exception as exc:
        logger.error("BigQuery sensor telemetry query failed: %s", exc)
        raise RuntimeError(f"BigQuery query failed: {exc}") from exc
