# Kaizen Agent — Master UI Wireframes & User Stories Specification

> **Document Version:** 2.0.0  
> **Target Design System:** [`docs/DESIGN.md`](../DESIGN.md) (Lumina Slate liquid glass, light)  
> **Terminology:** Unified **Agent Team** across all screens and documentation.  
> **Key Architecture Rules:** Calm Technology, 3-Tier Progressive Disclosure, Single JTBD per Screen, Radius Scale (pill chips 999px, glass cards 24px on both surfaces, insets 16px, buttons 12px (mobile 16px)).  
> **Surfaces:** Desktop Plant Ops dashboard and Technician mobile app.

---

## 1. Executive Summary & Methodology Alignment

Kaizen Agent organizes its user experience around **two closed feedback loops** adhering to the design methodology defined in [`docs/DESIGN.md`](../DESIGN.md):

1. **The Real-Time Operational Loop:** Detect, isolate, repair, and verify physical production anomalies on the shop floor within minutes.
2. **The Kaizen Knowledge & Sustainability Loop:** Institutionalize proven 8D fixes into long-term organizational memory, update SOPs, and quantify ESG savings.

### 1.1. Application Shell & 3-Tier Progressive Disclosure Matrix

The desktop dashboard is a **floating glass sidebar shell** and the technician app is a **device frame with a floating dock** (`00_base_layout.md`). Every screen focuses strictly on its own content slot:

| Module / Screen | Single Job-to-be-Done (JTBD) | Tier 1: Glance (1s) | Tier 2: Focus (5s) | Tier 3: Deep Dive (On-Demand) | Dedicated Spec |
|---|---|---|---|---|---|
| **Base Shells** | Navigation, demo controls, SSE connectivity | Desktop: glass Sidebar + header anomaly chip · Mobile: header stream status | Desktop: Operational / Knowledge Loop nav, incident sub-tabs · Mobile: 3-tab dock | DemoController slide-over (Inject / Reset), ⌘K jump palette | [`00_base_layout.md`](./00_base_layout.md) |
| **Screen 1: Line Overview (`overview`)** | Line health monitoring & instant dispatch | `N Active Anomaly` chip + 4 KPI cards (OEE, Defect rate vs UCL, Active incidents, ESG CO₂) | AnomalyBanner (`Open INC →`) + MachineFleetTable hot row | DiagnosticsModal (4 stats + sensor history chart) | [`01_line_overview.md`](./01_line_overview.md) |
| **Screen 2: Technician Mobile App** | Evidence capture, guided repair, verification hand-off | Work List segmented Active / Processing / Completed | WorkOrderCards → Collect evidence / Repair brief | Evidence capture camera, Gemini Live guided repair, Finish sheet, Work status | [`02_technician_copilot.md`](./02_technician_copilot.md) |
| **Screen 3: Incident Command (`incident-detail`)** | Product-evidence verification & 8D sign-off | `#INC` chip + title + step circles + StepRail | Current StepSection + `Approve 8D & Release Line` (locked until 50/50) | CausalTreeTabs, sensor history, documents, EightDReportCard, AgentAttribution | [`03_incident_workspace.md`](./03_incident_workspace.md) |
| **Screen 4: Knowledge Loop (`walkthroughs` / `impact` / `sops`)** | Institutional memory search & ESG savings quantification | Recertification strip · 3 KPI cards (Scrap, Downtime, CO₂) · Needs review strip | Station sections · KnowledgeSearch + Signed-off 8D fixes · SOP table | WalkthroughPlayer, EightDSheet, WhatIfCalculator, SopDetailDrawer | [`04_knowledge_sustainability_hub.md`](./04_knowledge_sustainability_hub.md) |
| **Screen 5: System Topology (`topology`)** | Live multi-agent execution tracing & decision gates | Phase lamps & status chips · Active execution flowline pulse | Node summaries & Decision Diamonds (Confidence ≥ 0.70 & Invariant #3 Streak ≥ 50) | `TopologyNodeDrawer` (JTBD, tech stack, blackboard telemetry, logs) | [`system_topology_workflow_wireframe.md`](../wireframe/system_topology_workflow_wireframe.md) |

---

## 2. Base Shells

> **Full Specification:** [`00_base_layout.md`](./00_base_layout.md)  
> **Desktop:** floating Sidebar (`GlassCard` variant `strong`, 240px, inset 12px, radius 24) + floating TopHeader pills (top 12, h 56) + `<main>` `Page` (max 1680px).
> **Mobile:** 396×852 device frame, 44px status bar, floating 64px `Dock` (Work List / Notifications / Settings).

```text
 ╭──────────────────────╮  ╭─────────────────────────────╮        (●) 1 Active Anomaly  ╭ ⌘K Search… ╮ (♪) Shift Leader (◉)
 │ [K] KAIZEN AGENT     │  │ Cell Line 1 / Line Overview │                              ╰────────────╯
 │ ╭ Cell Line 1 …    ╮ │  ╰─────────────────────────────╯
 │ OPERATIONAL LOOP     │  PageTitle                                         [ Button ] [■ Button primary ■]
 │ ▣ Line Overview  *   │  ╭── GlassCard (24) ────────────────────────────────────────────────────────────╮
 │ ⚠ Incidents          │  │  {tab content: overview · incident-detail · topology · walkthroughs · …}     │
 │ SYSTEM ARCHITECTURE  │  ╰──────────────────────────────────────────────────────────────────────────────╯
 │ ⑂ System Topology    │
 │ KNOWLEDGE LOOP       │
 │ ▶ Tech Walkthroughs  │
 │ ▤ Knowledge Base     │                                                          ╭─ Toast (DarkGlass) ╮
 │ ☰ SOP Change Log     │                                                          ╰────────────────────╯
 │ (●) 24 ms  [Shift A] │
 │ (◉) Shift Leader     │
 ╰──────────────────────╯
```

---

## 3. Screen 1: Line Overview & Machine Fleet

> **Full Specification:** [`01_line_overview.md`](./01_line_overview.md)  
> **Target Persona:** Shift Leader  
> **Single JTBD:** Glance at line health in <3s, detect anomalies immediately, open the incident with 1 click.

```text
 Cell Line 1 Overview                                         [ Refresh Line ] [ Export Shift Report ] [■ New Run ■]
 ╭── AnomalyBanner (GlassCard, tone red) ──────────────────────────────────────────────────────────────────────╮
 │ [⚠] CNC-02: Tool T07 Flank Wear [CRITICAL] (●)  Defect rate 1.42% · UCL 0.25%   [■ Open INC → ■]  Dismiss │
 ╰────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
 ╭─ OEE ──────────╮ ╭─ DEFECT RATE VS UCL ╮ ╭─ ACTIVE INCIDENTS ─╮ ╭─ ESG CO₂ ───────────╮
 │ 88.4 %  ▬▬▬    │ │ 1.42 % ▬▬▬▬|▬       │ │ 1 · [P1 Critical]  │ │ {n} kg · Open KB → │
 ╰────────────────╯ ╰─────────────────────╯ ╰────────────────────╯ ╰─────────────────────╯
 ╭── MachineFleetTable ───────────────────────────────────────────────────────────────────────────────────────╮
 │ (■Anomaly■) ( Nominal ) ( All )                                          ╭ 🔍 Search… ╮                    │
 │ MACHINE ID  PART MODEL   VIBRATION RMS  SPINDLE LOAD  STATUS        INCIDENT ID  ACTIONS                   │
 │▌CNC-02      Housing-B42  2.84 mm/s      78.6 %        (●) Critical  INC-…        [■ OPEN INC → ■]          │
 │ CNC-01      Shaft-A12    1.46 mm/s      42.1 %        (●) Nominal   —            [ Diagnostics ]           │
 ╰────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

---

## 4. Screen 2: Technician Mobile App

> **Full Specification:** [`02_technician_copilot.md`](./02_technician_copilot.md)  
> **Target Persona:** Frontline Maintenance Technician (Tuan Le)  
> **Single JTBD:** Collect evidence when the AI asks, run the guided repair, and hand off to product verification.

```text
[Work List]                              [Collect evidence]                       [Guided repair (Gemini Live)]
╭──────────────────────────────────╮     ╭──────────────────────────────────╮     ╭──────────────────────────────────╮
│ kAIgen (●) Live             (AV) │     │ ( ‹ )  Collect evidence    [P1]  │     │ ( ‹ ) [● Copilot Live] [vi-VN]   │
│ Work List                        │     │ ╭ AiCard  AI needs your eyes ╭──╮╮│     │ ╭ [2/3] Replace insert         ╮ │
│ (█Active█) Processing  Completed │     │ │ "Take a close-up…"        │65│││     │ │ Target 45 Nm │ Check ± tol   │ │
│ COLLECT EVIDENCE                 │     │ ╰───────────────────────────╰──╯╯│     │ ╰──────────────────────────────╯ │
│ ▌[NEEDS EVIDENCE][P1][LIVE]      │     │ ALREADY COLLECTED · 2 ITEMS      │     │ ╭ You … / ✦ Copilot … ∿∿∿      ╮ │
│ ▌ Evidence collected 1 of 3      │     │ STILL NEEDED · 1 LEFT            │     │ ╰──────────────────────────────╯ │
│ REPAIRS                          │     │                                  │     │ [(ϟ)(↶)] (🔊56) [Done · next]    │
│ ▌[READY TO FIX][P2][DEMO]        │     │ [■ Capture 1 more to submit ■]   │     │                                  │
│ [█WorkList█]  Notifs  Settings   │     │ [█WorkList█]  Notifs  Settings   │     │ [WorkList] [Notifs] [Settings]   │
╰──────────────────────────────────╯     ╰──────────────────────────────────╯     ╰──────────────────────────────────╯
  ^-- floating 64px Dock                    ^-- 48px Button primary lg CTA           ^-- 56px voice button, on-dark Dock
```

---

## 5. Screen 3: Incident Command

> **Full Specification:** [`03_incident_workspace.md`](./03_incident_workspace.md)  
> **Target Personas:** Shift Leader & QA Engineer (Hannah Parker)  
> **Single JTBD:** Follow the 5-step Agent Team investigation, watch the 50-good-part streak gate, and sign off the 8D.

```text
 Line Overview / [#INC-…]
 Tool wear scratch on CNC-02                                                                                  ╭─╮
 Housing-B42 · end-of-line CAM-EOL · opened 09:40 · open 12m                                                  │●│
 INVESTIGATION STEPS                                                                   Expand all             │●│
 ╭─(✓)─ Inspection ─────────────────────────────────────────────────────────── [Done] ⌄ ╮                    │●│
 ╭─(✓)─ Traceability ───────────────────────────────────────────────────────── [Done] ⌄ ╮                    │█│
 ╭─(✓)─ Analysis ───────────────────────────────────────────────────────────── [Done] ⌄ ╮                    │○│
 ╔═(④)═ Repair & Proof ───────────────────────────────────────────── (●) Verifying ⌃ ═╗                     ╰─╯
 ║ StreakGate  ■■■■■■■■■■■■■■■■■■■■■■■■■ / ■■■■■■■■■■■■■▣□□□□□□□□□□□      38/50         ║                   StepRail
 ╚════════════════════════════════════════════════════════════════════════════════════╝
 ╭─(5┄)─ Sign-off ──────────────────────────────────────────────────────── [🔒 Waiting] ⌄ ╮
 │ [ 🔒 Approve 8D & Release Line · 38/50 ]   8D report D1–D8 · Lesson learned · Impact │
 ╰────────────────────────────────────────────────────────────────────────────────────────╯
```

---

## 6. Screen 4: Knowledge Loop

> **Full Specification:** [`04_knowledge_sustainability_hub.md`](./04_knowledge_sustainability_hub.md)  
> **Target Personas:** Plant Manager (David Vu), Continuous Improvement (Kaizen) Lead, ESG Lead  
> **Single JTBD:** Find proven fixes and walkthroughs, review SOP changes, and quantify cumulative ESG savings.

```text
[walkthroughs] Tech Walkthroughs                                     [■ Upload Tech Capture ■]
 Recertification ▬▬▬▬▬▬▬▬▭ 4/5 · ╭ 🔍 Search… ╮ (Required) (Watchlist) · (■CNC Milling■) (Vision QA) (IM-05) …
 ╭─ CNC Milling · N videos ─────────────────────────────────────────────╮
 │ [▶ 104×56] Insert change & torque check                 mm:ss  (☆)  │  → 1040px drawer: WalkthroughPlayer
 ╰──────────────────────────────────────────────────────────────────────╯

[impact] Knowledge Base                         [ Benchmark assumptions ] [■ Model a scenario ■]
 ╭ Scrap saved (accent) ╮ ╭ Downtime saved (amber) ╮ ╭ CO₂ offset (green) ╮
 ╭ Ask the knowledge base  [Verified 8D fix] [SOP] [Walkthrough] ╮
 ╭ Signed-off 8D fixes: 8D · Problem · Root cause · Fix · Proof · CO₂ · Signed off ╮ → EightDSheet drawer

[sops] SOP Library                                          [ Export CSV ] [■ New Procedure ■]
 [■ Needs review ■] SOP-… revision reason…                                   Review changes →
 ╭ search · category · sort │ SOP · Procedure · Machine/Station · Rev · Updated · › ╮ → SopDetailDrawer (diff)
```

---

## 7. Screen 5: System Topology Workflow

> **Full Specification:** [`system_topology_workflow_wireframe.md`](../wireframe/system_topology_workflow_wireframe.md)  
> **Target Personas:** Shift Leader, Plant Operations Manager, Systems & Automation Architect  
> **Single JTBD:** Visualize real-time multi-agent execution paths, inspect AI confidence & Invariant #3 decision gates, and audit node health.

```text
 System Architecture & Execution Graph (Vertical Execution Pipeline)             [ (Nominal) [■ Active CNC-02 ■] (Streak) ]
 Continuous top-to-bottom reactive swarm: Edge Detection -> Swarm RCA -> Decision Gates -> Guided Fix -> Verification
 ╭── Floating Canvas Controls ────────────────────────────────────────────────────────────────────────╮
 │ [ + Zoom In ] [ - Zoom Out ] [ 100% Reset ] [ [ ] Fit to View ] [ (M) Minimap ]                    │
 ╰────────────────────────────────────────────────────────────────────────────────────────────────────╯
 ╭─ PHASE A: DETECTION & INGESTION (Top) ─────────────────────────────────────────────────────────────╮
 │ [1] Camera / Optical Station (Gemma 3 Edge) ───> [2] Pub/Sub & Orchestrator (SPC UCL Breach Event) │
 │                                                  │                                                 │
 │                                                  ▼ (Open Incident)                                 │
 │                                                  [3] Quality Inspector Agent (ADK Vision & SPC)    │
 ╰──────────────────────────────────────────────────╪─────────────────────────────────────────────────╯
                                                    │
                                                    ▼ (Trigger RCA)
 ╭─ PHASE B: TRACING & ROOT CAUSE ANALYSIS (RCA) ───╧─────────────────────────────────────────────────╮
 │ [4] Traceability Agent (BigQuery Lot)     [5] Process Analyst (Vibration Telemetry)                │
 │         │                                         │                                                │
 │         └────────────────────────┬────────────────┘                                                │
 │                                  ▼                                                                 │
 │                                  [6] Root Cause Agent (5-Whys + Vertex RAG Search)                 │
 │                                  │                                                                 │
 │                                  ▼                                                                 │
 │                         < Decision Gate 1: Conf >= 0.70? >                                         │
 │                         ├── NO (< 0.70)  ──> [6b] Diagnostic Agent (status: awaiting_evidence)     │
 │                         │                    └──> [6c] Technician Photo (Gemini Vision)            │
 │                         │                         └──> Nối vào Phase C: Copilot / Resolution       │
 │                         └── YES (>= 0.70) ──> Dẫn thẳng vào Phase C                                │
 ╰──────────────────────────────────────────────────╪─────────────────────────────────────────────────╯
                                                    │
                                                    ▼ (Verified Root Cause Dossier ➔ Resolution)
 ╭─ PHASE C: RESOLUTION & FIELD INTERVENTION ───────╧─────────────────────────────────────────────────╮
 │ [7] Copilot Agent (Gemini Live)                   [8] Incident Scribe Agent (WorkOrder, 8D, SOP)   │
 │         │                                                 │                                        │
 │         └────────────────────────┬────────────────────────┘                                        │
 │                                  ▼                                                                 │
 │                                  [9] [Repair Done] · Bay Tech Confirmation (48px Primary CTA)      │
 ╰──────────────────────────────────╪─────────────────────────────────────────────────────────────────╯
                                    │
                                    ▼ (Confirm Repair Completed)
 ╭─ PHASE D: VERIFICATION & LEARNING (Bottom) ──────╧─────────────────────────────────────────────────╮
 │ [10] Verify Repair (Conveyor Optical Inspection CAM-EOL)                                           │
 │                                  │                                                                 │
 │                                  ▼                                                                 │
 │                         < Decision Gate 2: Invariant #3 Streak >= 50 Clean Parts? >                │
 │                         [████████████████░░░░]  42 / 50 Clean Consecutive Parts                    │
 │                         ├── NO (Defect Detected) ──> Reset to 0/50 & Escalate Alarm (Re-inspect)   │
 │                         └── YES (Streak 50/50 OK)──> [Close Incident] Continuous Learning Agent    │
 │                                                              │                                     │
 │                                                              ▼                                     │
 │                                                      [12] Shift Leader Approval Gate (E-Signature) │
 │                                                              │ [HARD-LOCKED until Streak >= 50]    │
 │                                                              ▼                                     │
 │                                                      STATUS: CLOSED & NOMINAL RELEASE              │
 ╰────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

---

## 8. End-to-End UI State & Transition Matrix

How UI components change across both surfaces through an incident lifecycle:

| State | UI change |
|---|---|
| **Nominal** | No AnomalyBanner, no header anomaly chip; fleet table shows green Nominal chips. |
| **Anomaly** | AnomalyBanner + hot row in the fleet table + header anomaly chip (Screen 1). |
| **`awaiting_evidence`** | Mobile: Active › Collect evidence card (`Needs evidence`); evidence detail with orange confidence ring. |
| **`repairing`** | Mobile: Active › Repairs card → Repair brief → guided repair (Gemini Live). |
| **`verifying`** | Mobile: Processing `Verifying parts n/50`. Desktop: Step 4 StreakGate fills; Step 5 button locked. Any defect resets the streak (Invariant #3). |
| **`closed`** | Desktop: Step 5 `Approve 8D & Release Line` unlocks (`Button` variant `primary`). Mobile: `Awaiting lead`. |
| **approved** | Mobile: order moves to Completed. Knowledge Base gains a signed-off 8D row and its KPI cards increment. |
| **`escalated` / `error`** | Desktop: StatusReasonBanner. Mobile: `Chip` tone `danger` `Escalated` + `Incident Notice` card. |
