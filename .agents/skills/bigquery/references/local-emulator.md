# BigQuery Local Development Parity & Emulator Guide

This reference provides instructions for running and developing with Google BigQuery locally using `goccy/bigquery-emulator`.

## Architecture & Zero-Cloud Guarantee

In accordance with the project's Zero-Cloud Guarantee (Key Invariant 4), developers and automated tests should never fail due to missing Google Cloud credentials. 

```
                                      ┌───► Cloud BigQuery (production / GCP ADC)
BigQuery Client Tool ─────────────────┼───► goccy/bigquery-emulator (localhost:9050)
                                      └───► In-Memory Mock Fallback (CSV fallback)
```

## Running the Emulator Locally

### 1. Start the Docker Container
Via `mise`:
```bash
mise run emulator
```
Or directly via Docker Compose:
```bash
docker compose up -d bigquery-emulator
```
The emulator listens on `localhost:9050` with project ID `kaizen-local`.

### 2. Configure Environment (`mise.local.toml` / `.env`)
```toml
[env]
APP_ENV = "development"
GCP_PROJECT_ID = "kaizen-local"
BIGQUERY_EMULATOR_HOST = "http://localhost:9050"
BIGQUERY_DATASET = "manufacturing"
```

### 3. Seed Schema & Synthetic Telemetry
To create the dataset tables (`traceability`, `sensor_telemetry`, `sustainability_impact`) and insert initial records:
```bash
mise run seed
```
This executes the BigQuery DDL schema definitions and seeds initial mock traceability and telemetry records.

## Verification & Queries

Query the local emulator using `curl` or Python client:
```bash
curl -X POST http://localhost:9050/queries \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM `kaizen-local.manufacturing.traceability` LIMIT 5;"}'
```

Or run the backend integration test:
```bash
pytest tests/tools/test_bigquery_tool.py
```

## Troubleshooting Local Emulator

- **Port Conflict (`9050` in use):**
  Check what is bound: `lsof -i :9050`. Terminate orphaned emulator containers: `docker kill $(docker ps -q --filter ancestor=ghcr.io/goccy/bigquery-emulator)`.
- **Connection Refused:**
  Ensure the container is healthy: `docker ps | grep bigquery-emulator`. Inspect logs: `docker logs kaizen-bigquery-emulator`.
- **Dataset Not Found:**
  Re-run `mise run seed` to regenerate tables and schemas.
