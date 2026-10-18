"""ADK Tool: Executes queries against BigQuery (or bigquery-emulator) for traceability and sensor telemetry."""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from backend.core.config import settings
from backend.core.models import (
    BigQueryIngestionSummary,
    FactorDistribution,
    MachineTelemetryPayload,
    SensorBaseline,
    SensorMetrics,
    SensorTelemetryWindowResponse,
    SuspectCorrelation,
    TraceabilityEventPayload,
    TraceabilityTopologyResponse,
)

logger = logging.getLogger(__name__)

MOCK_SENSOR_TELEMETRY: List[Dict[str, Any]] = []
MOCK_TRACEABILITY_RECORDS: List[Dict[str, Any]] = []

# ---------------------------------------------------------------------------
# Schema allowlist (issue #266)
#
# Each `manufacturing.<table>` we write to / read from must declare its column
# set in `data/schemas/bigquery/<table>.yaml`. The YAMLs are the canonical
# source of truth in this process — `data/schemas/bigquery_tables.sql` is the
# upstream DDL we mirror by hand. ``_SCHEMA_ALLOWLIST`` is loaded lazily on
# first use so importing this module never touches the filesystem; tests can
# still preload it via ``_load_schema_allowlist(force=True)``.
#
# The allowlist has three responsibilities:
# 1. Reject ``FROM ``<unknown_dataset>.<table>``` (typo / drift guard).
# 2. Reject any column reference (in SELECT / WHERE / GROUP BY / ORDER BY /
#    anywhere referenced) that is not in the table's column set, including
#    the forbidden legacy pseudo-column ``_PARTITIONTIME``.
# 3. Accept ``_PARTITIONDATE`` as the modern sharded-column surrogate so
#    partition pruning still works against the live warehouse.
# ---------------------------------------------------------------------------

_ALLOWLIST_DIR = Path(__file__).resolve().parents[2] / "data" / "schemas" / "bigquery"
_SCHEMA_ALLOWLIST: Dict[str, Dict[str, Any]] = {}
_ALLOWLIST_LOADED = False


def _load_schema_allowlist(*, force: bool = False) -> Dict[str, Dict[str, Any]]:
    """Lazy-load the schema allowlist from YAML files on disk.

    Imports ``yaml`` lazily so unit tests that never touch BigQuery can avoid
    pulling PyYAML. Falls back to an empty allowlist if PyYAML is unavailable
    or the directory is missing; ``_assert_query_safe`` then trips on every
    query, which is fail-closed behaviour but loud via the ``ValueError``.
    """
    global _SCHEMA_ALLOWLIST, _ALLOWLIST_LOADED  # noqa: PLW0603
    if _ALLOWLIST_LOADED and not force:
        return _SCHEMA_ALLOWLIST
    try:
        import yaml  # type: ignore[import-untyped]
    except ImportError:
        logger.warning("PyYAML not installed; schema allowlist disabled (fail-closed)")
        _ALLOWLIST_LOADED = True
        return _SCHEMA_ALLOWLIST
    if not _ALLOWLIST_DIR.is_dir():
        logger.warning(
            "Schema allowlist directory %s missing; queries will fail closed",
            _ALLOWLIST_DIR,
        )
        _ALLOWLIST_LOADED = True
        return _SCHEMA_ALLOWLIST
    loaded: Dict[str, Dict[str, Any]] = {}
    for path in sorted(_ALLOWLIST_DIR.glob("*.yaml")):
        try:
            with path.open("r", encoding="utf-8") as fp:
                doc = yaml.safe_load(fp) or {}
        except (OSError, ValueError) as exc:
            logger.error("Failed to load schema allowlist %s: %s", path, exc)
            continue
        if not isinstance(doc, dict) or "table" not in doc:
            logger.error("Schema allowlist %s missing 'table' key; skipping", path)
            continue
        # YAMLs name the DDL dataset (`manufacturing.<table>`); the deployed dataset name
        # comes from settings (e.g. `kaizen_manufacturing` on Cloud Run), so key by that.
        table_name = str(doc["table"]).rsplit(".", 1)[-1]
        loaded[_table_key(settings.bigquery_dataset, table_name)] = {
            "columns": {str(c) for c in doc.get("columns", []) or []},
            "allowed_pseudo_columns": {
                str(c) for c in doc.get("allowed_pseudo_columns", []) or []
            },
            "forbidden_pseudo_columns": {
                str(c) for c in doc.get("forbidden_pseudo_columns", []) or []
            },
            "path": str(path),
        }
    _SCHEMA_ALLOWLIST = loaded
    _ALLOWLIST_LOADED = True
    return _SCHEMA_ALLOWLIST


# Regular expression that captures a fully-qualified `dataset.table` reference
# in any ``FROM`` / ``JOIN`` clause. We use the explicit ```...``` quoting
# because BigQuery requires it for cross-dataset joins and our f-string SQL
# builds already wrap the dataset.table name with backticks. We capture the
# qualified form first so the unqualified fallback cannot accidentally
# consume the second identifier of an already-qualified reference.
_FROM_RE = re.compile(
    r"""\b(?:FROM|JOIN)\s+`([\w-]+)\.([\w-]+)`""",
    re.IGNORECASE,
)
# Unqualified `FROM sensor_telemetry` / `JOIN competition_telemetry` (no
# dataset prefix, no leading backticks). Anchored by leading whitespace to
# avoid matching the second identifier of an already-qualified reference.
_FROM_UNQUAL_RE = re.compile(
    r"""\b(?:FROM|JOIN)\s+([\w-]+)\b(?!\.)""",
    re.IGNORECASE,
)
# Anything that looks like an identifier after a SELECT, WHERE, GROUP BY,
# ORDER BY, ON, AND, OR, etc. The capture group must start with a letter /
# underscore so we do not match numeric literals like ``42`` in SELECT
# COUNT(*) AS total_42.
_IDENT_RE = re.compile(r"""([A-Za-z_][A-Za-z0-9_]*)""")


def _table_key(dataset_id: str, table_name: str) -> str:
    """Canonical ``<dataset>.<table>`` key used by the allowlist mapping."""
    return f"{dataset_id}.{table_name}"


def _assert_query_safe(sql: str, *, default_dataset_id: Optional[str] = None) -> None:
    """Validate ``sql`` against the allowlist before any client is invoked.

    Extracts every ``FROM `dataset.table``` reference and asserts:

    - the resulting ``dataset.table`` exists in the allowlist;
    - each identifier used in the query (column references, aliases are not
      distinguished — over-permissive on aliases, conservative on columns)
      is either a regular column, one of the table's
      ``allowed_pseudo_columns``, or an SQL keyword; and
    - no ``forbidden_pseudo_columns`` (currently ``_PARTITIONTIME``) appears
      anywhere in the raw SQL.

    Raises ``ValueError`` with the offending reference so callers fail loudly
    BEFORE handing the SQL to the BigQuery / emulator client. We fail closed
    (always raise) rather than swallow typos because at least two of the
    tables in scope are queried from production analytics dashboards where a
    silent fallback would corrupt downstream SPC calculations.
    """
    allowlist = _load_schema_allowlist()

    # 1. Reject forbidden pseudo-columns (e.g. _PARTITIONTIME) eagerly.
    for match in re.finditer(r"\b_([A-Za-z0-9_]+)\b", sql):
        pseudo_candidate = f"_{match.group(1)}"
        if pseudo_candidate.lower() == "_partitiontime":
            raise ValueError(
                "_PARTITIONTIME is forbidden by the schema allowlist "
                "(issue #266); use _PARTITIONDATE instead"
            )

    # 2. Resolve every FROM / JOIN reference against the allowlist. Two flavors:
    # ``FROM `ds.tbl``` (qualified) and ``FROM tbl``` (unqualified, qualified
    # against ``default_dataset_id``). Reject anything outside the YAMLs.
    referenced_tables: Set[str] = set()
    # Aliases introduced via `AS <name>` are valid identifiers in the SELECT,
    # WHERE, GROUP BY, ORDER BY clauses. We collect them so the identifier
    # allowlist check below doesn't flag a query that uses ``AS s`` as
    # referencing an unknown column.
    aliases: Set[str] = set()
    for alias_match in re.finditer(r"\bAS\s+([A-Za-z_][A-Za-z0-9_]*)", sql, re.IGNORECASE):
        aliases.add(alias_match.group(1))
    for match in _FROM_RE.finditer(sql):
        ds, tbl = match.group(1), match.group(2)
        qualified_key = _table_key(ds, tbl)
        if qualified_key not in allowlist:
            raise ValueError(
                f"BigQuery query references unknown table {qualified_key!r}; "
                f"add a YAML allowlist under data/schemas/bigquery/ before retrying"
            )
        referenced_tables.add(qualified_key)
    for match in _FROM_UNQUAL_RE.finditer(sql):
        tbl = match.group(1)
        if default_dataset_id is None:
            raise ValueError(
                f"BigQuery query references unqualified table {tbl!r}; "
                f"either pass default_dataset_id or qualify with a dataset"
            )
        qualified_key = _table_key(default_dataset_id, tbl)
        if qualified_key not in allowlist:
            raise ValueError(
                f"BigQuery query references unqualified table {tbl!r} which "
                f"resolves to {qualified_key!r}; no allowlist entry"
            )
        referenced_tables.add(qualified_key)

    if not referenced_tables:
        # No FROM / JOIN (e.g. literal SELECT 1) — nothing to validate.
        return

    # 3. Identifier validation: for every referenced table, ensure each
    # identifier in the SQL is either a declared column / pseudo-column /
    # alias for that table, or a known SQL keyword. We strip backtick-quoted
    # segments first so the dataset.table in FROM `manufacturing.<tbl>` does
    # not contaminate the identifier scan.
    sql_keywords = _SQL_KEYWORDS_LC
    sql_for_ident_scan = re.sub(r"`[^`]*`", " ", sql)
    for table_key in referenced_tables:
        schema = allowlist[table_key]
        allowed = schema["columns"] | schema["allowed_pseudo_columns"]
        forbidden = schema["forbidden_pseudo_columns"]
        for ident_match in _IDENT_RE.finditer(sql_for_ident_scan):
            ident = ident_match.group(1)
            ident_lc = ident.lower()
            if ident_lc in sql_keywords:
                continue
            # Backticked pseudo-columns and SQL functions (COUNT, COALESCE,
            # SAFE_DIVIDE, etc.) are passed through.
            if ident_lc in {"count", "coalesce", "safe_divide", "sum", "avg",
                             "min", "max", "stddev", "format_timestamp",
                             "timestamp", "current_timestamp", "date",
                             "datetime", "time", "unnest", "if", "case"}:
                continue
            if ident in aliases:
                # Aliases introduced by `AS <name>` in the same query.
                continue
            # BigQuery positional / pseudo-named parameters (``@start``, ``@end``,
            # ``@machine_id``) appear inline and are valid identifiers despite not
            # being columns. The regex matches them; a leading ``@`` is the only
            # syntactic distinction we can lean on.
            if sql_for_ident_scan.find(f"@{ident}") >= 0:
                continue
            if ident in forbidden:
                raise ValueError(
                    f"Forbidden pseudo-column {ident!r} in query against {table_key}"
                )
            if ident not in allowed:
                # If the identifier appears in any other allowlisted table's
                # column set, the query is ambiguous across joins; reject.
                cross_other = any(
                    ident in other.get("columns", set()) or ident in other.get(
                        "allowed_pseudo_columns", set()
                    )
                    for other_key, other in allowlist.items()
                    if other_key != table_key
                )
                if cross_other and sql_for_ident_scan.lower().count(ident_lc) == 1:
                    # Single occurrence of an identifier that exists in another
                    # table is acceptable for unqualified single-table reads.
                    continue
                if cross_other:
                    raise ValueError(
                        f"Column {ident!r} in query against {table_key} is not "
                        f"declared in its schema allowlist; qualify it with a "
                        f"table alias or update data/schemas/bigquery to add it"
                    )
                raise ValueError(
                    f"Column {ident!r} is not declared in the schema allowlist "
                    f"for {table_key}; update {schema['path']} before retrying"
                )


def _validate_insert_payload(table_key: str, row: Dict[str, Any]) -> None:
    """Validate an ``insert_rows_json`` row against the schema allowlist.

    Streaming inserts (sensor telemetry, traceability events, competition
    ingestion) build their rows from Pydantic models so every column key
    SHOULD be a declared column. The guard raises ``ValueError`` on the
    rare case the model gains a field that has not yet been mirrored into
    ``data/schemas/bigquery/<table>.yaml`` — saving us from silently
    inserting phantom columns that BigQuery would reject (and the emulator
    would accept, masking drift).
    """
    schema = _load_schema_allowlist().get(table_key)
    if schema is None:
        raise ValueError(
            f"insert_rows_json target {table_key!r} not in schema allowlist; "
            f"add a YAML allowlist under data/schemas/bigquery/ before retrying"
        )
    declared = schema["columns"]
    for key in row.keys():
        if key not in declared:
            raise ValueError(
                f"Row key {key!r} is not declared in the schema allowlist for "
                f"{table_key}; update {schema['path']} to add it"
            )


# Compact lowercase keyword set covering the SQL we currently emit. Stripped of
# functions (handled separately above) and pseudo-columns (validated earlier).
_SQL_KEYWORDS_LC: Set[str] = frozenset(
    word
    for word in (
        "select",
        "from",
        "where",
        "and",
        "or",
        "not",
        "in",
        "is",
        "null",
        "like",
        "group",
        "by",
        "order",
        "having",
        "limit",
        "offset",
        "union",
        "all",
        "as",
        "on",
        "using",
        "left",
        "right",
        "inner",
        "outer",
        "join",
        "distinct",
        "case",
        "when",
        "then",
        "else",
        "end",
        "between",
        "asc",
        "desc",
        "true",
        "false",
        "interval",
        "minute",
        "hour",
        "day",
        "with",
        "over",
        "partition",
        "rows",
        "range",
        "unnest",
    )
)


# Upper bound for one query including BigQuery job retries; a failing job surfaces as an
# error instead of being re-run for the library default of ~10 minutes.
QUERY_TIMEOUT_SECONDS = 30.0

_CLOCK_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
_INTERVAL_RE = re.compile(r"^(\d{1,4}) (MINUTE|HOUR)$")


def _timestamp_filter(name: str, op: str, value: str) -> Tuple[str, Any]:
    """Builds a parameterized timestamp bound from an ISO-8601 timestamp or an HH:MM clock time."""
    from google.cloud import bigquery

    value = value.strip()
    if _CLOCK_RE.match(value):
        return (
            f"FORMAT_TIMESTAMP('%H:%M', timestamp) {op} @{name}",
            bigquery.ScalarQueryParameter(name, "STRING", value),
        )
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(
            f"{name} must be an ISO-8601 timestamp (e.g. 2026-10-05T09:30:00Z) "
            f"or HH:MM, got {value!r}"
        ) from exc
    return f"timestamp {op} @{name}", bigquery.ScalarQueryParameter(name, "TIMESTAMP", parsed)


def _time_filters(
    time_window: Optional[str], start_time: Optional[str], end_time: Optional[str]
) -> Tuple[List[str], List[Any]]:
    """Translates time arguments into parameterized WHERE clauses.

    Explicit start/end bounds take precedence over time_window, which accepts
    "HH:MM-HH:MM" (clock range) or "<N> MINUTE|HOUR" (trailing interval).

    Raises:
        ValueError: If any time argument is malformed.
    """
    from google.cloud import bigquery

    clauses: List[str] = []
    params: List[Any] = []
    for name, op, value in (("start_time", ">=", start_time), ("end_time", "<=", end_time)):
        if value:
            clause, param = _timestamp_filter(name, op, value)
            clauses.append(clause)
            params.append(param)
    if clauses or not time_window:
        return clauses, params

    window = time_window.strip()
    interval = _INTERVAL_RE.match(window.upper())
    if interval:
        # The unit is whitelisted by the regex; only the count is a bound parameter.
        clauses.append(
            "timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), "
            f"INTERVAL @window_count {interval.group(2)})"
        )
        params.append(
            bigquery.ScalarQueryParameter("window_count", "INT64", int(interval.group(1)))
        )
        return clauses, params

    parts = [p.strip() for p in window.split("-")]
    if len(parts) == 2 and all(_CLOCK_RE.match(p) for p in parts):
        clauses.append(
            "FORMAT_TIMESTAMP('%H:%M', timestamp) >= @window_start "
            "AND FORMAT_TIMESTAMP('%H:%M', timestamp) <= @window_end"
        )
        params.append(bigquery.ScalarQueryParameter("window_start", "STRING", parts[0]))
        params.append(bigquery.ScalarQueryParameter("window_end", "STRING", parts[1]))
        return clauses, params

    raise ValueError(f"time_window must be 'HH:MM-HH:MM' or '<N> MINUTE|HOUR', got {time_window!r}")


def _run_query(client: Any, sql: str, params: List[Any]) -> Any:
    """Runs a parameterized query with job retries bounded by QUERY_TIMEOUT_SECONDS."""
    from google.cloud import bigquery
    from google.cloud.bigquery.retry import DEFAULT_JOB_RETRY

    job = client.query(
        sql,
        job_config=bigquery.QueryJobConfig(query_parameters=params),
        job_retry=DEFAULT_JOB_RETRY.with_deadline(QUERY_TIMEOUT_SECONDS),
    )
    return job.result(timeout=QUERY_TIMEOUT_SECONDS)


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

        if settings.gcp_project_id == "kaizen-local":
            if settings.bigquery_fallback_to_mock:
                logger.info("Local dev with kaizen-local: BigQuery using mock fallback")
                raise RuntimeError(
                    "BigQuery live client skipped for kaizen-local placeholder project"
                )

        return bigquery.Client(project=settings.gcp_project_id)

    except Exception as exc:
        logger.error("Failed to initialize BigQuery client: %s", exc)
        raise RuntimeError(f"BigQuery client initialization failed: {exc}") from exc


def get_mock_traceability_topology(
    time_window: Optional[str] = "09:30-10:00",
) -> TraceabilityTopologyResponse:
    """Returns grounded mock traceability topology correlation from local dataset fixtures."""
    return TraceabilityTopologyResponse(
        source="mock_fallback",
        suspects=[
            SuspectCorrelation(
                machine_id="CNC-02",
                tool_id="T07",
                correlation_score=0.95,
                defect_count=23,
                total_parts=25,
                sample_ratio=0.92,
            ),
            SuspectCorrelation(
                machine_id="CNC-01",
                tool_id="T04",
                correlation_score=0.02,
                defect_count=0,
                total_parts=28,
                sample_ratio=0.0,
            ),
            SuspectCorrelation(
                machine_id="CNC-03",
                tool_id="T07",
                correlation_score=0.01,
                defect_count=0,
                total_parts=27,
                sample_ratio=0.0,
            ),
        ],
        excluded_factors=[
            "lot_id: AL-5083-B4 (normal distribution across line)",
            "operator_id: OP-12 (normal distribution across line)",
        ],
        factor_distributions=[
            FactorDistribution(
                factor_type="lot_id",
                factor_value="AL-5083-B4",
                defect_count=23,
                total_parts=80,
                defect_ratio=0.29,
                is_anomalous=False,
            )
        ],
        time_window=time_window,
    )


def get_mock_sensor_telemetry_window(
    machine_id: str,
    time_window: Optional[str] = "30 MINUTE",
) -> SensorTelemetryWindowResponse:
    """Returns grounded mock sensor telemetry metrics for local development parity."""
    is_anomaly = machine_id.upper() == "CNC-02"
    return SensorTelemetryWindowResponse(
        machine_id=machine_id,
        source="mock_fallback",
        time_window=time_window,
        metrics=SensorMetrics(
            min_vibration=1.20 if is_anomaly else 0.85,
            max_vibration=3.82 if is_anomaly else 1.75,
            avg_vibration=2.45 if is_anomaly else 1.45,
            std_vibration=0.65 if is_anomaly else 0.15,
            avg_temperature=43.2 if is_anomaly else 39.5,
            avg_current=14.1 if is_anomaly else 11.8,
            sample_count=180,
        ),
        anomaly_detected=is_anomaly,
    )


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
        ValueError: If a time argument is malformed.
    """
    try:
        client = get_bigquery_client()
    except Exception as exc:
        if settings.bigquery_fallback_to_mock:
            logger.warning(
                "BigQuery client unavailable (%s); falling back to mock traceability fixtures.",
                exc,
            )
            return get_mock_traceability_topology(time_window=time_window)
        raise

    from google.cloud import bigquery

    where_clauses, params = _time_filters(time_window, start_time, end_time)
    if product_ids:
        where_clauses.insert(0, "product_id IN UNNEST(@product_ids)")
        params.append(bigquery.ArrayQueryParameter("product_ids", "STRING", list(product_ids)))
    dataset_id = f"{client.project}.{settings.bigquery_dataset}"
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
    _assert_query_safe(query_machine_tool, default_dataset_id=settings.bigquery_dataset)

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
    _assert_query_safe(query_factors, default_dataset_id=settings.bigquery_dataset)

    try:
        results_mt = _run_query(client, query_machine_tool, params)
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

        results_factors = _run_query(client, query_factors, params)
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
        ValueError: If a time argument is malformed.
    """
    try:
        client = get_bigquery_client()
    except Exception as exc:
        if settings.bigquery_fallback_to_mock:
            logger.warning(
                "BigQuery client unavailable (%s); falling back to mock sensor telemetry fixtures.",
                exc,
            )
            return get_mock_sensor_telemetry_window(machine_id=machine_id, time_window=time_window)
        raise

    from google.cloud import bigquery

    where_clauses, params = _time_filters(time_window, start_time, end_time)
    where_clauses.insert(0, "machine_id = @machine_id")
    params.append(bigquery.ScalarQueryParameter("machine_id", "STRING", machine_id))
    dataset_id = f"{client.project}.{settings.bigquery_dataset}"
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
    _assert_query_safe(query, default_dataset_id=settings.bigquery_dataset)

    try:
        results = _run_query(client, query, params)
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


def reset_buffers() -> Dict[str, Any]:
    """Restores BigQuery mock data, in-memory buffers, and re-seeds emulator tables if connected.

    Only the emulator is re-seeded: against a real project the seed would append duplicate
    fixture and competition rows to production tables on every demo reset.
    """
    clear_mock_sensor_telemetry()
    clear_mock_traceability_records()
    if settings.bigquery_emulator_host:
        try:
            from scripts.seed_bigquery import seed_bigquery

            seed_bigquery()
        except Exception as exc:
            logger.warning("Could not re-seed BigQuery tables during buffer reset: %s", exc)
    logger.info("Reset BigQuery buffers and mock datasets to pristine baseline")
    return {"status": "reset", "message": "BigQuery buffers and mock datasets restored to baseline"}


def stream_sensor_telemetry(telemetry: MachineTelemetryPayload) -> bool:
    """Streams a normalized sensor telemetry record to BigQuery or in-memory mock buffer."""
    row = {
        "timestamp": telemetry.timestamp,
        "machine_id": telemetry.machine_id,
        "vibration_mm_s": float(telemetry.spindle_vibration),
        "temperature_c": float(telemetry.spindle_temp),
        "current_a": float(telemetry.motor_current),
        "spindle_speed_rpm": int(telemetry.rpm),
    }
    # Validate every row key against the schema allowlist before any client.
    _validate_insert_payload(f"{settings.bigquery_dataset}.sensor_telemetry", row)

    # In-memory buffer fallback and inspection
    MOCK_SENSOR_TELEMETRY.append(row)
    if len(MOCK_SENSOR_TELEMETRY) > 500:
        del MOCK_SENSOR_TELEMETRY[:-500]

    try:
        client = get_bigquery_client()
        dataset_id = f"{client.project}.{settings.bigquery_dataset}"
        table_ref = f"{dataset_id}.sensor_telemetry"
        errors = client.insert_rows_json(table_ref, [row])
        if not errors:
            return True
        logger.warning("BigQuery sensor_telemetry insert error: %s", errors)
    except Exception as exc:
        logger.warning("BigQuery streaming insert failed (%s); buffered locally", exc)

    return True


def get_mock_sensor_telemetry() -> List[Dict[str, Any]]:
    """Returns buffered in-memory sensor telemetry records."""
    return list(MOCK_SENSOR_TELEMETRY)


def clear_mock_sensor_telemetry() -> None:
    """Clears buffered in-memory sensor telemetry records."""
    MOCK_SENSOR_TELEMETRY.clear()


def stream_traceability_record(record: TraceabilityEventPayload) -> bool:
    """Streams a discrete traceability event to BigQuery or in-memory mock buffer."""
    row = {
        "product_id": record.product_id,
        "timestamp": record.timestamp,
        "machine_id": record.machine_id,
        "tool_id": record.tool_id,
        "lot_id": record.lot_id,
        "operator_id": record.operator_id,
        "status": record.status,
    }
    _validate_insert_payload(f"{settings.bigquery_dataset}.traceability", row)

    # In-memory buffer fallback and inspection
    MOCK_TRACEABILITY_RECORDS.append(row)
    if len(MOCK_TRACEABILITY_RECORDS) > 500:
        del MOCK_TRACEABILITY_RECORDS[:-500]

    try:
        client = get_bigquery_client()
        dataset_id = f"{client.project}.{settings.bigquery_dataset}"
        table_ref = f"{dataset_id}.traceability"
        errors = client.insert_rows_json(table_ref, [row])
        if not errors:
            return True
        logger.warning("BigQuery traceability insert error: %s", errors)
    except Exception as exc:
        logger.warning("BigQuery streaming insert failed (%s); buffered locally", exc)

    return True


# ---------------------------------------------------------------------------
# TKT-070 / issue #268 — Competition telemetry (S9 / S10 / S11)
#
# Helpers for the ``manufacturing.competition_telemetry`` warehouse table
# introduced by PR #283. ``load_competition_telemetry`` runs the same
# CSV-to-BigQuery loader as ``scripts.seed_bigquery.load_competition_csv``
# but routes through the runtime-configured emulator/live client and
# returns a typed ``BigQueryIngestionSummary``. ``query_competition_telemetry_distribution``
# is the S11 inspector baseline query: per-machine histograms of
# anomaly scores + alarm-code counts that drive ``baseline source:
# competition_telemetry`` log lines.
# ---------------------------------------------------------------------------


def load_competition_telemetry(
    *,
    staging_csv: Optional[str] = None,
    manifest_path: Optional[str] = None,
    client: Optional[Any] = None,
    dry_run: bool = False,
) -> Optional[BigQueryIngestionSummary]:
    """Load the competition CSVs into ``manufacturing.competition_telemetry``.

    When ``client`` is None the function uses ``get_bigquery_client()``
    so the same code path works against the emulator (default in dev)
    and live BigQuery (after explicit user approval). When the BigQuery
    client is unavailable AND ``bigquery_fallback_to_mock`` is true,
    the function still parses the CSVs and writes the staging artefacts
    so the manifest can be inspected offline.

    Returns ``None`` on dry-run / mock-fallback paths and the populated
    ``BigQueryIngestionSummary`` after a successful INSERT.
    """
    from data.competition_loader import load_competition_csv as _load_csv

    rows, skipped, source_sha256s = _load_csv()
    target_table = f"{settings.gcp_project_id}.{settings.bigquery_dataset}.competition_telemetry"

    composite_sha = _composite_source_sha(source_sha256s)
    from data.competition_loader import (
        emit_staging_csv,
        summarize_ingestion,
        write_seed_manifest,
    )

    # Allowlist guard: every column key in the loader output must be declared in
    # data/schemas/bigquery/competition_telemetry.yaml. Raises ValueError BEFORE
    # the BigQuery / emulator client is called so a schema drift (e.g. an ALTER
    # TABLE on bigquery_tables.sql not mirrored to YAML) surfaces immediately.
    if rows:
        table_key = f"{settings.bigquery_dataset}.competition_telemetry"
        for row in rows:
            _validate_insert_payload(table_key, row)

    summary = summarize_ingestion(
        rows_loaded=len(rows),
        rows_skipped=skipped,
        source_sha256=composite_sha,
        target_table=target_table,
        dry_run=dry_run,
    )

    # Always emit the staging CSV + manifest, even on the dry-run / mock
    # fallback path, so a CI job can validate the schema mapping offline.
    default_staging = "data/datasets/competition_telemetry.csv"
    default_manifest = "artifacts/BQ_seed_manifest.json"
    from pathlib import Path

    emit_staging_csv(rows, Path(staging_csv or default_staging))
    write_seed_manifest(
        Path(manifest_path or default_manifest),
        summary=summary,
        source_sha256s=source_sha256s,
    )

    if dry_run:
        logger.info(
            "Dry-run: would load %d rows into %s (skipped %d malformed)",
            summary.rows_loaded,
            target_table,
            summary.rows_skipped,
        )
        return summary

    if client is None:
        try:
            client = get_bigquery_client()
        except Exception as exc:
            if settings.bigquery_fallback_to_mock:
                logger.warning(
                    "BigQuery client unavailable (%s); competition CSV staged locally only.",
                    exc,
                )
                return None
            raise

    errors = _insert_rows_in_batches(client, target_table, rows)
    if errors:
        logger.warning("Errors inserting competition_telemetry rows: %s", errors)
    else:
        logger.info(
            "Successfully loaded %d rows into %s (skipped %d malformed)",
            summary.rows_loaded,
            target_table,
            summary.rows_skipped,
        )
    return summary


def _composite_source_sha(source_sha256s: Dict[str, str]) -> str:
    """Combine per-source SHAs into one stable hex digest for the manifest."""
    import hashlib

    joined = "\n".join(f"{tag}:{sha}" for tag, sha in sorted(source_sha256s.items()))
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def _insert_rows_in_batches(
    client: Any,
    table_ref: str,
    rows: List[Dict[str, Any]],
    *,
    batch_size: int = 500,
) -> List[Any]:
    """Insert ``rows`` into ``table_ref`` in chunks of ``batch_size``.

    BigQuery's ``insert_rows_json`` accepts up to 500 rows per call.
    Mirrors ``scripts.seed_bigquery._insert_in_batches`` so the
    runtime helper has the same batching behaviour as the CLI.
    """
    errors: List[Any] = []
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        if not batch:
            continue
        batch_errors = client.insert_rows_json(table_ref, batch)
        if batch_errors:
            errors.extend(batch_errors)
    return errors


def query_competition_telemetry_distribution(
    machine_id: Optional[str] = None,
    *,
    client: Optional[Any] = None,
    time_window: Optional[str] = None,
) -> Dict[str, Any]:
    """Per-machine distribution of anomaly scores + alarm codes.

    Returns a ``Dict`` so the helper is callable from both the ADK
    inspector tool (where ``Pydantic`` types are required) and the
    standalone BigQuery notebook (where plain dicts are friendlier).
    The shape is documented in ``docs/runbooks/seed-bigquery.md``.

    When the warehouse table is empty (e.g. before the first
    ``mise run seed``), the function returns a defensive empty payload
    rather than raising so the inspector baseline path keeps working.
    """
    target_client = client
    if target_client is None:
        try:
            target_client = get_bigquery_client()
        except Exception as exc:
            if settings.bigquery_fallback_to_mock:
                logger.warning(
                    "BigQuery client unavailable (%s); competition distribution unavailable.",
                    exc,
                )
                return {"source": "mock_fallback", "machines": [], "sample_count": 0}
            raise

    from google.cloud import bigquery

    where_clauses: List[str] = []
    params: List[Any] = []
    if machine_id:
        where_clauses.append("asset_machine_id = @machine_id")
        params.append(bigquery.ScalarQueryParameter("machine_id", "STRING", machine_id))
    if time_window:
        window_clauses, window_params = _time_filters(time_window, None, None)
        where_clauses.extend(window_clauses)
        params.extend(window_params)
    where_str = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    dataset_id = f"{target_client.project}.{settings.bigquery_dataset}"
    query = f"""
        SELECT
            asset_machine_id,
            COUNT(*) AS sample_count,
            AVG(health_anomaly_score) AS avg_anomaly_score,
            MAX(health_anomaly_score) AS max_anomaly_score,
            COUNTIF(alarm_code IS NOT NULL) AS fault_count,
            COUNTIF(operating_status = 'FAULT') AS fault_status_count
        FROM `{dataset_id}.competition_telemetry`
        {where_str}
        GROUP BY asset_machine_id
        ORDER BY avg_anomaly_score DESC
    """
    _assert_query_safe(query, default_dataset_id=settings.bigquery_dataset)
    try:
        rows_iter = _run_query(target_client, query, params)
        machines: List[Dict[str, Any]] = []
        total_samples = 0
        for row in rows_iter:
            sample_count = int(row.sample_count or 0)
            total_samples += sample_count
            machines.append(
                {
                    "asset_machine_id": str(row.asset_machine_id),
                    "sample_count": sample_count,
                    "avg_anomaly_score": round(float(row.avg_anomaly_score or 0.0), 6),
                    "max_anomaly_score": round(float(row.max_anomaly_score or 0.0), 6),
                    "fault_count": int(row.fault_count or 0),
                    "fault_status_count": int(row.fault_status_count or 0),
                }
            )
        source = "bigquery_emulator" if settings.bigquery_emulator_host else "bigquery_live"
        return {
            "source": source,
            "machines": machines,
            "sample_count": total_samples,
            "machine_id": machine_id,
            "time_window": time_window,
        }
    except Exception as exc:
        logger.warning("competition_telemetry distribution query failed (%s); returning empty", exc)
        return {"source": "query_error", "machines": [], "sample_count": 0, "error": str(exc)}


def get_mock_traceability_records() -> List[Dict[str, Any]]:
    """Returns buffered in-memory traceability records."""
    return list(MOCK_TRACEABILITY_RECORDS)


def clear_mock_traceability_records() -> None:
    """Clears buffered in-memory traceability records."""
    MOCK_TRACEABILITY_RECORDS.clear()
