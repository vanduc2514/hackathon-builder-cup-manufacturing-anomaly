# AGENTS.md — Kaizen Agent Contributor Guide

This file is the authoritative reference for AI coding agents and human contributors working on this repository. Read it before writing any code.

---

## Project Layout

```
.
├── backend/                    # Python — FastAPI server, AI agents, tools
│   ├── agents/                 # One file per ADK agent
│   │   ├── orchestrator.py     # State machine; coordinates all agents
│   │   ├── quality_inspector.py
│   │   ├── traceability.py
│   │   ├── process_analyst.py
│   │   ├── root_cause.py
│   │   ├── technician_copilot.py
│   │   ├── incident_scribe.py
│   │   └── continuous_learning.py
│   ├── api/                    # FastAPI routers
│   │   ├── main.py             # App factory, mounts routers
│   │   ├── routes_incidents.py # SSE stream + incident read endpoints
│   │   ├── routes_simulation.py# Demo inject / reset endpoints
│   │   └── routes_gemini_live.py
│   ├── core/                   # Shared primitives (import freely)
│   │   ├── models.py           # Pydantic schemas — single source of truth
│   │   ├── blackboard.py       # Reactive shared state (asyncio + SSE)
│   │   └── config.py           # Settings via pydantic-settings / .env
│   ├── edge/                   # Edge device code (Gemma classifier, MQTT bridge)
│   │   ├── gateway/
│   │   └── simulator/          # Local mock of edge hardware for dev
│   ├── tools/                  # Stateless ADK tool functions
│   │   ├── bigquery_tool.py    # Traceability + telemetry queries (+ mock seed)
│   │   ├── spc_calculator.py
│   │   ├── impact_calculator.py
│   │   └── rag_search_tool.py
│   └── requirements.txt
│
├── frontend/                   # React + Vite dashboard
│   ├── src/
│   │   ├── main.jsx            # Entry point
│   │   ├── App.jsx             # Root component / router
│   │   ├── components/         # Reusable UI components
│   │   └── pages/              # Route-level page components
│   ├── public/
│   ├── index.html
│   ├── vite.config.js          # Dev proxy: /api → localhost:8000
│   └── package.json
│
├── data/
│   ├── datasets/               # Raw / mock sensor and traceability data
│   ├── knowledge_base/         # PDFs, maintenance logs, 8D reports for RAG
│   └── schemas/                # BigQuery DDL and Firestore schema definitions
│
├── docs/                       # Architecture diagrams (.mmd + rendered .svg)
├── tests/                      # pytest test suite (mirrors backend/ structure)
├── mise.toml                   # Tool versions + all dev tasks (canonical runner)
├── docker-compose.yml          # Local multi-service compose
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

### JavaScript / React (frontend/)

- **Style:** ESLint + Prettier (2-space indent, single quotes, no semicolons).
- **Components:** Functional components only — no class components. One component per file. File name matches the exported component name.
- **State:** Local `useState` / `useReducer` for UI-only state. Global incident state comes via the SSE hook — do not duplicate it in Redux/Zustand unless the app grows to need it.
- **API calls:** All `/api/*` calls are proxied by Vite in dev and by the server in prod. Never hardcode `localhost:8000` in component code — use relative paths.
- **Props:** Always destructure props in the function signature. Use PropTypes or JSDoc for public components.

```jsx
// Good
export default function SpcChart({ bars, ucl }) {
  return <canvas aria-label="SPC defect rate chart" />;
}
```

### General

- **No commented-out code** in commits. Use `git stash` or a feature branch instead.
- **Test coverage:** Any new function in `backend/tools/` or `backend/core/` must have a corresponding test in `tests/`.
- **Environment parity:** Code must work with mock data when `GCP_PROJECT_ID` is unset. Never assume live GCP services in local dev paths.

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

Use the top-level area affected: `backend`, `frontend`, `agents`, `api`, `core`, `edge`, `tools`, `data`, `docs`, `ci`.

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

### PR checklist (before merging to dev)

- [ ] `mise run test` passes
- [ ] `mise run test:health` passes against a local server
- [ ] No secrets or hardcoded credentials
- [ ] New behaviour covered by a test
- [ ] `AGENTS.md` updated if conventions changed

---

## Key Invariants

Agents should never violate these:

1. **`backend/core/models.py` is the single schema source of truth.** All Pydantic models live here. Never define a competing schema elsewhere.
2. **The Blackboard is the only shared state bus.** Agents communicate exclusively by reading from and writing to `backend/core/blackboard.py`. No direct agent-to-agent calls.
3. **Incidents close on product evidence only.** The orchestrator transitions to `closed` only after `verification_count >= verification_target`. Do not shortcut this.
4. **Mock data must always work.** The `bigquery_tool.py` mock path must remain functional without any GCP credentials so local development never requires a live project.
5. **Frontend never calls backend directly by hostname.** All API calls use relative URLs (`/api/...`) so the Vite proxy (dev) and server (prod) handle routing transparently.
