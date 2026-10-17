# Runbook: Seeding the BigQuery warehouse

> **Ticket:** TKT-070 / issue #268
> **Owner:** Kaizen Dev
> **Reviewed:** Kaizen Tech Lead
> **Last revised:** 2026-10-18

This runbook covers the local-emulator and live-BigQuery paths for seeding
the `manufacturing.*` warehouse tables (`traceability`,
`sensor_telemetry`, `sustainability_impact`, `competition_telemetry`).

The competition telemetry loader introduced by this runbook is
**idempotent**: re-running it over the same source CSV produces a
byte-identical staging CSV (deterministic shuffle, fixed schema version)
and an updated `artifacts/BQ_seed_manifest.json` with the row count,
source SHA-256, and version stamps.

## 1. Local emulator path (default)

The local `bigquery-emulator` container is provisioned by
`docker-compose.yml` and answers on `localhost:9050`. Set the env var in
`mise.local.toml` or on the command line before invoking the seed.

```bash
# One-time: spin up the emulator + reseed fixtures
mise run compose:up

# Run the seed against the emulator
BIGQUERY_EMULATOR_HOST=localhost:9050 \
GCP_PROJECT_ID=kaizen-local \
BIGQUERY_DATASET=manufacturing \
mise run seed

# Dry-run: parse CSVs + emit staging artefacts, no BigQuery writes
python scripts/seed_bigquery.py --dry-run

# Override staging output paths (useful for CI matrix runs)
python scripts/seed_bigquery.py --dry-run \
    --staging-csv /tmp/competition_telemetry.csv \
    --manifest /tmp/BQ_seed_manifest.json
```

Expected output:

```
INFO Successfully seeded N rows into kaizen-local.manufacturing.traceability
INFO Successfully seeded N rows into kaizen-local.manufacturing.sensor_telemetry
INFO Successfully seeded 2000 rows into kaizen-local.manufacturing.competition_telemetry (skipped 0 malformed)
INFO Seed summary: {"rows_loaded":2000,"rows_skipped":0,"source_sha256":"<hex>","schema_version":"2026-10-18.v1","redactor_version":"2026-10-18.v1","target_table":"kaizen-local.manufacturing.competition_telemetry","dry_run":false}
```

## 2. Inspecting the seed manifest

`artifacts/BQ_seed_manifest.json` records every important number from the
last successful seed run. Schema:

```json
{
  "summary": {
    "rows_loaded": 2000,
    "rows_skipped": 0,
    "source_sha256": "<hex>",
    "schema_version": "2026-10-18.v1",
    "redactor_version": "2026-10-18.v1",
    "target_table": "kaizen-local.manufacturing.competition_telemetry",
    "dry_run": false
  },
  "source_files": [
    { "tag": "normal",   "sha256": "<hex>" },
    { "tag": "abnormal", "sha256": "<hex>" }
  ]
}
```

- `source_sha256` is a composite of the per-file SHA-256 (sorted,
  newline-joined). Re-runs over identical CSVs produce identical values;
  any change to the source CSVs flips the digest.
- `schema_version` matches `COMPETITION_SCHEMA_VERSION` in
  `data/competition_loader.py`; bump it whenever the warehouse DDL or
  the loader's row-mapping shape changes.
- `redactor_version` matches `REDACTION_VERSION` in `data/redaction.py`;
  bump it whenever `BRAND_MAP` changes.

## 3. Verifying the seed

```bash
# Count rows in the warehouse
BIGQUERY_EMULATOR_HOST=localhost:9050 \
GCP_PROJECT_ID=kaizen-local \
python -c "
from google.cloud import bigquery
from google.auth.credentials import AnonymousCredentials
client = bigquery.Client(
    project='kaizen-local',
    credentials=AnonymousCredentials(),
    client_options={'api_endpoint': 'http://localhost:9050'},
)
for t in ('traceability', 'sensor_telemetry', 'competition_telemetry'):
    n = client.query(f'SELECT COUNT(*) AS n FROM kaizen-local.manufacturing.{t}').result().one().n
    print(f'{t}: {n}')
"

# Distribution per machine (S10)
python -c "
from backend.tools.bigquery_tool import query_competition_telemetry_distribution
print(query_competition_telemetry_distribution())
"
```

The Inspector logs `baseline source: competition_telemetry` once the
warehouse is non-empty; before any seed it logs
`baseline source: hardcoded fallback` (see
`backend/agents/agent_quality_inspector.py:check_spc_control_limits`).

## 4. Live BigQuery path (gated)

> **WARNING:** Production BigQuery writes are **cost-bearing** and
> **must not run without explicit user approval** (standing rule for
> this project). Local emulator coverage is the default validation
> surface.

Live seeding is gated behind the `mise run infra:seed` task and only
runs when:

1. `TF_VAR_project_id` is set in `mise.local.toml`.
2. The `infra:seed` task unsets `BIGQUERY_EMULATOR_HOST` and points
   `BIGQUERY_DATASET` at `terraform output -raw bigquery_dataset`.
3. The operator has the IAM role `roles/bigquery.dataEditor` on the
   target dataset.

```bash
# Plan first
mise run infra:plan

# Apply only after explicit user approval
mise run infra:apply

# Then seed the live warehouse (cost-bearing — confirm before running)
mise run infra:seed
```

If `TF_VAR_project_id` is unset the `infra:seed` command aborts with a
clear error and never reaches the BigQuery write path.

## 5. Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `RuntimeError: Competition CSV missing — restore the dataset or re-run mise run drive:pull` | The canonical CSVs were deleted from `data/datasets/competition/` | Run `mise run drive:pull` (gated by user approval) or restore from the version-controlled copies |
| `Skipping malformed competition row: source=normal idx=N: …` | A row in the source CSV violates `CompetitionTelemetryPayload` | Inspect the CSV around the reported index; the loader continues and records `rows_skipped` in the manifest |
| `BigQuery competition_telemetry distribution query failed` | Live BigQuery IAM or table missing | Re-run `mise run infra:apply` then `mise run infra:seed`; the helper falls back to empty distribution in mock mode |
| Inspector logs `baseline source: hardcoded fallback` after a seed | The warehouse table is empty (seed never ran or was rolled back) | Re-run `mise run seed` against the emulator; if still empty, check `artifacts/BQ_seed_manifest.json` for the row count |

## 6. Reference

- Plan: `<tech-lead-workspace>/plans/TKT-070-tech-plan.md`
- Loader: `data/competition_loader.py`
- Redactor: `data/redaction.py`
- CLI: `scripts/seed_bigquery.py`
- Runtime helper: `backend/tools/bigquery_tool.py:load_competition_telemetry`
- Distribution helper: `backend/tools/bigquery_tool.py:query_competition_telemetry_distribution`
- DDL: `data/schemas/bigquery_tables.sql`
- Pydantic model: `backend/core/models.py:CompetitionTelemetryPayload`