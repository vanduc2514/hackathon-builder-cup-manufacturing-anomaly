# AGENTS.md — Kaizen Agent Contributor Guide

This file is the authoritative reference for AI coding agents and human contributors working on this repository. Read it before writing any code.

---

## Project Layout

```
.
├── backend/                    # Python — FastAPI server, AI agents, tools
│   ├── agents/                 # orchestrator.py + one agent_<name>.py per LLM agent node
│   │   ├── agent.py            # ADK CLI entry (root_agent) for `mise run adk-web` / `adk run`
│   │   ├── orchestrator.py     # ADK graph Workflow (no LLM) + Orchestrator runner; routes the agent_* nodes
│   │   ├── workflow_nodes.py   # Workflow function nodes: Blackboard writes + routing gates
│   │   ├── tool_guards.py      # Callbacks every tool-using agent sets: 3 tool calls/turn, ValueError → tool result
│   │   ├── agent_quality_inspector.py
│   │   ├── agent_traceability.py
│   │   ├── agent_process_analyst.py
│   │   ├── agent_root_cause.py
│   │   ├── agent_technician_copilot.py
│   │   ├── agent_incident_scribe.py
│   │   └── agent_continuous_learning.py
│   ├── api/                    # FastAPI routers
│   │   ├── main.py             # App factory, mounts routers
│   │   ├── routes_incidents.py # SSE stream + incident read endpoints
│   │   ├── routes_simulation.py# Demo inject / reset endpoints
│   │   ├── routes_auth.py      # Public login + demo-account endpoints
│   │   └── routes_gemini_live.py
│   ├── core/                   # Shared primitives (import freely)
│   │   ├── models.py           # Pydantic schemas — single source of truth
│   │   ├── blackboard.py       # Reactive shared state (asyncio + SSE)
│   │   ├── config.py           # Settings read from env vars (provided by mise)
│   │   └── auth.py             # Login, signed tokens, require_user dependency
│   ├── edge/                   # Edge device code (Gemma classifier, MQTT bridge)
│   │   ├── gateway/
│   │   └── simulator/          # Local mock of edge hardware for dev
│   ├── tools/                  # Stateless ADK tool functions
│   │   ├── bigquery_tool.py    # Traceability + telemetry queries
│   │   ├── spc_calculator.py
│   │   ├── impact_calculator.py
│   │   └── rag_search_tool.py
│   └── requirements.txt
│
├── simulator/                  # Standalone Factory & Conveyor Simulator Service
│   ├── config.py               # Settings (broker host, port, tick speed)
│   ├── models.py               # Pydantic schemas for machine & conveyor packets
│   ├── machine_simulator.py    # Multi-CNC telemetry generator (vibration, current)
│   ├── conveyor_simulator.py   # Discrete serialization & optical inspection
│   ├── mqtt_publisher.py       # Async EMQX MQTT publisher
│   └── main.py                 # Service runner & CLI entrypoint
│
├── apps/                       # Frontend apps (React + Vite + TypeScript)
│   ├── web/                    # Plant Ops dashboard (desktop, :3000)
│   │   ├── src/
│   │   ├── vite.config.ts      # Dev proxy: /api, /health → $API_PROXY_TARGET
│   │   └── package.json
│   └── mobile/                 # Technician mobile app (:3001)
│       ├── src/
│       ├── vite.config.ts      # Dev proxy: /api (+ WebSocket) → $API_PROXY_TARGET
│       └── package.json
│
├── data/
│   ├── datasets/               # Raw / mock sensor and traceability data
│   ├── knowledge_base/         # PDFs, maintenance logs, 8D reports for RAG
│   └── schemas/                # BigQuery DDL and Firestore schema definitions
│
├── infra/                      # Terraform: all GCP resources (mise run infra:*)
│   ├── bootstrap/              # One-time GCS state bucket (local state)
│   └── terraform/              # Main stack: Cloud Run, IAM, BigQuery, Pub/Sub, Firestore, Vertex Search, Firebase Hosting, budget, monitoring dashboard + owner email alerts
│
├── firebase.json               # Firebase Hosting targets web/mobile (apps/*/dist); /api/** rewritten to Cloud Run
├── docs/                       # Architecture diagrams (.mmd + rendered .svg)
├── tests/                      # pytest test suite (mirrors backend/ structure)
├── mise.toml                   # Tool versions + all dev tasks (canonical runner)
├── docker-compose.yml          # Local multi-service compose (incl. bigquery-emulator)
├── .gitignore
├── README.md
└── AGENTS.md                   # ← this file
```

---

## Coding Conventions

### Python (backend/)

- **Style:** PEP 8, enforced via `ruff` (line length 100). Do not use `black` separately — `ruff format` handles formatting.
- **Type hints:** Required on all public functions and class methods. Use `from __future__ import annotations` at the top of every module.
- **Pydantic:** All data flowing between agents and the API **must** be defined as a Pydantic model in `backend/core/models.py`. Never define ad-hoc dicts for inter-agent data.
- **Async:** All agent logic and API handlers must be `async def`. Do not call blocking I/O inside coroutines — use `asyncio.to_thread` if necessary.
- **Imports:** Absolute imports only (`from backend.core.models import ...`). No relative imports (`from ..core`).
- **Module docstring:** Every file must open with a one-line `"""..."""` docstring describing its responsibility.
- **No print():** Use Python `logging` (`import logging; logger = logging.getLogger(__name__)`). The `config.py` sets the log level from the environment.
- **Secrets:** Never hardcode credentials. All secrets come from environment variables via `backend/core/config.py` (pydantic-settings).

```python
# Good
from __future__ import annotations
"""Quality Inspector agent: detects SPC breaches and opens incidents."""

import logging
from backend.core.models import AgentFinding

logger = logging.getLogger(__name__)

async def inspect(defect_rate: float) -> AgentFinding:
    ...
```

### TypeScript / React (apps/web, apps/mobile)

- **Language:** TypeScript (`.ts`, `.tsx`) with strict type checking enabled (`strict: true`). Avoid `any`; define domain types in `apps/<app>/src/types/` mirroring backend Pydantic models.
- **Style:** ESLint + Prettier (2-space indent, single quotes, semicolons allowed).
- **Components:** Functional components only — no class components. One component per file. File name matches the exported component name.
- **Props:** Strongly typed via interfaces. Destructure props in the function signature.
- **State:** Local `useState<T>` / `useReducer` for UI-only state. Global incident state comes via the SSE hook — do not duplicate it in Redux/Zustand unless the app grows to need it.
- **API calls:** All `/api/*` calls are proxied by Vite in dev and by the server in prod. Never hardcode `localhost:8000` in component code — use relative paths.

```tsx
// Good
import React from 'react';

interface SpcChartProps {
  bars: number[];
  ucl: number;
}

export default function SpcChart({ bars, ucl }: SpcChartProps): React.ReactElement {
  return <canvas aria-label="SPC defect rate chart" />;
}
```

### General

- **No commented-out code** in commits. Use `git stash` or a feature branch instead.
- **Test coverage:** Any new function in `backend/tools/` or `backend/core/` must have a corresponding test in `tests/`.
- **Environment parity:** Code must work with mock data when `GCP_PROJECT_ID` is unset. Never assume live GCP services in local dev paths.

## Google Drive Source

The team's competition documents are stored in external Google Drive and accessed directly via the `backend/tools/gdrive_tool.py` connector:

- **Folder:** `💻 Competition | AI Builder Cup`
- **Integration:** Native Google Drive API v3 (`googleapiclient`) + Vertex AI Search Hybrid Pipeline
- **Authentication:** Application Default Credentials (ADC) in production (Cloud Run); graceful mock fallback in local dev without credentials
- **Local Cache:** `.cache/gdrive/` (gitignored; on-demand cache)

### Retrieving and Querying Content

Kaizen integrates Google Drive directly into the RAG pipeline (`backend/tools/gdrive_tool.py` and `backend/tools/rag_search_tool.py`) without checking raw documents into git.
- **Hybrid Retrieval:** Vertex AI Search handles semantic causal discovery, while Google Drive API v3 provides exact part code (`WNMG-080408`) and specification retrieval via Reciprocal Rank Fusion (RRF).
- **Format Agnostic:** Word documents (`.docx`) and Excel spreadsheets (`.xlsx`) are parsed directly in memory via `python-docx` and `openpyxl` without disk writes.
- **Dev Tasks:** Developer sync utilities remain available via `mise run drive:pull` and `mise run drive:auth` for manual asset inspection.

---

## GitHub Project

Project backlog, epics, issues, and sprint planning are tracked on GitHub Projects (v2):

- **Project Name:** `@vanduc2514's hackathon-builder-cup-manufacturing-anomaly`
- **Project Number:** `3`
- **Project URL:** [https://github.com/users/vanduc2514/projects/3](https://github.com/users/vanduc2514/projects/3)

### CLI Operations

```bash
# View project details
gh project view 3 --owner vanduc2514

# List all items on the board
gh project item-list 3 --owner vanduc2514
```

---

## Commit Convention

Follow **Conventional Commits** (`<type>(<scope>): <subject>`).

### Types

| Type | When to use |
|---|---|
| `feat` | New user-facing feature or agent capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring with no behaviour change |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Tooling, deps, config (mise, gitignore, CI) |
| `perf` | Performance improvement |
| `style` | Formatting, linting (no logic change) |

### Scopes

Use the top-level area affected: `backend`, `web`, `mobile`, `agents`, `api`, `core`, `edge`, `tools`, `data`, `docs`, `ci`.

### Examples

```
feat(agents): add process analyst vibration spike detection
fix(api): handle missing confidence field in LEARN agent finding
refactor(core): extract blackboard subscriber cleanup into context manager
test(tools): add unit tests for spc_calculator UCL logic
docs: update architecture overview in README
chore(mise): migrate all Makefile tasks to mise.toml
```

### Rules

- Subject line: imperative mood, lowercase, no trailing period, max 72 chars.
- Body (optional): explain *why*, not *what*. Reference issue numbers with `Fixes #123`.
- Breaking changes: add `!` after the type (`feat!:`) and a `BREAKING CHANGE:` footer.

---

## Branching Convention

```
main                  — production-ready; protected; merge via PR only
└── dev               — integration branch; all features merge here first
    ├── feat/<name>   — new features
    ├── fix/<name>    — bug fixes
    ├── refactor/<name>
    ├── chore/<name>  — tooling / config
    └── docs/<name>   — documentation only
```

### Rules

- Branch off `dev`, not `main`.
- Use kebab-case for branch names: `feat/traceability-batch-query`, `fix/sse-reconnect`.
- Keep branches short-lived. Merge or rebase within the same sprint.
- Delete the branch after merging.
- `main` only receives merges from `dev` via a reviewed PR. Direct pushes to `main` are blocked.

---

## Git Worktree Protocol (Mandatory for Implementations)

All feature development, bug fixes, refactoring, and code implementations **must be executed inside a dedicated Git worktree** rather than directly switching branches in the primary repository checkout. This isolates dependencies, builds, and working trees, preventing accidental contamination across tasks.

### Worktree Directory Root Structure

To keep all active worktrees isolated and organized under one single root across tasks:

- **Worktree Root Path:** `~/.gemini/antigravity/worktrees/hackathon-builder-cup-manufacturing-anomaly/` (or expanded: `$HOME/.gemini/antigravity/worktrees/hackathon-builder-cup-manufacturing-anomaly/`)
- **Naming Pattern:** `<worktree-root>/<branch-name>` (the worktree folder name **must match the branch name**, e.g. `feat/spc-ucl-rules` or `feat/factory-simulator`)

*(Note: Always use `$HOME` or `~` so paths dynamically resolve across different teammates' workstations without hardcoding specific usernames).*

Example directory structure:
```
$HOME/.gemini/antigravity/worktrees/hackathon-builder-cup-manufacturing-anomaly/
├── feat/spc-ucl-rules/                               # Worktree for branch feat/spc-ucl-rules
└── feat/factory-simulator/                           # Worktree for branch feat/factory-simulator
```

### Worktree Lifecycle Workflow

1. **Set Root & Fetch Remote:**
   ```bash
   WORKTREE_ROOT="$HOME/.gemini/antigravity/worktrees/hackathon-builder-cup-manufacturing-anomaly"
   mkdir -p "$WORKTREE_ROOT"

   git fetch origin dev
   ```

2. **Create Worktree & Track Remote Branch:**
   Ensure the directory name matches the branch name and explicitly tracks `origin/dev`:
   ```bash
   BRANCH_NAME="feat/<feature-name>"

   # When creating a new branch tracking origin/dev:
   git worktree add --track -b "$BRANCH_NAME" "$WORKTREE_ROOT/$BRANCH_NAME" origin/dev

   # Or if the branch already exists on remote origin:
   git fetch origin "$BRANCH_NAME"
   git worktree add --track -b "$BRANCH_NAME" "$WORKTREE_ROOT/$BRANCH_NAME" "origin/$BRANCH_NAME"
   ```

3. **Navigate and Setup Environment:**
   ```bash
   cd "$WORKTREE_ROOT/$BRANCH_NAME"
   mise install
   ```

4. **Develop, Commit & Push:**
   Follow Conventional Commits. Push and set upstream if needed (`git push -u origin "$BRANCH_NAME"`).

5. **Clean Up After Merge:**
   Once the PR is merged to `dev`, remove the worktree and clean up the local tracking branch:
   ```bash
   git worktree remove "$WORKTREE_ROOT/$BRANCH_NAME"
   git branch -d "$BRANCH_NAME"
   git worktree prune
   ```

### PR checklist (before merging to dev)

- [ ] Implemented and verified in an isolated worktree
- [ ] `mise run test` passes
- [ ] `mise run test:health` passes against a local server
- [ ] `mise run typecheck` passes (frontend changes)
- [ ] No secrets or hardcoded credentials
- [ ] New behaviour covered by a test
- [ ] `AGENTS.md` updated if conventions changed

---

## Key Invariants

Agents should never violate these:

1. **`backend/core/models.py` is the single schema source of truth.** All Pydantic models live here. Never define a competing schema elsewhere.
2. **All incident input and output goes through the Orchestrator.** External events (defect/SPC signal), technician input and shift-leader approval enter via `backend/agents/orchestrator.py` (`Orchestrator.start_incident` / `approve` / `reset`); API routes never write `backend/core/blackboard.py`. Agents receive the board snapshot from the workflow, return a draft (`FindingDraft`, `VerificationResult`, …) and never touch the Blackboard or call each other; workflow nodes in `workflow_nodes.py` are the only Blackboard writers. Exceptions:
   - Read-only output transport: `GET /api/incidents/current` and the SSE stream read the Blackboard directly.
   - Read-only agent tool lookups (BigQuery, RAG, Gemini) are data queries, not incident I/O.
   - Data-plane ingestion: Pub/Sub → BigQuery raw telemetry/traceability storage.
   - Technician Copilot ↔ technician live voice/camera stream (Gemini Live); the Orchestrator starts/ends the session and receives its outcome.
   - `adk web` / `adk run` run `incident_workflow` without the `Orchestrator` runner (no single-flight/cancel); dev only, separate process and Blackboard.
3. **Incidents close on product evidence only.** The orchestrator transitions to `closed` only after `verification_count >= verification_target`. Shift-leader approval (`approved`) is accepted only on a `closed` incident. Do not shortcut this.
4. **Development parity & mock fallback.** `backend/tools/bigquery_tool.py` connects to `goccy/bigquery-emulator` (via `BIGQUERY_EMULATOR_HOST`) for high-fidelity SQL testing in dev, or falls back to local mock data when no emulator or GCP credentials are present. Neither local dev nor automated CI should ever fail due to missing cloud credentials.
5. **Frontend never calls backend directly by hostname, except streams.** All REST calls use relative URLs (`/api/...`) so the Vite proxy (dev) and the Firebase Hosting rewrite (prod) handle routing. The single exception is the SSE/WebSocket routes, which Hosting rewrites cannot carry: they use the build-time `VITE_STREAM_ORIGIN` (the Cloud Run URL, set by `mise run deploy:web` / `deploy:mobile`; unset in dev, so they stay relative), and the backend allows the Hosting origins via `CORS_ORIGINS`. Never hardcode a hostname in component code. See `docs/deployment-frontend.md`.
6. **UI Design System compliance (Lumina Slate liquid glass, light).** All UI wireframes, Stitch prompts and frontend components must conform to `docs/DESIGN.md`: plain CSS custom-property tokens (no Tailwind/shadcn), frosted glass surfaces over the pastel backdrop, indigo accent with dark ink primary buttons, Inter / Geist / JetBrains Mono, Material Symbols icons, the 4 px spacing grid and radius tokens (`--radius-sm` 8, `--radius-md` 12, `--radius-lg` 16, `--radius-xl` 24 glass cards, `--radius-full` 999 chips), component names rather than CSS class names in docs, and ≥ 44 px tap targets on the technician app. Never generate dark-mode canvases, neon glows, or cluttered wall-of-metrics layouts.
7. **Every `/api` router requires login.** `backend/api/main.py` mounts each router with `dependencies=[Depends(require_user)]` (`backend/core/auth.py`); only `/health` and `/api/auth/*` are public. Frontend REST calls go through `authFetch`, and SSE/WebSocket URLs go through `withToken` (`?token=`). API tests run as a signed-in user via the autouse override in `tests/conftest.py`; mark a test `real_auth` to exercise the real gate.
