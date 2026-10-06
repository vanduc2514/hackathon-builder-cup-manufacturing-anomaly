# Agent Skills for Kaizen Agent & Google Cloud

This directory contains curated **Agent Skills** — modular packages of instructions, best practices, and reference runbooks that empower AI coding agents (Google Antigravity, Cursor, Codex, Claude Code) to autonomously setup, interact with, and troubleshoot Google services and Kaizen Agent multi-agent components.

Inspired by the AWS Agent Toolkit architecture and built upon Google's official open-source skills repository (`google/skills`), this system uses **progressive disclosure** so that the agent's context window stays light while unlocking deep, task-specific operational knowledge on demand.

---

## Skill Catalog & Matrix

| Category | Skill Name | Source | When to Use / Primary Triggers | Architecture Domain |
|---|---|---|---|---|
| **Cloud Foundation** | [`gcloud`](./gcloud/SKILL.md) | Official Google | Constructing, validating, and executing `gcloud` CLI commands; ADC auth setup | Infrastructure & ADC Auth |
| **Cloud Foundation** | [`cloud-run`](./cloud-run/SKILL.md) | Official Google | Packaging, deploying, and configuring the FastAPI backend container on Cloud Run | Backend Container Deployment |
| **Cloud Foundation** | [`firebase`](./firebase/SKILL.md) | Official Google | Firebase CLI auth, hosting deployment (`firebase deploy --only hosting`), API proxy rewrites | Frontend Web Hosting & Proxy |
| **Cloud Foundation** | [`bigquery`](./bigquery/SKILL.md) | Official Google + Local Parity | BigQuery SQL queries, dataset schemas, `goccy/bigquery-emulator` on port 9050, troubleshooting | Analytics & Traceability Warehouse |
| **Cloud Foundation** | [`google-cloud-storage`](./google-cloud-storage/SKILL.md) | Official Google | Provisioning buckets, uploading video SOPs/defect frames, signed URLs, CORS | Object Storage & Media Assets |
| **Cloud Observability** | [`cloud-logging`](./cloud-logging/SKILL.md) | Official Google | LQL query generation, Cloud Run container logs, incident tracing, SPC alerts | Observability & Diagnostics |
| **Security & IAM** | [`iam-troubleshooting`](./iam-troubleshooting/SKILL.md) | Official Google | Resolving 403 PERMISSION_DENIED, discovering least-privilege roles for Cloud Run / BQ / Vertex AI | Identity, Security & Access |
| **Generative AI** | [`gemini-api`](./gemini-api/SKILL.md) | Official Google | `google-genai` SDK usage, multimodal vision defect inspection, structured Pydantic outputs, tools | Multimodal Vision & Reasoning |
| **Generative AI** | [`gemini-live-api`](./gemini-live-api/SKILL.md) | Official Google | Realtime bidirectional streaming (Audio + Video) WebSockets for Technician Copilot | Live Voice & Camera Streaming |
| **Generative AI** | [`vertex-rag-search`](./vertex-rag-search/SKILL.md) | Kaizen Fallback | Vertex AI Search / Discovery Engine, citation contracts, local mock retrieval over manuals & 8Ds | Knowledge Base RAG & Citations |
| **Kaizen Architecture** | [`google-adk`](./google-adk/SKILL.md) | Kaizen Fallback | Google ADK multi-agent state machine, 4-phase incident loop, stateless tool conventions | Multi-Agent Team Orchestration |
| **Kaizen Architecture** | [`gemma-edge`](./gemma-edge/SKILL.md) | Kaizen Fallback | On-premise Gemma 3 edge inference, 95% frame drop filter, Ollama & local simulator, MQTT bridge | Edge Vision & MQTT Telemetry |
| **Kaizen Architecture** | [`firestore-blackboard`](./firestore-blackboard/SKILL.md) | Kaizen Fallback | Shared incident state bus (Blackboard pattern), SSE event stream, local memory vs emulator vs Cloud | Reactive Incident State Bus |
| **Agent Operations** | [`export-session`](./export-session/SKILL.md) | Project Skill | Sanitizing and exporting Antigravity session audit logs into `.sessions/` | Workspace Audit & Operations |

---

## How Skills Work (Progressive Disclosure)

Antigravity and compatible coding agents discover skills through a three-stage progressive lifecycle:

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ 1. Discovery    │ ────► │ 2. Activation   │ ────► │ 3. Execution    │
│ Agent inspects  │       │ Only when a     │       │ Follows steps,  │
│ YAML frontmatter│       │ prompt matches  │       │ links to deeper │
│ name & desc     │       │ description,    │       │ references/ &   │
│ (< 100 tokens)  │       │ SKILL.md loads  │       │ runs scripts    │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

1. **Discovery**: At agent boot, only the YAML frontmatter `name` and `description` of each skill are loaded into memory.
2. **Activation**: When a user request matches the trigger condition in the description, the agent automatically loads the targeted `SKILL.md`.
3. **Execution**: Detailed reference guides (e.g. `references/cli-usage.md`, `references/troubleshooting.md`) are only fetched if specific edge cases or diagnostics are required, preserving maximum context tokens for user code.

---

## Architecture Alignment with Incident Lifecycle

Skills map directly to the 4 phases of the Kaizen industrial incident lifecycle:

- **Phase A (Detection)**: [`gemma-edge`](./gemma-edge/SKILL.md) pre-filters camera frames; [`gemini-api`](./gemini-api/SKILL.md) & [`google-adk`](./google-adk/SKILL.md) classify defects and evaluate SPC breaches; [`cloud-logging`](./cloud-logging/SKILL.md) monitors alert events.
- **Phase B (Tracing & RCA)**: [`bigquery`](./bigquery/SKILL.md) traces suspect lots and machines; [`vertex-rag-search`](./vertex-rag-search/SKILL.md) pulls cited manual pages; [`firestore-blackboard`](./firestore-blackboard/SKILL.md) records findings.
- **Phase C (Resolution)**: [`gemini-live-api`](./gemini-live-api/SKILL.md) guides physical repairs with the technician; [`google-adk`](./google-adk/SKILL.md) enforces the 50 consecutive good parts gate.
- **Phase D (Learning & Continuous Improvement)**: [`gemini-api`](./gemini-api/SKILL.md) ingests video repair SOPs; [`google-cloud-storage`](./google-cloud-storage/SKILL.md) stores persistent video clips and defect images; [`bigquery`](./bigquery/SKILL.md) persists avoided scrap and carbon emissions.
- **Cross-Cutting Operations**: [`cloud-run`](./cloud-run/SKILL.md) & [`firebase`](./firebase/SKILL.md) host the full stack; [`iam-troubleshooting`](./iam-troubleshooting/SKILL.md) diagnoses ADC permissions; [`cloud-logging`](./cloud-logging/SKILL.md) traces distributed agent actions.

---

## Contributing New Skills

When adding a new skill to `.agents/skills/`:
1. Create a directory `.agents/skills/<skill-name>/`.
2. Add a `SKILL.md` file with standard YAML frontmatter:
   ```yaml
   ---
   name: <skill-name>
   description: >-
     Clear explanation of WHAT the skill does and EXACTLY WHEN the agent should activate it.
   ---
   ```
3. Keep `SKILL.md` focused on core procedural steps. Place large schemas, reference tables, or detailed logs into `references/*.md`.
4. Register the new skill in this `README.md` catalog table.
