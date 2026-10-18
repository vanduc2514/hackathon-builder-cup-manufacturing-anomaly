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
*Note on Edge Architecture:* The Gemma 3 edge classifier runs exclusively on-premises (factory floor IPC, Jetson, or local edge simulator) by design. Processing high-resolution optical frames locally guarantees sub-50ms latency for physical pneumatic scrap diverters, drops >95% of normal inspection frames before network egress, and safeguards factory IP. Cloud Run hosts only the ADK Multi-Agent Orchestrator and Gemini 2.0 reasoning services; Cloud Run and Terraform intentionally do not provision an Ollama/Gemma host.


**Phase B — Tracing & Root Cause**
Three agents work in parallel:
- **Traceability Agent** — cross-references BigQuery discrete event logs to isolate which machine, tool, operator, and raw-material lot produced the defective parts.
- **Process Analyst Agent** — pulls telemetry (vibration, temperature, current) for only the suspect machine in the suspect time window.
- **Root Cause Agent** — synthesises 5-Whys and Ishikawa analysis using Vertex AI Search over maintenance logs, equipment manuals, and historical 8D reports.

**Phase C — Resolution**
The **Technician Copilot** streams real Gemini replies (grounded in the incident board, SOP snippets and the technician's photo) to the technician's phone, which speaks them aloud in English; the technician taps scripted prompts. The **Incident Scribe** simultaneously generates a draft 8D report and corrective work order for human review.

**Phase D — Verification & Learning**
The Orchestrator has the **Quality Inspector** count post-repair products and holds the incident open until *N* consecutive products pass the inspection gate. On closure, the **Continuous Learning Agent** returns a knowledge entry and a sustainability impact card (scrap avoided, downtime saved, energy and CO₂ reduction), which the Orchestrator indexes into the vector knowledge base and publishes; the shift leader's approval goes back to the Orchestrator.

**Shared state** flows through a **Blackboard** (Firestore-backed) exposed to the dashboard via Server-Sent Events (SSE). The Orchestrator is the single entry and exit point: it receives every input (defect events, technician input, shift-leader approval), hands the board to the agent it calls, records the finding the agent returns, and is the only writer of the Blackboard.

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
mise run install      # pip install backend deps + npm install apps/web and apps/mobile
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

# LLM provider for the ADK agents: "ollama" (local, default) or "gemini" (deploy)
AI_PROVIDER                    = "ollama"
OLLAMA_API_BASE                = "http://localhost:11434"  # read by LiteLLM
# OLLAMA_MODEL                 = "gemma2:2b"            # default; must be pulled via `ollama pull`
# GOOGLE_API_KEY               = "..."                  # required when AI_PROVIDER = "gemini"
# GEMINI_MODEL                 = "gemini-flash-latest"  # default
```

With `AI_PROVIDER=gemini` and no `GOOGLE_API_KEY`/`GEMINI_API_KEY`, the backend refuses to start.

mise automatically merges `mise.local.toml` on top of `mise.toml` when you `cd` into the directory, so any task run via `mise run` will pick up these variables without extra shell exports.

Local development works without GCP credentials — start the local BigQuery emulator (`mise run emulator`) or leave it unset to automatically fall back to mock data.

Frontend dev ports come from `WEB_PORT` (3000) and `MOBILE_PORT` (3001), and the Vite `/api` proxy target from `API_PROXY_TARGET` (defaults to `http://localhost:$API_PORT`), all in `mise.toml`; override them in `mise.local.toml`.

Both apps open on a login screen. Every `/api/*` route needs a token from `POST /api/auth/login`; only `/health` and `/api/auth/*` are public. The web dashboard signs in the shift leader and the mobile app signs in the technician: each screen shows the role and asks only for the password (with a show/hide toggle; the browser can save it). Accounts and passwords come from `AUTH_USERS` in `mise.toml` (dev: `technician` / `4NpqbcqiOB4v9Ry6`, `shiftleader` / `REA5Dvx8VjGKdccg`); `/api/auth/accounts` never returns passwords. Each account keeps a `display_name` on the backend, but the apps only show the role name. Roles are display-only. The `demo*` and `sim:*` curl tasks fetch a token via `scripts/dev_token.py`. In production the passwords come from the private `TF_VAR_auth_users` (same JSON shape) in `mise.local.toml`, followed by `mise run infra:apply`. If it is unset, login returns 503.

Calls with a valid token, including the SSE/WebSocket streams, are rate limited in-process per user (`backend/core/rate_limit.py`):
- 300 requests/min overall (`RATE_LIMIT_PER_MINUTE`).
- 30 writes/min for POST/PUT/PATCH/DELETE (`RATE_LIMIT_WRITE_PER_MINUTE`).
- 10 concurrent streams (`RATE_LIMIT_MAX_STREAMS`).

Anonymous calls (`/health`, `/api/auth/*`, requests with a missing or invalid token) are not limited. Behind Firebase Hosting the client IP is not reliably known, so an IP-keyed limit would let one caller throttle every user. Failed logins do not lock accounts either.

Over-limit calls get `429` with `Retry-After`; over-limit WebSockets are closed with code 1008. `RATE_LIMIT_ENABLED=false` turns limiting off. Counters live in the process, which is correct only while Cloud Run keeps `max_instances = 1`.

### 3. Run the full stack

```bash
# Backend (FastAPI :8000) + web dashboard (Vite :3000) + mobile app (Vite :3001) + ADK dev UI (:8001) in parallel
mise run dev -j4
```

Or run each side independently:

```bash
mise run backend    # FastAPI with auto-reload
mise run web        # Plant Ops dashboard (apps/web, :3000)
mise run mobile     # Technician mobile app (apps/mobile, :3001)
mise run adk-web    # ADK dev UI: incident workflow graph + per-node events (app "agents")
```

### 4. Trigger the demo

With the backend running, inject a synthetic defect to see the full 90-second multi-agent incident loop:

```bash
mise run demo
```

Then open `http://localhost:3000` (Plant Ops dashboard), `http://localhost:3001` (technician mobile app) or `http://localhost:8000` (FastAPI backend).

### Other useful commands

```bash
mise run test           # run pytest
mise run seed           # seed mock BigQuery / Firestore data
mise run emulator       # start local BigQuery emulator (:9050)
mise run emulator:down  # stop BigQuery emulator
mise run docker:up      # start full stack via docker compose
adk run backend/agents '{}'  # run one incident workflow in the terminal
mise run build          # production build of apps/web + apps/mobile
mise run typecheck      # tsc --noEmit for both apps
mise run web:preview    # serve apps/web/dist on :3000
mise run mobile:preview # serve apps/mobile/dist on :3001
```

### Deployment

- Backend: `mise run deploy:backend` builds the container and deploys it to Cloud Run.
- Frontend hosting (`apps/web`, `apps/mobile`) is documented in [`docs/deployment-frontend.md`](docs/deployment-frontend.md) (not yet automated).

---

## License

MIT © 2024 Kaizen Agent Contributors
