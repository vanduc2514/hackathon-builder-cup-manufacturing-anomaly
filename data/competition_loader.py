"""Competition CSV-to-BigQuery loader (TKT-070 / issue #268 S9).

Pure-Python, no GCP / Drive / BigQuery imports. The module:

1. Reads the two canonical competition CSVs from
   ``data/datasets/competition/`` (BOM-stripped).
2. Validates every row against ``backend.core.models.CompetitionTelemetryPayload``
   (malformed rows are skipped, not aborted, so a single bad cell does not
   blow up the whole seed).
3. Synthesises ``asset_factory_id`` / ``asset_line_id`` / ``asset_machine_id``
   from a deterministic placeholder map (``MOTOR_<NN>`` per row) so the
   raw CSV never leaks an asset hierarchy identifier that might be
   recognisable in the field. This is the same shape
   ``simulator/csv_replay.py`` uses to attribute the nested JSON; only the
   asset context changes per source file (normal vs. abnormal).
4. Hashes each source file (sha256) and stamps every summary row with
   ``REDACTION_VERSION`` so an auditor can prove idempotency on re-runs.
5. Returns ``BigQueryIngestionSummary`` so callers (the CLI script and
   ``backend.tools.bigquery_tool.load_competition_telemetry()``) see the
   same shape regardless of whether they ran against the emulator or
   fell back to local CSV.

The module deliberately keeps the asset-context mapping deterministic but
external so the same row ordering survives every rerun. ``shuffle_seed``
defaults to a stable integer so two consecutive runs over the same CSV
produce byte-identical output CSVs; callers can override the seed for
deliberate reroll tests.
"""

from __future__ import annotations

import csv
import hashlib
import logging
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, List, Optional, Tuple

from backend.core.models import (
    BigQueryIngestionSummary,
    CompetitionTelemetryPayload,
)

logger = logging.getLogger(__name__)


# Schema version stamped on every summary. Bumped whenever the warehouse
# DDL (`data/schemas/bigquery_tables.sql`) or this loader's row-mapping
# shape changes. Pair with `data.redaction.REDACTION_VERSION` so an
# auditor can correlate the two stamps in the seed JSON manifest.
COMPETITION_SCHEMA_VERSION: str = "2026-10-18.v1"

# Deterministic asset placeholders, derived per source CSV file. Kept
# under 16 chars so they fit the BigQuery STRING column comfortably and
# stay readable in log output. The CSV row index becomes the suffix so
# the order is stable across reruns.
_NORMAL_ASSET_FACTORY = "FACTORY_NORMAL"
_NORMAL_ASSET_LINE = "LINE_BASELINE"
_FAULT_ASSET_FACTORY = "FACTORY_FAULT"
_FAULT_ASSET_LINE = "LINE_ABNORMAL"

# Loaded lazily to avoid an import cycle with data/redaction.py at module
# import time. ``REDACTION_VERSION`` is read on every ``summarize`` call
# so a test can monkeypatch it without re-importing this module.
def _redaction_version() -> str:
    from data.redaction import REDACTION_VERSION

    return REDACTION_VERSION


@dataclass(frozen=True)
class CompetitionSource:
    """One competition CSV file plus its deterministic asset context."""

    csv_path: Path
    asset_factory_id: str
    asset_line_id: str

    @property
    def tag(self) -> str:
        """Short slug used to pick the asset_machine_id prefix.

        The competition CSVs ship as ``normal_machine_operating_data_1000_with_timestamp.csv``
        (slug: ``normal``) and ``abnormal_machine_operating_data_1000.csv``
        (slug: ``abnormal``). The slug flows into the
        ``MOTOR_<TAG>_<NNNN>`` placeholder so a quick log scan tells
        which source a row came from.
        """
        stem = self.csv_path.stem
        # Canonical normal file ends with ``_1000_with_timestamp``;
        # canonical abnormal file ends with ``_1000``. Strip the row-count
        # marker, then drop the boilerplate ``_machine_operating_data`` so
        # the slug reduces to ``normal`` / ``abnormal``.
        for suffix in ("_1000_with_timestamp", "_1000"):
            if stem.endswith(suffix):
                stem = stem[: -len(suffix)]
                break
        return stem.replace("_machine_operating_data", "")


def _default_sources(repo_root: Path) -> Tuple[CompetitionSource, ...]:
    """Return the canonical competition CSV sources in stable order.

    Order matters: callers and tests rely on the same ``(normal, abnormal)``
    tuple so a re-run over identical CSVs produces an identical summary.
    """
    csv_dir = repo_root / "data" / "datasets" / "competition"
    return (
        CompetitionSource(
            csv_path=csv_dir / "normal_machine_operating_data_1000_with_timestamp.csv",
            asset_factory_id=_NORMAL_ASSET_FACTORY,
            asset_line_id=_NORMAL_ASSET_LINE,
        ),
        CompetitionSource(
            csv_path=csv_dir / "abnormal_machine_operating_data_1000.csv",
            asset_factory_id=_FAULT_ASSET_FACTORY,
            asset_line_id=_FAULT_ASSET_LINE,
        ),
    )


def _file_sha256(path: Path) -> str:
    """Return the hex SHA-256 of a file's bytes.

    Reads in 64 KiB chunks so a 1000-row CSV does not load the entire
    file into memory at once; both competition sources are tiny so this
    is paranoia, but the helper is shared by tests.
    """
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _coerce_runtime_hours(idx: int) -> float:
    """Build a stable per-row ``operating_runtime_hours`` value.

    Used by the asset context synth so the loader has a non-null runtime
    number for every row (the raw CSV does not carry one). The function
    is deterministic and monotonic in ``idx`` so re-runs over the same
    CSV produce identical rows.
    """
    return 1000.0 + (idx / 60.0) * 1.0


def _coerce_anomaly_score(raw_alarm: str, idx: int) -> float:
    """Derive ``health_anomaly_score`` from the CSV's alarm_code column.

    The competition CSVs emit ``alarm_code`` as an empty string for
    baseline rows and a numeric string for failure rows. We keep the
    derived score inside the [0.0, 1.0] range enforced by
    ``CompetitionTelemetryPayload`` and use a deterministic per-row
    jitter so SPC histograms see enough variance to break ties.
    """
    if raw_alarm == "":
        return round(0.02 + (idx % 100) * 0.0006, 6)
    code = int(raw_alarm)
    return round(min(0.65 + code / 100.0, 0.99), 6)


def _coerce_current_amperes(current_percent_raw: str) -> float:
    """Convert the CSV ``current_percent`` (0-150) to actual Amperes.

    ``scripts/sync_gdrive_kb.py`` / ``simulator/csv_replay.py`` use the
    convention ``current_percent * 0.123`` so ``current_percent=100``
    maps to the canonical ``12.3A`` baseline the inspector expects. We
    round to 3 decimals so the value fits in the BigQuery FLOAT64 column
    without ugly floating-point noise.
    """
    return round(float(current_percent_raw) * 0.123, 3)


def _synthesize_asset_machine_id(source_tag: str, idx: int) -> str:
    """Build the deterministic placeholder ``asset_machine_id``.

    Format: ``MOTOR_<TAG>_<NNN>`` so e.g. row 17 of the normal file is
    ``MOTOR_NORMAL_017``. The placeholder shape matches the example
    values in ``CompetitionTelemetryPayload`` field descriptions.
    """
    return f"MOTOR_{source_tag.upper()}_{idx:04d}"


def _row_to_payload(
    raw_row: dict[str, str],
    *,
    idx: int,
    source: CompetitionSource,
) -> dict[str, Any]:
    """Map one raw CSV row dict to a ``CompetitionTelemetryPayload``-valid dict.

    The mapping rules are documented in
    ``data/datasets/competition/README.md`` ("Replay Mode Mapping"). The
    runtime hours, anomaly score, and asset context are deterministic
    functions of ``idx`` and the source tag so the output is reproducible.
    """
    alarm_raw = raw_row["alarm_code"].strip()
    warning_raw = raw_row["warning_code"].strip()
    return {
        "asset_factory_id": source.asset_factory_id,
        "asset_line_id": source.asset_line_id,
        "asset_machine_id": _synthesize_asset_machine_id(source.tag, idx),
        "operating_status": raw_row["operating_status"],
        "operating_load_percent": float(raw_row["load_percent"]),
        "operating_runtime_hours": _coerce_runtime_hours(idx),
        "sensor_temperature": float(raw_row["temperature"]),
        "sensor_vibration": float(raw_row["vibration"]),
        "sensor_rpm": int(round(float(raw_row["speed"]))),
        "sensor_current": _coerce_current_amperes(raw_row["current_percent"]),
        "health_anomaly_score": _coerce_anomaly_score(alarm_raw, idx),
        "alarm_code": alarm_raw,
        "warning_code": warning_raw,
        "fan_status": raw_row["fan_status"],
        "timestamp": raw_row["timestamp"],
    }


def _deterministic_shuffle(
    rows: List[dict[str, Any]],
    *,
    seed: int,
) -> List[dict[str, Any]]:
    """Shuffle ``rows`` with a fixed seed so reruns produce identical order.

    The competition dataset ships rows in timestamp order, which makes
    some downstream SQL tests brittle when they assume a uniform
    distribution. A deterministic shuffle (per-source) preserves the
    row content while giving every asset equal time on the head of the
    queue.
    """
    rng = random.Random(seed)
    shuffled = list(rows)
    rng.shuffle(shuffled)
    return shuffled


def load_competition_csv(
    *,
    sources: Optional[Iterable[CompetitionSource]] = None,
    repo_root: Optional[Path] = None,
    shuffle_seed: int = 20261018,
) -> Tuple[List[dict[str, Any]], int, dict[str, str]]:
    """Load, validate, and shuffle all competition CSVs.

    Returns a tuple ``(rows, skipped, source_sha256s)`` where ``rows`` is
    the list of dicts ready for BigQuery insertion, ``skipped`` is the
    count of malformed rows dropped during validation, and
    ``source_sha256s`` maps source tag -> hex SHA-256 so the caller can
    record it in the manifest. The loader does NOT insert into BigQuery
    — that is the caller's responsibility.
    """
    root = (repo_root or Path(__file__).resolve().parents[1]).resolve()
    sources_tuple = tuple(sources) if sources is not None else _default_sources(root)

    rows: List[dict[str, Any]] = []
    skipped = 0
    source_sha256s: dict[str, str] = {}

    for source in sources_tuple:
        if not source.csv_path.exists():
            raise FileNotFoundError(f"competition CSV missing: {source.csv_path}")
        sha = _file_sha256(source.csv_path)
        # SHA includes the source tag so re-runs that swap files detect it.
        source_sha256s[source.tag] = sha

        per_source: List[dict[str, Any]] = []
        # ``utf-8-sig`` strips the BOM the CSVs ship with (the first byte
        # is 0xEF 0xBB 0xBF — see head of the file); DictReader does not
        # strip it for us, so the first header column would otherwise
        # read as ``"\ufefftimestamp"``.
        with source.csv_path.open("r", encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            for idx, raw_row in enumerate(reader):
                try:
                    mapped = _row_to_payload(raw_row, idx=idx, source=source)
                    # Validate first, then dump so the loaded dict mirrors
                    # the post-coercion Pydantic state (e.g. empty
                    # ``alarm_code`` becomes ``None``, not ``""``).
                    payload = CompetitionTelemetryPayload.model_validate(mapped)
                    per_source.append(payload.model_dump())
                except Exception as exc:
                    skipped += 1
                    logger.warning(
                        "Skipping malformed competition row: source=%s idx=%d: %s",
                        source.tag,
                        idx,
                        exc,
                    )
                    continue

        per_source = _deterministic_shuffle(per_source, seed=shuffle_seed)
        rows.extend(per_source)

    return rows, skipped, source_sha256s


def summarize_ingestion(
    *,
    rows_loaded: int,
    rows_skipped: int,
    source_sha256: str,
    target_table: str,
    dry_run: bool = False,
) -> BigQueryIngestionSummary:
    """Build a ``BigQueryIngestionSummary`` with the current schema + redactor stamps.

    Pulled out as a helper so the CLI script and the BigQuery tool both
    stamp the same version pair on every manifest row.
    """
    return BigQueryIngestionSummary(
        rows_loaded=rows_loaded,
        rows_skipped=rows_skipped,
        source_sha256=source_sha256,
        schema_version=COMPETITION_SCHEMA_VERSION,
        redactor_version=_redaction_version(),
        target_table=target_table,
        dry_run=dry_run,
    )


def emit_staging_csv(rows: List[dict[str, Any]], output_path: Path) -> None:
    """Write ``rows`` as a stable BigQuery-ready staging CSV.

    The output is the same shape `manufacturing.competition_telemetry`
    expects on ``INSERT``. Columns are written in the order Pydantic
    dumps them so a re-run over the same input is byte-identical.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        output_path.write_text("", encoding="utf-8")
        return
    fieldnames = list(rows[0].keys())
    with output_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def write_seed_manifest(
    manifest_path: Path,
    *,
    summary: BigQueryIngestionSummary,
    source_sha256s: dict[str, str],
) -> None:
    """Write the ``artifacts/BQ_seed_manifest.json`` manifest.

    Contains the row counts, source SHA-256s, schema + redactor version
    stamps, and the target table. Recorded as plain JSON so it is easy
    to diff between re-runs.
    """
    import json

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "summary": summary.model_dump(),
        "source_files": [
            {
                "tag": tag,
                "sha256": sha,
            }
            for tag, sha in sorted(source_sha256s.items())
        ],
    }
    manifest_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


__all__ = [
    "COMPETITION_SCHEMA_VERSION",
    "CompetitionSource",
    "emit_staging_csv",
    "load_competition_csv",
    "summarize_ingestion",
    "write_seed_manifest",
]
