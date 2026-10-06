---
name: cloud-logging
metadata:
  version: "1.0.0"
  category: CloudObservabilityAndMonitoring
description: >-
  Generates Logging Query Language (LQL) queries and troubleshoots Google Cloud Logging for Kaizen Agent.
  Use when inspecting Cloud Run container logs (backend, ADK orchestrator), debugging agent state transitions,
  investigating Gemini Live WebSocket disconnects, querying BigQuery audit logs, or tracking SPC threshold breaches.
---

# Cloud Logging Skill: LQL Queries & Diagnostics

Google Cloud Logging aggregates logs across all deployed services in Kaizen Agent. In production, FastAPI server requests, asynchronous ADK agent findings, WebSocket live streams, and BigQuery query jobs emit structured log entries to Google Cloud Logging.

## Core Rules for Logging Query Language (LQL)

1. **Strict Syntax Requirements**:
   - **Always use double quotes (`"`)** for string literals; never single quotes (`'`).
   - Write boolean operators in uppercase: `AND`, `OR`, `NOT`.
   - Use parentheses to explicitly group logical conditions.
2. **Resource Type Accuracy**:
   - Cloud Run Service: `resource.type="cloud_run_revision"`
   - BigQuery: `resource.type="bigquery_project"` or `resource.type="bigquery_dataset"`
3. **Filtering by Fields**:
   - Service name: `resource.labels.service_name="kaizen-backend"`
   - Severity levels: `severity>=WARNING`, `severity=ERROR`
   - JSON payload properties: `jsonPayload.incident_id="INC-2026-001"`

---

## Key References

- **Cloud Run Logging Queries**: Inspecting request traces, agent exceptions, and WebSocket streaming. See [references/query_cloud_run.md](references/query_cloud_run.md)
- **BigQuery Audit & Query Logs**: Diagnosing slow SQL queries and emulator sync errors. See [references/query_bigquery.md](references/query_bigquery.md)

---

## 1. Essential Kaizen LQL Queries

### Find All Agent Errors on Cloud Run
```lql
resource.type="cloud_run_revision"
AND resource.labels.service_name="kaizen-backend"
AND severity>=ERROR
```

### Trace All Log Events for a Specific Incident
```lql
resource.type="cloud_run_revision"
AND resource.labels.service_name="kaizen-backend"
AND (jsonPayload.incident_id="INC-2026-0312-001" OR textPayload=~"INC-2026-0312-001")
```

### Monitor SPC Control Limit Breaches
```lql
resource.type="cloud_run_revision"
AND (jsonPayload.agent="quality_inspector" OR textPayload=~"SPC breach")
AND severity>=WARNING
```

### Debug Gemini Live WebSocket Connections
```lql
resource.type="cloud_run_revision"
AND (textPayload=~"routes_gemini_live" OR textPayload=~"WebSocket")
AND severity>=WARNING
```

---

## 2. Reading Logs via `gcloud` CLI

```bash
# Stream latest backend logs in real time
gcloud logging tail 'resource.type="cloud_run_revision" AND resource.labels.service_name="kaizen-backend"'

# Read last 50 error entries formatted as JSON
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' --limit=50 --format=json
```
