---
name: google-adk
metadata:
  version: "1.0.0"
  category: AgentFramework
description: >-
  Guides development, coordination, and troubleshooting of Google ADK multi-agent systems
  in Kaizen Agent. Use when working on agent definitions (backend/agents/), the 4-phase incident
  state machine (orchestrator.py), stateless tool functions (backend/tools/), or debugging
  agent handoffs and blackboard communication.
---

# Google ADK (Agent Development Kit) Skill

Google ADK provides the agent framework for building, evaluating, and deploying multi-agent workflows. In Kaizen Agent, ADK orchestrates an autonomous collaborative team of specialized industrial agents.

## Google ADK Architecture & Concepts

- **Framework & SDK**: Official Python framework `agent-development-kit` (`pip install agent-development-kit`).
- **Multi-Agent Orchestration**: State-machine-driven coordination, sequential & parallel handoffs, consensus loops.
- **Tool & Function Calling**: Stateless tool declarations decorated with typed Pydantic contracts.
- **Agent Evaluation**: Built-in evaluation framework for measuring agent reasoning fidelity and tool selection accuracy.

## Core Directives & Invariants

1. **Blackboard Isolation**: Agents communicate exclusively by reading from and writing to the shared Blackboard state bus. Agents NEVER call each other directly (Key Invariant 2).
2. **Schema Authority**: All inter-agent data structures and findings must be typed Pydantic models from the core domain schema (Key Invariant 1).
3. **Closing Gate**: Incidents only transition to `closed` after `verification_count >= verification_target` (Key Invariant 3).
4. **Asynchronous Execution**: Agent methods must be `async def` and avoid blocking the event loop.

## Key References

- **4-Phase Incident Lifecycle**: Detailed state machine transitions from detection to continuous learning. See [references/incident-lifecycle.md](references/incident-lifecycle.md)
- **Tool Authoring Standards**: Conventions for stateless ADK tools in `backend/tools/`. See [references/tool-authoring.md](references/tool-authoring.md)

---

## Agent Architecture & Roles

The multi-agent system divides responsibilities among specialized roles:

| Agent Component | Role | Responsibility |
|---|---|---|
| `orchestrator` | **Orchestrator** | State machine coordinating all phase transitions |
| `quality_inspector` | **Quality Inspector** | Detects SPC UCL breaches & gatekeeps resolution (50 good parts) |
| `traceability` | **Traceability Agent** | BigQuery discrete tracking (machine, lot, tool, operator) |
| `process_analyst` | **Process Analyst** | Correlates machine telemetry anomalies (vibration RMS, current) |
| `root_cause` | **Root Cause Agent** | Generates 5-Whys and Ishikawa diagrams grounded in RAG manuals |
| `technician_copilot` | **Technician Copilot** | Multimodal Live conversational repair assistance |
| `incident_scribe` | **Incident Scribe** | Generates standard 8D reports, Work Orders, and SOP proposals |
| `continuous_learning` | **Continuous Learning** | Calculates sustainability ROI & extracts SOPs from video clips |

---

## Local Development Workflow

Run the ADK multi-agent backend locally:
```bash
# Start backend on port 8000
mise run backend

# Trigger synthetic incident injection to test the full 90s agent loop
mise run demo

# Run agent unit tests
pytest tests/agents/
```

---

## Troubleshooting Guide

| Issue | Root Cause | Resolution |
|---|---|---|
| Agent hangs during execution | Blocking sync I/O inside `async def` | Wrap blocking calls in `asyncio.to_thread(...)` |
| `ValidationError` on finding | Dict returned instead of Pydantic model | Ensure return type is `AgentFinding` or model from `backend/core/models.py` |
| Incident stuck in `in_progress` | Verification gate count not reached | Ensure simulated stream produces 50 consecutive good parts or check gate logic |
| Inconsistent blackboard state | Race condition on concurrent write | Use atomic blackboard helper methods `post_finding()` and `update_incident_status()` |
