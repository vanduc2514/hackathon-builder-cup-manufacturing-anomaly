# System Topology & 4-Phase Multi-Agent Execution Workflow Wireframe

> **File:** `docs/wireframe/system_topology_workflow_wireframe.md`  
> **Mirrored File:** `docs/wireframes/system_topology_workflow_wireframe.md`  
> **Target Viewports:** Desktop `1440 × 900 px` (Plant Ops Canvas) · Tablet / Mobile `< 1024 px` (Vertical Flowchart)  
> **Design Standard:** [`docs/DESIGN.md`](../DESIGN.md) (Lumina Slate liquid glass, light mode)  
> **Architecture Reference:** Message `418b8d2b-2438-4e6d-807f-4f92849cefae` · Ticket TKT-045 (Issue #211)

---

## 1. Architectural Philosophy: The Product-First Operational Loop

Kaizen operates strictly under the **"Product-First"** paradigm. Unlike legacy industrial dashboards that display dozens of disjointed sensor gauges, Kaizen treats physical product deviations as the authoritative trigger:
1. **Product Deviation First:** Every incident starts at the Exit Optical Inspection Camera where surface defects (flank wear, pitting, damp moisture cracks) are caught on-premise within 50ms.
2. **Deterministic Reverse Genealogy (< 90s):** The incident immediately back-traces through workpiece serial barcodes to suspect CNC bays, cutting tools, material batches, and high-frequency sensor anomalies.
3. **Explicit Decision Gates & Human Governance:** Automated reasoning is bounded by deterministic gates:
   - **Decision Gate 1:** Confidence $\ge 0.70$ proceeds to technician resolution; Confidence $< 0.70$ branches into a diagnostic loop requiring field visual evidence (`awaiting_evidence`).
   - **Decision Gate 2 (Invariant #3):** Post-repair incident closure is physically locked until the exit camera certifies **50 consecutive clean workpieces** (`verification_count >= 50`).

```mermaid
flowchart LR
    subgraph PhaseA ["Phase A: Detection & Ingestion"]
        N1["1. Optical Camera\n(Gemma 3 Edge 2B)"] --> N2["2. Pub/Sub & ADK\n(Orchestrator Dispatch)"]
        N2 --> N3["3. Quality Inspector\n(Vision & SPC UCL Alarm)"]
    end

    subgraph PhaseB ["Phase B: Tracing & RCA"]
        N3 --> N4["4. Traceability Agent\n(BigQuery Lot Graph)"]
        N3 --> N5["5. Process Analyst\n(Telemetry Correlation)"]
        N4 --> N6["6. Root Cause Agent\n(5-Whys + Ishikawa RAG)"]
        N5 --> N6
    end

    subgraph Gate1 ["Decision Gate 1"]
        N6 --> G1{"Confidence\n≥ 0.70?"}
        G1 -- "< 0.70 (Low Conf)" --> N7["7. Diagnostic Loop Agent\n(Field Photo Capture)"]
        N7 -. "Evidence Grounding" .-> N6
    end

    subgraph PhaseC ["Phase C: Resolution & Field Repair"]
        G1 -- "≥ 0.70 (Confident)" --> N8["8. Technician Copilot\n(Gemini Live & Scribe 8D)"]
        N8 --> N9["9. Frontline Tech Execution\n(Physical Bay LOTO / Repair)"]
    end

    subgraph PhaseD ["Phase D: Verification & Governance"]
        N9 --> N10["10. Verification Optical Station\n(Conveyor Exit Camera)"]
        N10 --> G2{"Invariant #3\nStreak ≥ 50?"}
        G2 -- "Defect / Scrap" --> N10
        G2 -- "50/50 Clean Parts" --> N11["11. Continuous Learning\n(Impact ESG & RAG Update)"]
        N11 --> N12["12. Shift Leader Gate\n(E-Signature Closure)"]
    end

    classDef edgeNode fill:#ffffff,stroke:#5b5bf0,stroke-width:1.5px,color:#0b1220;
    classDef gateNode fill:#fef3c7,stroke:#f5a524,stroke-width:2px,color:#92400e;
    classDef closedNode fill:#dcfce7,stroke:#12a150,stroke-width:2px,color:#065f46;
    class N1,N2,N3,N4,N5,N6,N8,N9,N10,N11 classDef;
    class G1,G2 gateNode;
    class N12 closedNode;
```

---

## 2. Component Hierarchy & Layout Specifications

```
SystemTopologyView (Page Container: max-width 1680px, padding 24px)
│
├── CanvasHeader (row between wrap, gap 12px)
│   ├── TitleCluster (h1 "System Architecture & Execution Graph", subtitle, 12-node chip)
│   ├── ActiveIncidentBanner / NominalLineChip (44px min tap, jump-to-incident CTA)
│   └── CanvasFloatingToolbar (glass pill: Zoom In (+), Zoom Out (-), Reset (1:1), Fit (crop_free))
│
├── OperationalTierBar (GlassCard strong, radius 12, padding 10px 16px)
│   ├── Tier 1 & 2: Sub-50ms Edge Vision & Physical Scrap Diverter
│   ├── Tier 3 & 4: ADK Reasoning Swarm (Traceability, SPC, Process, RCA, Learning)
│   ├── Tier 5: Human-in-the-Loop & Multimodal Copilot (Technician & Shift Leader)
│   └── LegendSwatches (Executing · Verified · Awaiting Evidence · Standby)
│
├── TopologyCanvasContainer (relative canvas, overflow visible / scrollable)
│   ├── SVGConnectionLayer (absolute inset 0, pointer-events none, z-index 1)
│   │   ├── Linear & Cubic Bézier Splines (stroke 2px, dashed animation for active paths)
│   │   ├── Directional Arrowhead Markers (markers matching path tone)
│   │   └── Animated Data Particle Packets (flowDash stroke-dasharray animation)
│   │
│   └── WorkflowPhaseSwimlanesGrid (4 horizontal glass containers on desktop, vertical on mobile)
│       │
│       ├── PhaseCard: Phase A (Detection & Ingestion)
│       │   ├── PhaseHeader (Lamp LED Red #e5484d, Letter "A", Title, Vietnamese Name, Status Chip)
│       │   ├── Node 1: Optical Inspection Camera (edge-gemma)
│       │   ├── Node 2: Cloud Pub/Sub & ADK Orchestrator (cloud-ingest)
│       │   └── Node 3: Quality Inspector Agent (agent-qa)
│       │
│       ├── PhaseCard: Phase B (Tracing & Root Cause Analysis)
│       │   ├── PhaseHeader (Lamp LED Amber #f5a524, Letter "B", Title, Vietnamese Name, Status Chip)
│       │   ├── Node 4: Traceability Agent (agent-tra)
│       │   ├── Node 5: Process Analyst Agent (agent-pa)
│       │   ├── Node 6: Root Cause Agent (agent-rca)
│       │   └── DecisionGate 1: Diamond Container (Confidence ≥ 0.70?)
│       │       ├── Branch High (≥ 0.70): Direct to Phase C
│       │       └── Branch Low (< 0.70): Node 7 Diagnostic Loop Agent (agent-diag)
│       │
│       ├── PhaseCard: Phase C (Resolution & Field Repair)
│       │   ├── PhaseHeader (Lamp LED Blue #3b82f6, Letter "C", Title, Vietnamese Name, Status Chip)
│       │   ├── Node 8: Technician Copilot & Incident Scribe (copilot-live)
│       │   └── Node 9: Frontline Technician Execution (tech-exec)
│       │
│       └── PhaseCard: Phase D (Verification, Learning & Governance)
│           ├── PhaseHeader (Lamp LED Green #12a150, Letter "D", Title, Vietnamese Name, Status Chip)
│           ├── Node 10: Verification Optical Station (gatekeeper-qa)
│           ├── DecisionGate 2: Diamond Container (Invariant #3 Streak ≥ 50 Clean Parts?)
│           │   ├── Branch Defect: Reset streak counter & alert
│           │   └── Branch Verified (≥ 50): Proceeds to Continuous Learning
│           ├── Node 11: Continuous Learning Agent & Impact Engine (agent-learn)
│           └── Node 12: Shift Leader Governance Gate (human-approval)
│
└── TopologyNodeDrawer (Slide-over panel, 420px width, GlassCard strong, radius 24)
    ├── DrawerHeader (Node Icon, Title, Tier Badge, Close Button 44px)
    ├── MetadataGrid (Phase, Role, Latency SLA, Tech Stack Badges)
    ├── JTBDSection (Single Job-To-Be-Done Narrative)
    ├── LivePayloadSection (Formatted JSON / Key-Value state from Blackboard)
    └── DrawerActions (Jump to Incident / Filter Telemetry)
```

---

## 3. Low-Fi ASCII Wireframe: Desktop 4-Phase Canvas (1440 px)

```text
========================================================================================================================
 KAIZEN AGENT · SYSTEM ARCHITECTURE & 4-PHASE EXECUTION WORKFLOW
 [● Line Nominal · 12 Nodes Standby]   [!] Active Incident #INC-2026-081   [+ Zoom] [- Zoom] [1:1 Reset] [⤢ Fit]
------------------------------------------------------------------------------------------------------------------------
 TIERS: [Tier 1-2: Edge Vision]  [Tier 3-4: ADK Agent Swarm]  [Tier 5: Human & Copilot] | (●) Active (●) Done (●) Standby
------------------------------------------------------------------------------------------------------------------------
 ╭── PHASE A: DETECTION ──╮   ╭── PHASE B: TRACING & RCA ─╮   ╭── PHASE C: RESOLUTION ────╮   ╭── PHASE D: VERIFICATION ──╮
 │ [A] Ingestion (#e5484d)│   │ [B] Tracing (#f5a524)     │   │ [C] Field Repair (#3b82f6)│   │ [D] Governance (#12a150)  │
 │                        │   │                           │   │                           │   │                           │
 │ ╭────────────────────╮ │   │ ╭───────────────────────╮ │   │ ╭───────────────────────╮ │   │ ╭───────────────────────╮ │
 │ │1. Optical Camera   │ │   │ │4. Traceability Agent  │ │   │ │8. Copilot & Scribe    │ │   │ │10. Optical Verifier   │ │
 │ │Gemma 3 Edge 2B     │─┼───┼►│BigQuery Lot Graph     │─┼───┼►│Gemini Live Voice/SOP  │─┼───┼►│Conveyor Exit Vision   │ │
 │ │Sub-50ms / 95% Drop │ │   │ │CNC-02 / Tool T07      │ │   │ │Interactive Checklists │ │   │ │Real-time Clean Scan   │ │
 │ ╰─────────┬──────────╯ │   │ ╰───────────┬───────────╯ │   │ ╰───────────┬───────────╯ │   │ ╰───────────┬───────────╯ │
 │           │            │   │             │             │   │             │             │   │             │             │
 │           ▼            │   │             ▼             │   │             ▼             │   │             ▼             │
 │ ╭────────────────────╮ │   │ ╭───────────────────────╮ │   │ ╭───────────────────────╮ │   │       ◇ DECISION GATE 2 ◇ │
 │ │2. Pub/Sub & ADK    │ │   │ │5. Process Analyst     │ │   │ │9. Frontline Technician│ │   │       │ Streak ≥ 50/50? │ │
 │ │Orchestrator Node   │ │   │ │Telemetry Correlation  │ │   │ │Physical Bay LOTO      │─┼───┼───────┤                 │ │
 │ │Event Dispatch Bus  │ │   │ │Vib +35% / Load +12%   │ │   │ │Tool Index Replacement │ │   │       │ [NO]     [YES]  │ │
 │ ╰─────────┬──────────╯ │   │ ╰───────────┬───────────╯ │   │ ╰───────────────────────╯ │   │       │  │         │    │ │
 │           │            │   │             │             │   │                           │   │       │  ▼         ▼    │ │
 │           ▼            │   │             ▼             │   │                           │   │    (Reset)  ╭───────────┤ │
 │ ╭────────────────────╮ │   │ ╭───────────────────────╮ │   │                           │   │    Counter  │11. Learn  │ │
 │ │3. Quality Inspector│ │   │ │6. Root Cause Agent    │ │   │                           │   │             │Impact/ESG │ │
 │ │ADK Vision & SPC    │─┼───┼►│5-Whys & Ishikawa RAG  │─┼─┐ │                           │   │             ╰─────┬─────╯ │
 │ │UCL Alarm (4.8>3.0%)│ │   │ │Tool Flank Wear Conf   │ │ │ │                           │   │                   │         │
 │ ╰────────────────────╯ │   │ ╰───────────┬───────────╯ │ │ │                           │   │                   ▼         │
 │                        │   │             │             │ │ │                           │   │             ╭───────────┤ │
 │                        │   │     ◇ DECISION GATE 1 ◇   │ │ │                           │   │             │12. Shift  │ │
 │                        │   │     │ Confidence ≥ 0.70?│ │ │ │                           │   │             │Leader Sign│ │
 │                        │   │     │                   │ │ │ │                           │   │             │E-Signature│ │
 │                        │   │     │  [<0.70]   [≥0.70]│ │ │ │                           │   │             ╰───────────┤ │
 │                        │   │     └───┬───────────┬───┘ │ │ │                           │   │                       │   │
 │                        │   │         │           │     │ │ │                           │   │                       ▼   │
 │                        │   │         ▼           └─────┼─┼─┼───────────────────────────┼──►│             [CLOSED &     │
 │                        │   │  ╭──────────────╮         │ │ │                           │   │              APPROVED]    │
 │                        │   │  │7. Diag Loop  │         │ │ │                           │   │                           │
 │                        │   │  │Photo Evidence│─────────┘ │ │                           │   │                           │
 │                        │   │  ╰──────────────╯           │ │                           │   │                           │
 ╰────────────────────────╯   ╰─────────────────────────────╯ ╰───────────────────────────╯   ╰───────────────────────────╯
========================================================================================================================
```

---

## 4. The 12 Node Data Contracts & Progressive Disclosure Drawer

| Node ID | Node Name | Phase | Tier | Primary Tech Stack | SLA / Latency | Key Output Preview |
|---|---|---|---|---|---|---|
| `edge-gemma` | 1. Optical Inspection Camera | Phase A | Tier 1 & 2 | Gemma 3 2B On-Prem, MQTT, Industrial PC | < 50ms | `Scrap Diverter Actuated (42ms)` |
| `cloud-ingest` | 2. Cloud Pub/Sub & ADK Orchestrator | Phase A | Tier 3 & 4 | Cloud Pub/Sub, ADK Workflow, Single-Flight | < 250ms | `Incident #INC-2026-081 Dispatched` |
| `agent-qa` | 3. Quality Inspector Agent | Phase A | Tier 4 | ADK Agent, SPC Calculator, Nelson Rules | < 1.2s | `Defect Rate: 4.8% (> UCL 3.0%)` |
| `agent-tra` | 4. Traceability Agent | Phase B | Tier 4 | ADK Agent, BigQuery Graph Traversal | < 2.5s | `CNC-02 / Bay 1 / Insert T07` |
| `agent-pa` | 5. Process Analyst Agent | Phase B | Tier 4 | ADK Agent, BigQuery High-Frequency Telemetry | < 3.0s | `Vibration +35.2%, Spindle Load +12.4%` |
| `agent-rca` | 6. Root Cause Agent | Phase B | Tier 4 | Gemini 2.5 Pro, Vertex AI Search, Ishikawa | < 4.5s | `Tool Flank Wear / Billet Hardness Drift` |
| `agent-diag` | 7. Diagnostic Loop Agent | Phase B | Tier 4 & 5 | Mobile Gemini Vision, Awaiting Evidence Gate | Interactive | `Chipping Photo Captured & Grounded` |
| `copilot-live` | 8. Technician Copilot & Scribe | Phase C | Tier 4 & 5 | Gemini Live WebSocket, Audio/Video, Scribe 8D | Real-time | `Voice Session Active · 8D Draft v1` |
| `tech-exec` | 9. Frontline Technician Execution | Phase C | Tier 5 | Shop-Floor Technician, Mobile Confirmation | Variable | `Bay CNC-02 Insert Indexed · Confirmed` |
| `gatekeeper-qa`| 10. Verification Optical Station | Phase D | Tier 1 & 4 | Exit Conveyor Camera, Optical Invariant #3 | Continuous | `Conveyor Stream Active · Scan Clean` |
| `agent-learn` | 11. Continuous Learning Agent | Phase D | Tier 4 | Impact ESG Engine, Vertex AI Vector Search | < 2.0s | `+240kg CO2e, $1,420 Avoided Scrap` |
| `human-approval` | 12. Shift Leader Governance Gate | Phase D | Tier 5 | Human Shift Leader, Digital E-Signature | Sign-off | `E-Signature Validated · Incident Approved` |

---

## 5. Ergonomic Touch Targets & Interactive State Matrices

### 5.1. Shop-Floor Touch Target Compliance
- All Node Cards have minimum clickable boundaries of **64 px height × 220 px width** (desktop) and **56 px × 100%** (mobile).
- Canvas Toolbar buttons (Zoom In, Zoom Out, Reset, Fit) are explicitly **44 × 44 px** with rounded corners (`--radius-md: 12px`).
- Decision Gate badges and accordion toggle headers strictly enforce **≥ 48 px** tap heights for gloved technician operation.

### 5.2. State Transition Lifecycle Matrix

| Incident State | Active Nodes | Inactive / Idle Nodes | Gate 1 State | Gate 2 State | Visual Feedback |
|---|---|---|---|---|---|
| `normal` | None (Standby) | All 12 Standby | Closed (Inactive) | Closed (Inactive) | Calm lavender canvas, subtle gray node hairlines, green line status pill. |
| `detecting` | 1, 2, 3 | 4 – 12 | Standby | Standby | Node 1, 2, 3 pulse red `#e5484d`, active particles flow on Path 1→2 and 2→3. |
| `tracing` / `analyzing` | 4, 5, 6 | 1 – 3 Done, 7 – 12 Idle | Evaluating | Standby | Phase B container highlights amber `#f5a524`, simultaneous paths 3→4 and 3→5 animate. |
| `awaiting_evidence` | 7 (Diagnostic Loop) | 1 – 5 Done, 6 Paused | **Branch Low (< 0.70)** | Standby | Node 7 glows amber, blinking mobile camera upload badge, prompt to field technician. |
| `repairing` | 8, 9 | 1 – 7 Done, 10 – 12 Idle | Passed (High) | Standby | Phase C highlights blue `#3b82f6`, Node 8 voice waves pulse, Node 9 pending check. |
| `verifying` | 10 (Verification Station)| 1 – 9 Done, 11 – 12 Locked | Passed | **Active Counter (0/50)** | Node 10 active green pulse, Gate 2 displays real-time clean streak counter (e.g. `Streak 38/50`). |
| `closed` | 11, 12 | 1 – 10 Done | Passed | **Passed (50/50)** | Invariant #3 unlocked, Node 11 calculates ESG savings, Node 12 awaiting shift leader signature. |
| `approved` | 12 (Approved) | 1 – 11 Done | Passed | Passed | Entire canvas shows green verified checks, Incident badge shows `Approved & Logged`. |
| `escalated` | 6, 8, 12 | Varies | Triggered | Reset | Orange warning tint across canvas, alert badge on Gate 1/2 failure. |

---

## 6. Responsive Layout Strategy

### 6.1. Desktop Canvas ($\ge 1024\text{ px}$)
- Horizontal 4-swimlane grid using CSS Grid `repeat(4, minmax(260px, 1fr))`.
- SVG Bézier curves render across swimlanes from left-to-right (`x1` right edge $\to$ `x2` left edge), with branching loops returning upward or downward.
- Canvas pan & zoom enabled with mouse drag and scroll wheel.

### 6.2. Tablet & Mobile Canvas ($< 1024\text{ px}$)
- Single-column vertical layout (`flex-direction: column`).
- Each Phase turns into a collapsible accordion card with current active node highlighted in the header summary.
- Connecting lines convert to compact vertical flow arrows (`M x1 y1 L x2 y2`).
- Decision Gates collapse into clean geometric badge separators between phase cards.
