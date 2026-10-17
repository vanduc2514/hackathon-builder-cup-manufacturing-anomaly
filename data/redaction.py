"""Brand and PII redaction map — single source of truth for telemetry ingestion.

TKT-070 / issue #268 — Competition telemetry seed path. This module is the
single source of truth for the brand redaction map (``BRAND_MAP``) plus the
versioned redactor stamp (``REDACTION_VERSION``) that every ingestion
summary records.

The same constants will eventually be imported by ``scripts/sync_gdrive_kb.py``
(TKT-069 / issue #267) once PR #282 merges to ``main``; today both files hold
a verbatim copy to keep the open branches independent (Tech Lead verdict on
issue #268).

Importing this module is side-effect-free: no GCP, Drive, or BigQuery
imports are pulled in here so it stays cheap to load from tests and from
the production seed script alike.
"""

from __future__ import annotations

# Versioned stamp baked into every ingestion summary (`BigQueryIngestionSummary.redactor_version`).
# Bump only when ``BRAND_MAP`` changes; the date+revision pattern matches the
# competition schema versioning used by ``COMPETITION_SCHEMA_VERSION`` so the
# two stamps can be compared in the seed manifest without surprise.
REDACTION_VERSION: str = "2026-10-18.v1"

# Brand names and proprietary identifiers that must NOT be exposed in any
# telemetry, KB, or RAG artifact emitted by the project. Verbatim copy from
# ``scripts/sync_gdrive_kb.py:77`` (PR #282 / commit ``29759ff``); consolidation
# into a single import path will follow once that PR lands.
BRAND_MAP: dict[str, str] = {
    "mitsubishi": "drive_oem_a",
    "mds-e/eh": "drive_series_a",
    "mds-eh": "drive_series_a",
    "mds-e": "drive_series_a",
}

__all__ = ["BRAND_MAP", "REDACTION_VERSION"]
