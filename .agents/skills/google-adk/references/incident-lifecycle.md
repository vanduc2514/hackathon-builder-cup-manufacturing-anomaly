# Kaizen Agent: 4-Phase Incident Lifecycle Architecture

The multi-agent system orchestrates an incident through 4 sequential phases, coordinated by an Orchestrator state machine:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            INCIDENT LIFECYCLE                               │
│                                                                             │
│  Phase A: Detection          Phase B: Tracing & RCA                         │
│  ┌──────────────────────┐    ┌──────────────────────────────────────────┐   │
│  │ Quality Inspector    │───►│ Traceability Agent (BigQuery lot trace)  │   │
│  │ (SPC UCL breach,     │    │ Process Analyst (sensor anomaly spikes)  │   │
│  │  vision classifier)  │    │ Root Cause Agent (5-Whys, Ishikawa, RAG) │   │
│  └──────────────────────┘    └──────────────────────────────────────────┘   │
│                                                   │                         │
│                                                   ▼                         │
│  Phase D: Learning           Phase C: Resolution                            │
│  ┌──────────────────────┐    ┌──────────────────────────────────────────┐   │
│  │ Continuous Learning  │◄───│ Technician Copilot (Voice/camera Live)   │   │
│  │ (Sustainability ROI, │    │ Incident Scribe (8D report & SOPs)       │   │
│  │  video SOP harvest)  │    │ Verification Gate (50 good parts check)  │   │
│  └──────────────────────┘    └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## State Machine Invariants

1. **Phase A (Open Incident)**:
   - Triggered when `defect_rate > UCL` (Upper Control Limit) or edge gateway flags consecutive failures.
   - Orchestrator creates new `IncidentRecord` and posts to Blackboard.

2. **Phase B (Root Cause Investigation)**:
   - `traceability.py` queries BigQuery for machine, tool, operator, and batch history.
   - `process_analyst.py` correlates timestamps with telemetry spikes (vibration RMS, spindle temperature).
   - `root_cause.py` synthesizes findings with manual/8D citations via `rag_search_tool.py`.
   - **Gate**: Requires RCA confidence score $\ge 70\%$. If $< 70\%$, copilot requests technician camera verification.

3. **Phase C (Physical Resolution & Gatekeeping)**:
   - `technician_copilot.py` provides interactive repair guidance.
   - `incident_scribe.py` drafts the 8D root-cause report and corrective action SOP.
   - **Key Invariant 3**: Incident transitions to `closed` **ONLY** after `verification_count >= verification_target` (default: 50 consecutive defect-free parts). Agents must never bypass this evidence gate.

4. **Phase D (Continuous Learning & ROI)**:
   - `continuous_learning.py` calculates sustainability metrics (avoided scrap kg, avoided $CO_2$, avoided downtime cost).
   - Ingests technician repair video demonstrations to extract procedural knowledge.
