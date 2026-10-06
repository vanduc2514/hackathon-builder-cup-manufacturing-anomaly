# Kaizen Agent

> **Product-first AI team for manufacturing anomaly detection and root-cause tracing.**

Kaizen Agent is an autonomous multi-agent system built for small and mid-size factories in Southeast Asia. It watches finished products leaving the production line, detects quality defects the moment they appear, traces the defect back to its exact machine / tool / material / process root cause, guides the on-floor technician through the repair in their native language, and closes the incident only after the product itself confirms the fix — all in under 90 seconds.

The name comes from the Japanese manufacturing philosophy of *continuous improvement* (改善). The system is designed to embed that loop directly into real-time operations.

---

## Why product-first?

Most factory monitoring systems start from machine sensors. Kaizen Agent starts from the **product**.

A machine can be silently producing scrap for hours while every sensor reads "normal". Only the product tells the truth. By anchoring detection at the inspection station and working *backwards* through traceability data to the responsible machine and time window, the system narrows the root-cause search space before it ever queries a sensor — making analysis faster, more accurate, and independent of sensor coverage gaps.

---

## Architecture overview

The system is organised into four sequential phases, coordinated by a central **Orchestrator** built on Google ADK:

**Phase A — Detection**
A Gemma 3-powered edge gateway at the camera inspection station classifies product defects in real time and publishes anomaly events when the defect rate breaches the Statistical Process Control (SPC) upper control limit.

**Phase B — Tracing & Root Cause**
Three agents work in parallel:
- **Traceability Agent** — cross-references BigQuery discrete event logs to isolate which machine, tool, operator, and raw-material lot produced the defective parts.
- **Process Analyst Agent** — pulls telemetry (vibration, temperature, current) for only the suspect machine in the suspect time window.
- **Root Cause Agent** — synthesises 5-Whys and Ishikawa analysis using Vertex AI Search over maintenance logs, equipment manuals, and historical 8D reports.

**Phase C — Resolution**
The **Technician Copilot** opens a Gemini Live multimodal session — voice plus camera — guiding the technician through the repair procedure in Vietnamese (or any configured language). The **Incident Scribe** simultaneously generates a draft 8D report and corrective work order for human review.

**Phase D — Verification & Learning**
The **Quality Inspector** holds the incident open until *N* consecutive products pass the inspection gate. On closure, the **Continuous Learning Agent** indexes the resolution into the vector knowledge base and publishes a sustainability impact card (scrap avoided, downtime saved, energy and CO₂ reduction).

**Shared state** flows through a **Blackboard** (Firestore-backed) that all agents read from and write to, exposed to the dashboard via Server-Sent Events (SSE).

**Tech stack:** Python 3.11 · FastAPI · Google ADK · Gemini 2.0 · Gemma 3 Edge · Vertex AI Search · BigQuery / bigquery-emulator · Firestore · Pub/Sub · React + Vite + TypeScript

---

## Quickstart

### Prerequisites
- [mise](https://mise.jdx.dev) — manages Python 3.11 and Node 22 automatically
- Docker (optional, for running `goccy/bigquery-emulator` locally)
- Google Cloud project with BigQuery, Firestore, and Vertex AI enabled (for production; mock data works locally without credentials)

### 1. Clone and install

```bash
git clone https://github.com/your-org/kaizen-agent.git
cd kaizen-agent

mise install          # provisions Python 3.11 + Node 22 + .venv
mise run install      # pip install backend deps + npm install frontend deps
```

### 2. Configure environment

Create a `mise.local.toml` at the repo root to set machine-local overrides (this file is gitignored):

```toml
# mise.local.toml — local secrets and overrides, never committed
[env]
GCP_PROJECT_ID                 = "your-gcp-project"
GOOGLE_APPLICATION_CREDENTIALS = "/absolute/path/to/service-account.json"
APP_ENV                        = "development"

# Optional: target local BigQuery emulator for dev parity without GCP
# BIGQUERY_EMULATOR_HOST       = "http://localhost:9050"
```

mise automatically merges `mise.local.toml` on top of `mise.toml` when you `cd` into the directory, so any task run via `mise run` will pick up these variables without extra shell exports.

Local development works without GCP credentials — start the local BigQuery emulator (`mise run emulator`) or leave it unset to automatically fall back to mock data.

### 3. Run the full stack

```bash
# Backend (FastAPI on :8000) + Frontend (Vite on :3000) in parallel
mise run dev -j2
```

Or run each side independently:

```bash
mise run backend    # FastAPI with auto-reload
mise run frontend   # Vite dev server
```

### 4. Trigger the demo

With the backend running, inject a synthetic defect to see the full 90-second multi-agent incident loop:

```bash
mise run demo
```

Then open `http://localhost:3000` (frontend) or `http://localhost:8000` (FastAPI backend) to watch the live dashboard.

### Other useful commands

```bash
mise run test           # run pytest
mise run seed           # seed mock BigQuery / Firestore data
mise run emulator       # start local BigQuery emulator (:9050)
mise run emulator:down  # stop BigQuery emulator
mise run docker:up      # start full stack via docker compose
```

---

## License

MIT © 2024 Kaizen Agent Contributors
