# Kaizen Agent — Master UI Wireframes & User Stories Specification

> **Document Version:** 1.1.0  
> **Target Design System:** [`docs/DESIGN.md`](../DESIGN.md) (shadcn/ui Light Mode)  
> **Key Architecture Rules:** Calm Technology, 3-Tier Progressive Disclosure, Single JTBD per Screen, Strict Radius Hierarchy (`rounded-xl` for Cards, `rounded-lg` for Banners, `rounded-md` for Buttons/Inputs, `rounded-full` for Badges).


---

## 1. Executive Summary & Methodology Alignment

Kaizen Agent organizes its user experience around **two closed feedback loops** adhering to the design methodology defined in [`docs/DESIGN.md`](../DESIGN.md):

1. **The Real-Time Operational Loop:** Detect, isolate, repair, and verify physical production anomalies on the shop floor within minutes.
2. **The Kaizen Knowledge & Sustainability Loop:** Institutionalize proven 8D fixes into long-term organizational memory, update SOPs, and quantify ESG savings.

### 1.1. Application Shell & 3-Tier Progressive Disclosure Matrix

The application is structured into a **Persistent Left Sidebar Base Shell** (`docs/wireframes/00_base_layout.md`) and **4 specialized screen content modules**. Every page focuses strictly on its internal content area (`<main>` slot):

| Module / Screen | Single Job-to-be-Done (JTBD) | Tier 1: Glance (1s) | Tier 2: Focus (5s) | Tier 3: Deep Dive (On-Demand) | Dedicated Spec |
|---|---|---|---|---|---|
| **Base Application Shell** | Navigation, cell switching, SSE connectivity | Brand & Cell Line Selector | Operational & Knowledge Nav Groups | Real-time SSE Pulse & Shift User Status | [`00_base_layout.md`](./00_base_layout.md) |
| **Screen 1: Line Overview (`/`)** | Line health monitoring & instant 1-click dispatch | Global Status Pill Badge + 3 KPI Cards | Top Anomaly Alert Banner + Machine Row Highlight + CTAs | Slide-over Diagnostics Drawer (FFT Vibration Spectrum) | [`01_line_overview.md`](./01_line_overview.md) |
| **Screen 2: Technician Copilot (`/copilot`)** | Bay-side machine triage & physical repair execution | Pinned Bay Header (`CNC-02`) & Turret Slot (`T07`) | 3-Step Physical Checklist (WNMG-080408, 45 Nm) + Sticky Button | Gemini Live Voice/Vision dialog drawer + 30s SOP video modal | [`02_technician_copilot.md`](./02_technician_copilot.md) |
| **Screen 3: Incident Workspace (`/incidents/:id`)** | Product-evidence verification & 8D approval sign-off | Incident ID & Status + Live 50-Part Optical Streak Gate | Batch Defect Rate + 8D Summary + Shift Leader Approval CTA | Interactive 5-Whys Causal Tree Tab + Supplier Lot Tab | [`03_incident_workspace.md`](./03_incident_workspace.md) |
| **Screen 4: Knowledge Hub (`/knowledge`)** | Institutional memory search & ESG savings quantification | 3 Sustainability KPI Cards (Scrap, Downtime, CO₂ Offset) | RAG Search Input & Category Filter Chips + Solutions Table | Historical 8D Dossier Slide-Over Sheet + Full SOP PDF | [`04_knowledge_sustainability_hub.md`](./04_knowledge_sustainability_hub.md) |

---

## 2. Base Application Shell (Persistent Left Sidebar)

> **Full Specification:** [`00_base_layout.md`](./00_base_layout.md)  
> **Layout Shell:** Persistent Left Sidebar (`w-64`) + Top Header Bar (`h-14`) + Fluid `<main>` Content Area.

```text
+-----------------------+------------------------------------------------------------------------------------------+
|  KAIZEN AGENT         |  Cell Line 1  /  Line Overview                 Badge: [ (!) 1 ANOMALY ]  [ ⌘K ] [User v] |
|  Cell Line 1: Turning |  <-- TOP HEADER BAR (h-14) ------------------------------------------------------------+ |
+-----------------------+                                                                                          |
|  OPERATIONAL LOOP     |  +-- PAGE CONTENT SLOT (<main class="p-6 space-y-6">) ---------------------------------+ |
|  [#] Line Overview *  |  |                                                                                     | |
|  [T] Tech Copilot     |  |   {All pages mount their focused content inside this container}                     | |
|  [!] Incidents  (1)   |  |                                                                                     | |
|                       |  |   - Screen 1: Top Destructive Alert + 3 KPI Cards + Machine Fleet Table             | |
|  KNOWLEDGE LOOP       |  |   - Screen 3: Verification 50-Part Streak Gate + 5-Whys Tree + 8D Sign-Off          | |
|  [?] Knowledge & ESG  |  |   - Screen 4: 3 ESG KPI Cards + RAG Search Bar + Verified Solutions Table           | |
|  [@] SOP Change Log   |  |                                                                                     | |
|                       |  |                                                                                     | |
|-----------------------|  |                                                                                     | |
| (o) Live Connected    |  |                                                                                     | |
| Shift A (06:00-14:00) |  +-------------------------------------------------------------------------------------+ |
+-----------------------+------------------------------------------------------------------------------------------+
```

---

## 3. Screen 1: Line Overview & Machine List

> **Full Specification:** [`01_line_overview.md`](./01_line_overview.md)  
> **Target Persona:** Shift Leader (John Tran)  
> **Single JTBD:** Glance at line health in <3s, detect anomalies immediately, dispatch technician with 1 click.


### Wireframe Architecture (Desktop 1440px)
```text
+-----------------------+------------------------------------------------------------------------------------------+
|  KAIZEN AGENT         |  Cell Line 1  /  Line Overview                 Badge: [ (!) 1 ANOMALY ]  [ ⌘K ] [User v] |
|  Cell Line 1: Turning |  <-- TOP HEADER BAR (h-14) ------------------------------------------------------------+ |
+-----------------------+                                                                                          |
|                       |  +-- PAGE HEADER (<div class="flex items-center justify-between pb-4 border-b">) ------+  |
|  OPERATIONAL LOOP     |  |  Cell Line 1 Overview                           [ (↻) Refresh ] [ Export Report ]   |  |
|  [#] Line Overview *  |  |  Real-time machine telemetry, SPC thresholds, and instant dispatch                  |  |
|  [T] Tech Copilot     |  +------------------------------------------------------------------------------------+  |
|  [!] Incidents  (1)   |                                                                                          |
|                       |  === TIER 2 (FOCUS): ACTIONABLE ANOMALY ALERT BANNER (rounded-lg) =====================  |
|  KNOWLEDGE LOOP       |  +------------------------------------------------------------------------------------+  |
|  [?] Knowledge & ESG  |  | (!) CNC-02 (Bay 4): Tool T07 Severe Flank Wear Exceeding SPC Limit                 |  |
|  [@] SOP Change Log   |  |     Defect Rate: 1.42% (UCL: 0.25%) | Vibration: 2.84g | Part: Housing-B42          |  |
|                       |  |     Recommended Action: Replace insert with WNMG-080408, torque 45 Nm.             |  |
|                       |  |                                                                                    |  |
|                       |  |     [ Dispatch Floor Copilot -> ]    [ View Incident Workspace ]    [ Dismiss ]     |  |
|                       |  +------------------------------------------------------------------------------------+  |
|                       |                                                                                          |
|                       |  === TIER 1 (GLANCE): 3 HIGH-LEVEL KPI METRICS (rounded-xl) ==========================  |
|                       |  +-- LINE OEE ------------+  +-- DEFECT RATE VS UCL -+  +-- ACTIVE INCIDENTS ----+       |
|                       |  | Availability & Output  |  | SPC vs UCL Limit      |  | Resolution Pipeline    |       |
|                       |  |   88.4%                |  |   1.42% (UCL: 0.25%)  |  |   1 Critical           |       |
|                       |  |   -2.1% from target    |  |   (!) 5.6x UCL Breach |  |   INC-2026-042 (CNC-02)|       |
|                       |  +------------------------+  +-----------------------+  +------------------------+       |
|                       |                                                                                          |
|                       |  === TIER 2 (FOCUS): MACHINE FLEET TABLE (rounded-xl) ================================  |
|                       |  +------------------------------------------------------------------------------------+  |
|                       |  | Filter: [All (5)] [Nominal (4)] [Anomaly (1)] | Search: [ Q Filter machine...   ]  |  |
|                       |  +------------------------------------------------------------------------------------+  |
|                       |  | Machine ID  | Part        | Vibration  | Spindle | Status Badge | Incident | Action    |  |
|                       |  +-------------+-------------+------------+---------+--------------+----------+-----------+  |
|                       |  | CNC-01      | Shaft-A12   | 0.38 g     | 42.1 %  | (o) Nominal  | None     | [ Diag ]  |  |
|                       |  | CNC-02      | Housing-B42 | 2.84 g (!) | 78.6 %  | (*) CRITICAL | INC-042  | [COPILOT] |  |
|                       |  | CNC-03      | Flange-F09  | 0.41 g     | 45.0 %  | (o) Nominal  | None     | [ Diag ]  |  |
|                       |  | CNC-04      | Gear-G15    | 0.35 g     | 39.8 %  | (o) Nominal  | None     | [ Diag ]  |  |
|                       |  | CONVEYOR-01 | Discrete    | 0.12 g     | 18.2 %  | (o) Nominal  | None     | [ Diag ]  |  |
|                       |  +------------------------------------------------------------------------------------+  |
|-----------------------|                                                                                          |
| (o) Live Connected    |  === TIER 3 (DEEP DIVE): ON-DEMAND DIAGNOSTICS DRAWER (Opens on clicking "[ Diag ]")==  |
| Shift A (06:00-14:00) |  | [Slide-over Sheet]: Rolling 10-min FFT Spindle Vibration Spectrum (Off-canvas)    |  |
| John Tran (Lead)      |  +------------------------------------------------------------------------------------+  |
+-----------------------+------------------------------------------------------------------------------------------+
  ^--- PERSISTENT LEFT SIDEBAR                               ^--- PAGE CONTENT SLOT (<main class="p-6">)
```

---

## 4. Screen 2: Technician Floor Copilot & Machine Queue

> **Full Specification:** [`02_technician_copilot.md`](./02_technician_copilot.md)  
> **Target Persona:** Frontline Maintenance Technician (Tuan Le)  
> **Single JTBD:** Bay-side machine triage, 3-step physical repair execution, and glove-friendly sign-off.

### Wireframe Architecture (Mobile 390px — In-Bay Active Repair State)
```text
+---------------------------------------+
| [<] Machine Queue      CNC-02 (Bay 4) |  <-- Navigates back to State 2A (Queue)
| Status: [ (!) REPAIR IN PROGRESS ]    |  <-- Red Destructive Badge (rounded-full)
+---------------------------------------+
|                                       |
| === TIER 1 (GLANCE): TARGET SPECS === |
| +-- TARGET MACHINE (rounded-xl) ----+ |
| | Machine: CNC-02 (Bay 4 - Lathe)   | |
| | Turret:  Tool T07 - Rough Turn    | |
| | Anomaly: Flank Wear (VB > 0.35mm) | |
| | Part:    Housing-B42 (FC250 Iron) | |
| | Insert:  WNMG-080408 (Bin A-14)   | |  <-- font-mono specs
| | Torque:  45 Nm (Calibrated Wrench)| |  <-- font-mono torque
| +-----------------------------------+ |
|                                       |
| === TIER 2 (FOCUS): 3-STEP SOP =====  |
| (Touch targets >= 44px, Checkboxes rounded-sm)
| +-- SOP-CNC-042 REPAIR STEPS -------+ |
| | [X] Step 1: Stop main spindle,    | |  <-- Large 44px tap target (Checked)
| |     engage LOTO & open door.      | |
| |                                   | |
| | [ ] Step 2: Remove worn insert.   | |  <-- Large 44px tap target
| |     Mount new WNMG-080408         | |      Insert: WNMG-080408
| |     (Storage: Bin A-14)           | |      Bin: A-14
| |                                   | |
| | [ ] Step 3: Use torque wrench,    | |  <-- Large 44px tap target
| |     tighten clamp screw to 45 Nm. | |      Spec: 45 Nm
| +-----------------------------------+ |
|                                       |
| === TIER 3 (DEEP DIVE / HANDS-FREE) = |
| +-- GEMINI LIVE VOICE & VISION -----+ |
| | (((( o )))) Voice Assistant Active| |  <-- Hands-free voice visualizer
| | "Say: 'Insert torqued to 45 Nm'   | |
| |                                   | |
| | [ (o) Voice Mic ] [ [o] Camera ]  | |  <-- Macro camera seat inspection
| +-----------------------------------+ |
| | [>] Watch 30s SOP Video Clip      | |  <-- Procedural video modal
| +-----------------------------------+ |
|                                       |
+---------------------------------------+
| [ CONFIRM REPAIR COMPLETED ]          |  <-- TIER 2: Sticky 48px Glove Button
+---------------------------------------+      Full width (h-12, Slate #0F172A)
```

---

## 5. Screen 3: Incident Workspace & 8D Approval

> **Full Specification:** [`03_incident_workspace.md`](./03_incident_workspace.md)  
> **Target Personas:** Shift Leader (John Tran) & QA Engineer (Huong Pham)  
> **Single JTBD:** Monitor 50-good-part streak verification gate and approve 8D closure on product evidence.

### Wireframe Architecture (Desktop 1440px)
```text
+-----------------------+------------------------------------------------------------------------------------------+
|  KAIZEN AGENT         |  Cell Line 1  /  Incidents  /  INC-2026-042    Badge: [ (o) VERIFYING 38/50 ]  [User v]  |
|  Cell Line 1: Turning |  <-- TOP HEADER BAR (h-14) ------------------------------------------------------------+ |
+-----------------------+                                                                                          |
|                       |  +-- PAGE HEADER (<div class="flex items-center justify-between pb-4 border-b">) ------+  |
|  OPERATIONAL LOOP     |  |  Incident Workspace: INC-2026-042              [ BigQuery Logs ] [ Export 8D (PDF) ]|  |
|  [#] Line Overview    |  |  Bay 4 (CNC-02) • Tool T07 Flank Wear • Optical Streak Verification Active           |  |
|  [T] Tech Copilot     |  +------------------------------------------------------------------------------------+  |
|  [!] Incidents (1) *  |                                                                                          |
|                       |  === TIER 1 (GLANCE): LIVE OPTICAL VERIFICATION GATE (rounded-xl) =====================  |
|  KNOWLEDGE LOOP       |  +------------------------------------------------------------------------------------+  |
|  [?] Knowledge & ESG  |  | Verification Gate: Conveyor Optical Inspection (Workpiece: Housing-B42)            |  |
|  [@] SOP Change Log   |  | Progress: [====================================----------------] 38 / 50 Good (76%) |  |
|                       |  | Batch Defect Rate: 0.00% (Nominal) | Gate: 50 consecutive passed | Reset on Defect |  |
|                       |  +------------------------------------------------------------------------------------+  |
|                       |                                                                                          |
|                       |  === TIER 3 (DEEP DIVE): SYNTHESIS (60%) ==  === TIER 2 (FOCUS): 8D SIGN-OFF (40%) ===  |
|                       |  +----------------------------------------+  +----------------------------------------+  |
|                       |  | Tabs: [ 5-Whys* ] [ Telemetry ] [ Lot ]|  | Incident: INC-042 | Severity: Major    |  |
|                       |  |                                        |  | D1 Team: J. Tran, T. Le, H. Pham       |  |
|                       |  | (1) Why: Surface roughness Ra 3.8 um?  |  | D2 Problem: T07 flank wear -> 1.42% err|  |
|                       |  |     --> Tool T07 insert edge worn out  |  | D3 Containment: Quarantined 14 pieces  |  |
|                       |  | (2) Why: Did tool wear accelerate?     |  | D4 Root Cause: Lot hardness HB240(+15%)|  |
|                       |  |     --> Spindle vibration rose to 2.84g|  | D5 Corrective: WNMG-080408, 45 Nm      |  |
|                       |  | (3) Why: Vibration rose during cut?    |  | D6 Verification: 38/50 parts passed    |  |
|                       |  |     --> Cutting resistance up 32%      |  | D7 Prevention: Revise SOP-CNC-042 table|  |
|                       |  | (4) Why: Cutting resistance rose?      |  +----------------------------------------+  |
|                       |  |     --> Lot #LOT-0312 hardness HB240   |  | SHIFT LEADER APPROVAL SIGN-OFF         |  |
|                       |  | (5) Root Cause: Feed rule lacked       |  | Remarks: [ Verified torque 45 Nm.    ] |  |
|                       |  |     dynamic hardness compensation      |  | [🔒 APPROVE 8D & CLOSE INCIDENT ]      |  |
|                       |  |                                        |  |   *(Unlocks at 50/50 clean parts)      |  |
|                       |  +----------------------------------------+  +----------------------------------------+  |
|-----------------------|                                                                                          |
| (o) Live Connected    |                                                                                          |
| Shift A (06:00-14:00) |                                                                                          |
| John Tran (Lead)      |                                                                                          |
+-----------------------+------------------------------------------------------------------------------------------+
  ^--- PERSISTENT LEFT SIDEBAR                               ^--- PAGE CONTENT SLOT (<main class="p-6">)
```

---

## 6. Screen 4: Kaizen Knowledge & Sustainability Hub

> **Full Specification:** [`04_knowledge_sustainability_hub.md`](./04_knowledge_sustainability_hub.md)  
> **Target Personas:** Plant Manager (David Vu), ESG & Continuous Improvement Leads  
> **Single JTBD:** Query institutional 8D memory via RAG and audit cumulative ESG & financial savings.


### Wireframe Architecture (Desktop 1440px)
```text
+-----------------------+------------------------------------------------------------------------------------------+
|  KAIZEN AGENT         |  Cell Line 1  /  Knowledge & ESG Hub           Plant: Haiphong Smart Cell      [User v]  |
|  Cell Line 1: Turning |  <-- TOP HEADER BAR (h-14) ------------------------------------------------------------+ |
+-----------------------+                                                                                          |
|                       |  +-- PAGE HEADER (<div class="flex items-center justify-between pb-4 border-b">) ------+  |
|  OPERATIONAL LOOP     |  |  Kaizen Knowledge & ESG Hub             [ Export ESG Report ] [ + Propose Kaizen ] |  |
|  [#] Line Overview    |  |  Institutional 8D memory, SOP change registry, and cumulative ESG footprint         |  |
|  [T] Tech Copilot     |  +------------------------------------------------------------------------------------+  |
|  [!] Incidents  (1)   |                                                                                          |
|                       |  === TIER 1 (GLANCE): 3 SUSTAINABILITY KPI METRIC CARDS (rounded-xl) ===================  |
|  KNOWLEDGE LOOP       |  +-- ESG: SCRAP AVOIDED --+  +-- ESG: DOWNTIME SAVED -+  +-- ESG: CO2 REDUCED -----+     |
|  [?] Knowledge & ESG* |  | Raw Cast Iron Saved    |  | Stoppages Saved        |  | Prevented Remelt        |     |
|  [@] SOP Change Log   |  |   1.28 Tons (428 Pcs)  |  |   18.5 Hours ($24,050) |  |   3,840 kg CO2e         |     |
|                       |  |   (^) +34% vs prior mo |  |   (^) 94.2% avail      |  |   Equiv. 160 trees      |     |
|                       |  +------------------------+  +------------------------+  +-------------------------+     |
|                       |                                                                                          |
|                       |  === TIER 2 (FOCUS): RAG KNOWLEDGE SEARCH & CATEGORY CHIPS (rounded-xl) ================  |
|                       |  +------------------------------------------------------------------------------------+  |
|                       |  | [ Q Search past anomalies, tooling codes (e.g. WNMG), 5-Whys, or SOPs... ] [Search]|  |
|                       |  | Filters: (x) All (24) ( ) Tool Wear (11) ( ) Thermal (6) ( ) Alignment (4)         |  |
|                       |  +------------------------------------------------------------------------------------+  |
|                       |                                                                                          |
|                       |  === TIER 2 (FOCUS): VERIFIED KAIZEN SOLUTIONS TABLE (rounded-xl) ====================  |
|                       |  +------------------------------------------------------------------------------------+  |
|                       |  | Anomaly Symptom  | Machine/Tool | Validated Root Cause  | Permanent Fix / SOP  |Video |  |
|                       |  +------------------+--------------+-----------------------+----------------------+------+  |
|                       |  | Flank Wear VB>0.3| CNC-02 / T07 | Lot hardness HB 240   | WNMG-080408 (45 Nm)  |[>Vid]|  |
|                       |  | High Roughness   | Lathe Cell   | Lack of feed scaling  | SOP-CNC-042 v2.1     |      |  |
|                       |  +------------------+--------------+-----------------------+----------------------+------+  |
|                       |  | Thermal Drift    | CNC-01 / Main| Coolant chiller flow  | Threshold set 14L/min|[>Vid]|  |
|                       |  | Z-axis Drift     | Mill Cell    | Filter debris buildup | SOP-CHL-008 v1.4     |      |  |
|                       |  +------------------+--------------+-----------------------+----------------------+------+  |
|                       |  | Optical False Pos| Conv-01      | Part tilt on belt     | Guide rail shim+1.5mm|[>Vid]|  |
|                       |  | Vision Gate Tag  | Inspection   | Ambient LED bleed     | SOP-CNV-012 v3.0     |      |  |
|                       |  +------------------------------------------------------------------------------------+  |
|-----------------------|                                                                                          |
| (o) Live Connected    |  === TIER 3 (DEEP DIVE): HISTORICAL 8D DOSSIER SLIDE-OVER SHEET (Opens on row click)==  |
| Shift A (06:00-14:00) |  | [Slide-over Sheet]: Complete 5-Whys tree + BigQuery telemetry + Full SOP Document |  |
| David Vu (Plant Mgr)  |  +------------------------------------------------------------------------------------+  |
+-----------------------+------------------------------------------------------------------------------------------+
  ^--- PERSISTENT LEFT SIDEBAR                               ^--- PAGE CONTENT SLOT (<main class="p-6">)
```

---

## 7. End-to-End UI State & Transition Matrix

The diagram below maps how UI components dynamically transition throughout an anomaly incident lifecycle across all screens:

```
[Normal Production (90% of shift)]
  │ • Screen 1: Canvas completely serene, all badges green Nominal, defect rate 0.04%
  │
  ▼ (SPC Defect Rate jumps to 1.42% > 0.25% UCL)
[State: ANOMALY_DETECTED]
  │ • Screen 1: Top Destructive Alert banner slides in with 1-click CTA "Dispatch Copilot"
  │ • Screen 1: CNC-02 row highlighted with red CRITICAL badge
  │
  ▼ (Shift Leader taps "Dispatch Floor Copilot" -> Technician opens mobile)
[State: REPAIR_IN_PROGRESS]
  │ • Screen 2: Technician at CNC-02 follows 3-step checklist (WNMG-080408, 45 Nm torque)
  │ • Screen 2: Hands-free Gemini Live audio visualizer active if hands are greasy
  │ • Screen 2: Technician taps sticky 48px button "CONFIRM REPAIR COMPLETED"
  │
  ▼ (Repair confirmed on Blackboard)
[State: VERIFYING (Streak 0..49 / 50)]
  │ • Screen 3: Conveyor optical inspection bar activates: Progress increments dynamically
  │ • Screen 3: Shift Leader approval button is HARD-DISABLED (🔒 Invariant #3)
  │ • Edge Case: If any single defect detected, streak resets to 0/50 immediately
  │
  ▼ (Verification counter reaches 50/50 consecutive clean workpieces)
[State: VERIFIED]
  │ • Screen 3: Verification gate turns solid green
  │ • Screen 3: Shift Leader approval button UNLOCKS into solid primary Slate button
  │
  ▼ (Shift Leader enters optional remarks and taps "Approve 8D & Close")
[State: CLOSED & LEARNED]
  │ • Screen 3: Incident marked CLOSED & ARCHIVED
  │ • Screen 4: 8D solution & updated SOP-CNC-042 v2.1 indexed into RAG memory
  │ • Screen 4: Sustainability KPIs increment (+84 scrap parts avoided, +$3,200 downtime saved)
  │ • Screen 1: Top alert banner dismissed; Line returns to all-green Nominal status
```
