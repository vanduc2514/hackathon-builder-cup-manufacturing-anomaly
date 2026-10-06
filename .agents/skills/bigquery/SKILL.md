---
name: bigquery
metadata:
  version: "1.0.0"
  category: BigDataAndAnalytics
description: >-
  Manages BigQuery datasets, tables, SQL queries, and local dev emulation in Kaizen Agent.
  Use when writing BigQuery queries, managing schemas (traceability, sensor telemetry),
  running goccy/bigquery-emulator on port 9050, seeding mock data (mise run seed),
  or diagnosing slow, failing, or expensive BigQuery jobs.
---

# BigQuery Skill: Operations, Local Emulation & Troubleshooting

This skill covers working with Google BigQuery in the Kaizen Agent architecture, including cloud production datasets, the local `goccy/bigquery-emulator`, and diagnostic troubleshooting for broken or slow queries.

## Key Capabilities & References

- **Local Dev Parity & goccy Emulator**: Starting emulator on port 9050, seeding schemas, zero-cloud fallback. See [references/local-emulator.md](references/local-emulator.md)
- **CLI & bq Usage**: Managing datasets, running queries, inserting data via CLI. See [references/cli-usage.md](references/cli-usage.md)
- **Python Client Library**: `google-cloud-bigquery` patterns used in `backend/tools/bigquery_tool.py`. See [references/client-library-usage.md](references/client-library-usage.md)
- **Core Concepts**: Partitioning, clustering, and storage architecture. See [references/core-concepts.md](references/core-concepts.md)
- **Troubleshooting & Diagnostics**:
  - Investigating Query Plans & Execution Graphs: See [references/query_plan_execution_graph.md](references/query_plan_execution_graph.md)
  - Analyzing Compute Resource Contention: See [references/performance_resource_contention.md](references/performance_resource_contention.md)
  - On-Demand Compute Spend & Optimization: See [references/cost_compute_ondemand.md](references/cost_compute_ondemand.md)

---

## 1. Quick Local Workflow

To work with BigQuery locally without Google Cloud credentials:

```bash
# 1. Start the emulator
mise run emulator

# 2. Seed tables (traceability, telemetry, sustainability impact)
mise run seed

# 3. Verify in test suite
pytest tests/tools/test_bigquery_tool.py
```

Environment settings in `mise.local.toml` / `.env`:
```toml
GCP_PROJECT_ID         = "kaizen-local"
BIGQUERY_EMULATOR_HOST = "http://localhost:9050"
BIGQUERY_DATASET       = "manufacturing"
```

---

## 2. Production Cloud BigQuery

In production (e.g. Cloud Run), omit `BIGQUERY_EMULATOR_HOST`. The client library automatically connects to Google Cloud BigQuery using Application Default Credentials (ADC):

```bash
# Set production project
gcloud config set project kaizen-agent-prod

# Query production dataset
bq query --use_legacy_sql=false \
  'SELECT count(*) FROM `kaizen-agent-prod.manufacturing.traceability`'
```

---

## 3. Schemas in Kaizen Architecture

All DDL table definitions follow the standard manufacturing analytics schema:
- `manufacturing.traceability`: Discrete component tracking (`product_id`, `machine_id`, `tool_id`, `lot_id`, `operator_id`, `timestamp`).
- `manufacturing.sensor_telemetry`: High-frequency sensor streams (`vibration_rms`, `spindle_temp_c`, `current_draw_a`, `rpm`).
- `manufacturing.sustainability_impact`: Avoided waste and emissions (`avoided_scrap_kg`, `avoided_co2_kg`, `avoided_kwh`, `cost_avoided_usd`).

Tool implementations query these tables via parameter-bounded time windows (e.g. suspect machine ID and last 30 minutes) to minimize query scan costs.

---

## 4. Troubleshooting Checklist

| Symptom | Probable Cause | Action |
|---|---|---|
| `ConnectionRefusedError: [Errno 61]` | Emulator container is stopped | Run `mise run emulator` or check `docker ps` |
| `Not found: Dataset kaizen-local:manufacturing` | Dataset has not been seeded | Run `mise run seed` |
| `403 Access Denied` (Cloud) | Missing BigQuery Data Viewer/User role | Verify `gcloud auth application-default login` |
| Slow query on `sensor_telemetry` | Missing partition filter on `timestamp` | Add `WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 MINUTE)` |
| `Query exceeded resource limits` | Excessive scan or unindexed join | Review query plan via [references/query_plan_execution_graph.md](references/query_plan_execution_graph.md) |
