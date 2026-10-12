# Kaizen Agent — Master UI Wireframes & User Stories Specification

> **Document Version:** 1.2.0  
> **Target Design System:** [`docs/DESIGN.md`](../DESIGN.md) (shadcn/ui Light Mode)  
> **Terminology:** Unified **Agent Team** across all screens and documentation.  
> **Key Architecture Rules:** Calm Technology, 3-Tier Progressive Disclosure, Single JTBD per Screen, Strict Radius Hierarchy (`rounded-xl` for Cards, `rounded-lg` for Banners, `rounded-md` for Buttons/Inputs, `rounded-full` for Badges, `rounded-sm` for Checkboxes).

---

## 1. Executive Summary & Methodology Alignment

Kaizen Agent organizes its user experience around **two closed feedback loops** adhering to the design methodology defined in [`docs/DESIGN.md`](../DESIGN.md):

1. **The Real-Time Operational Loop:** Detect, isolate, repair, and verify physical production anomalies on the shop floor within minutes.
2. **The Kaizen Knowledge & Sustainability Loop:** Institutionalize proven 8D fixes into long-term organizational memory, update SOPs, and quantify ESG savings.

### 1.1. Application Shell & 3-Tier Progressive Disclosure Matrix

The application is structured into a **Persistent Left Sidebar Base Shell** (`docs/wireframes/00_base_layout.md`) and **4 specialized screen content modules**. Every page focuses strictly on its internal content area (`<main>` slot):

| Module / Screen | Single Job-to-be-Done (JTBD) | Tier 1: Glance (1s) | Tier 2: Focus (5s) | Tier 3: Deep Dive (On-Demand) | Dedicated Spec |
|---|---|---|---|---|---|
| **Base Application Shell** | Navigation, cell switching, Demo controls, SSE connectivity | Brand & Cell Line Selector | Operational & Knowledge Nav Groups | Demo Simulation Control Bar (Inject/Reset) & Role Switcher | [`00_base_layout.md`](./00_base_layout.md) |
| **Screen 1: Line Overview (`/`)** | Line health monitoring & instant 1-click dispatch | Global Status Pill Badge + 3 KPI Cards | Top Anomaly Alert Banner + Machine Row Highlight + CTAs | Slide-over Agent Diagnostics Drawer (FFT Vibration Spectrum in mm/s + Agent Team Snapshot) | [`01_line_overview.md`](./01_line_overview.md) |
| **Screen 2: Technician Copilot (`/copilot`)** | Bay-side triage, macro metrology, repair execution | Pinned Bay Header (`CNC-02`) & Turret Slot (`T07`) | State 2-DIAG Macro Metrology + 3-Step Physical Checklist (WNMG-080408, 45 Nm) | Gemini Live Voice/Vision dialog drawer + 30s SOP procedural video modal | [`02_technician_copilot.md`](./02_technician_copilot.md) |
| **Screen 3: Incident Workspace (`/incidents/:id`)** | Product-evidence verification & 8D approval sign-off | Incident ID & Status + Live 50-Part Optical Streak Gate | Batch Defect Rate + 8D Summary + Shift Leader Sign-Off CTA (Gated) | **Live Agent Team Reasoning Stream** (Live vs History) + 5-Whys Tree Tab + Telemetry Tab | [`03_incident_workspace.md`](./03_incident_workspace.md) |
| **Screen 4: Knowledge Hub (`/knowledge`)** | Institutional memory search & ESG savings quantification | 3 Sustainability KPI Cards (Scrap, Downtime, CO₂ Offset) | Sub-tabs (RAG Solutions vs SOPs) + Search Bar & Category Chips | Historical 8D Dossier Slide-Over Sheet + Direct Google Drive Link + Video Modal | [`04_knowledge_sustainability_hub.md`](./04_knowledge_sustainability_hub.md) |

---

## 2. Base Application Shell (Persistent Left Sidebar)

> **Full Specification:** [`00_base_layout.md`](./00_base_layout.md)  
> **Layout Shell:** Persistent Left Sidebar (`w-64`) + Top Header Bar (`h-14`) + Fluid `<main>` Content Area.

```text
+-----------------------+--------------------------------------------------------------------------------------------------------------------------------+
|  KAIZEN AGENT         | Cell Line 1 / Line Overview        [ Scenario: CNC Tool Wear (90s) v ] [⚡ Inject Defect] [↺ Reset] [⏱ 12.4s]  [John Tran (Lead) v]  |
|  Cell Line 1: Turning | <-- TOP HEADER BAR (h-14, bg-background/95 border-b) ------------------------------------------------------------------------+ |
+-----------------------+                                                                                                                                |
|  OPERATIONAL LOOP     | +-- PAGE CONTENT CONTAINER (<main class="p-6 space-y-6">) -------------------------------------------------------------------+ |
|  [#] Line Overview *  | |                                                                                                                            | |
|  [T] Tech Copilot     | |   {All pages mount their focused domain content modules inside this container}                                             | |
|  [!] Incidents (1)    | |                                                                                                                            | |
|                       | |   - Screen 1: Top Destructive Alert + 3 KPI Cards + Machine Fleet Table                                                    | |
|  KNOWLEDGE LOOP       | |   - Screen 3: Verification 50-Part Streak Gate + Live Agent Team Stream + 8D Sign-Off                                      | |
|  [?] Knowledge & ESG  | |   - Screen 4: 3 ESG KPI Cards + Sub-tabs + RAG Knowledge Search Bar + Verified Solutions Table                              | |
|  [@] SOP Change Log   | |                                                                                                                            | |
|                       | |                                                                                                                            | |
|-----------------------| |                                                                                                                            | |
| (o) Live Connected    | |                                                                                                                            | |
| Shift A (06:00-14:00) | +----------------------------------------------------------------------------------------------------------------------------+ |
+-----------------------+--------------------------------------------------------------------------------------------------------------------------------+
```

---

## 3. Screen 1: Line Overview & Machine List

> **Full Specification:** [`01_line_overview.md`](./01_line_overview.md)  
> **Target Persona:** Shift Leader (John Tran)  
> **Single JTBD:** Glance at line health in <3s, detect anomalies immediately, dispatch technician with 1 click.

```text
+-----------------------+--------------------------------------------------------------------------------------------------------------------------------+
|  KAIZEN AGENT         | Cell Line 1 / Line Overview        [ Scenario: CNC Tool Wear (90s) v ] [⚡ Inject Defect] [↺ Reset] [⏱ 12.4s]  [John Tran (Lead) v]  |
|  Cell Line 1: Turning | <-- TOP HEADER BAR (h-14) ----------------------------------------------------------------------------------------------------+ |
+-----------------------+                                                                                                                                |
|                       | +-- PAGE HEADER (<div class="flex items-center justify-between pb-4 border-b">) ---------------------------------------------+ |
|  OPERATIONAL LOOP     | | Cell Line 1 Overview                                                                 [ (↻) Refresh ] [ Export Shift Report ] | |
|  [#] Line Overview *  | | Real-time machine fleet telemetry, statistical process control (SPC), and instant dispatch                                  | |
|  [T] Tech Copilot     | +----------------------------------------------------------------------------------------------------------------------------+ |
|  [!] Incidents (1)    |                                                                                                                                |
|                       | === TIER 2 (FOCUS): ACTIONABLE ANOMALY ALERT BANNER (rounded-lg) ============================================================ |
|  KNOWLEDGE LOOP       | +----------------------------------------------------------------------------------------------------------------------------+ |
|  [?] Knowledge & ESG  | | (!) CNC-02 (Bay 4): Tool T07 Severe Flank Wear Exceeding SPC Limit                                                         | |
|  [@] SOP Change Log   | |     Defect Rate: 1.42% (UCL: 0.25%) | Spindle Vibration: 2.84 mm/s (Base: 1.50 mm/s) | Part: Housing-B42 (FC250)           | |
|                       | |     Recommended Action: Replace insert with WNMG-080408, calibrate torque 45 Nm.                                           | |
|                       | |                                                                                                                            | |
|                       | |     [ Dispatch Floor Copilot -> ]           [ View Incident Workspace ]           [ Dismiss Banner ]                       | |
|                       | +----------------------------------------------------------------------------------------------------------------------------+ |
|                       |                                                                                                                                |
|                       | === TIER 1 (GLANCE): 3 HIGH-LEVEL KPI METRICS (rounded-xl) ================================================================== |
|                       | +-- LINE OEE ------------+  +-- DEFECT RATE VS UCL -+  +-- ACTIVE INCIDENTS ----+                                              |
|                       | | Availability & Output  |  | SPC vs UCL Limit      |  | Resolution Pipeline    |                                              |
|                       | |   88.4%                |  |   1.42% (UCL: 0.25%)  |  |   1 Critical           |                                              |
|                       | |   -2.1% from target    |  |   (!) 5.6x UCL Breach |  |   INC-2026-042 (CNC-02)|                                              |
|                       | +------------------------+  +-----------------------+  +------------------------+                                              |
|                       |                                                                                                                                |
|                       | === TIER 2 (FOCUS): MACHINE FLEET TABLE (rounded-xl) ======================================================================== |
|                       | +----------------------------------------------------------------------------------------------------------------------------+ |
|                       | | Filter: [All (5)] [Nominal (4)] [Anomaly (1)] | Search: [ Q Filter bay or machine ID...                                  ] | |
|                       | +----------------------------------------------------------------------------------------------------------------------------+ |
|                       | | Machine ID  | Part Model  | Vibration (RMS) | Spindle Load | Status Badge   | Active Incident | Contextual Action          | |
|                       | +-------------+-------------+-----------------+--------------+----------------+-----------------+----------------------------+ |
|                       | | CNC-01      | Shaft-A12   | 1.46 mm/s       | 42.1 %       | (o) Nominal    | None            | [ ⚡ Agent Diagnostics ]   | |
|                       | | CNC-02      | Housing-B42 | 2.84 mm/s (!)   | 78.6 %       | (*) CRITICAL   | INC-2026-042    | [ OPEN COPILOT → ]         | |
|                       | | CNC-03      | Flange-F09  | 1.48 mm/s       | 45.0 %       | (o) Nominal    | None            | [ ⚡ Agent Diagnostics ]   | |
|                       | | CNC-04      | Gear-G15    | 1.41 mm/s       | 39.8 %       | (o) Nominal    | None            | [ ⚡ Agent Diagnostics ]   | |
|                       | | CONVEYOR-01 | Discrete    | 0.12 mm/s       | 18.2 %       | (o) Nominal    | None            | [ ⚡ Agent Diagnostics ]   | |
|                       | +----------------------------------------------------------------------------------------------------------------------------+ |
|-----------------------|                                                                                                                                |
| (o) Live Connected    | === TIER 3 (DEEP DIVE): ON-DEMAND AGENT DIAGNOSTICS DRAWER (Opens on clicking "[ ⚡ Agent Diagnostics ]") =================== |
| Shift A (06:00-14:00) | | [Slide-over Sheet]: Rolling 10-min FFT Spindle Vibration Spectrum + Agent Team Telemetry Correlation Snapshot (Off-canvas) | |
| John Tran (Lead)      | +----------------------------------------------------------------------------------------------------------------------------+ |
+-----------------------+--------------------------------------------------------------------------------------------------------------------------------+
```

---

## 4. Screen 2: Technician Floor Copilot & Machine Queue

> **Full Specification:** [`02_technician_copilot.md`](./02_technician_copilot.md)  
> **Target Persona:** Frontline Maintenance Technician (Tuan Le)  
> **Single JTBD:** Bay-side triage, macro visual metrology (State 2-DIAG), 3-step physical repair execution, and glove-friendly sign-off.

```text
[State 2-DIAG: Diagnostic Metrology Probe]            [State 2B: In-Bay Active Repair]
+---------------------------------------+             +---------------------------------------+
| [<] Machine Queue      CNC-02 (Bay 4) |             | [<] Machine Queue      CNC-02 (Bay 4) |
| Status: [ (!) FIELD DIAGNOSTIC PROBE ]|             | Status: [ (!) REPAIR IN PROGRESS ]    |
+---------------------------------------+             +---------------------------------------+
| === TIER 1 (GLANCE): TARGET PROBE === |             | === TIER 1 (GLANCE): TARGET SPECS === |
| Machine: CNC-02 // Tool T07           |             | Insert: WNMG-080408 (Bin A-14)        |
| Anomaly: Flank wear VB (Conf: 65%)    |             | Torque: 45 Nm (Calibrated Wrench)     |
|                                       |             |                                       |
| === TIER 2 (FOCUS): METROLOGY CAPTURE |             | === TIER 2 (FOCUS): 3-STEP SOP =====  |
| [ 📷 OPEN CAMERA / UPLOAD PHOTO ]     |             | [X] Step 1: LOTO & open door (44px)   |
|                                       |             | [ ] Step 2: Mount WNMG-080408 (44px)  |
| === GEMINI METROLOGY ASSESSMENT ===== |             | [ ] Step 3: Torque to 45 Nm (44px)    |
| • Flank wear VB: 0.42 mm (>0.35 mm)   |             |                                       |
| • RCA Confidence updated: 92% (Green) |             | === TIER 3 (HANDS-FREE): GEMINI LIVE =|
|                                       |             | (((( o )))) Voice Visualizer Active   |
+---------------------------------------+             +---------------------------------------+
| [ START INSERT REPLACEMENT (BAY 4) ->]|             | [ CONFIRM REPAIR COMPLETED ]          |
+---------------------------------------+             +---------------------------------------+
  ^--- Sticky 48px Glove Button (h-12)                  ^--- Sticky 48px Glove Button (h-12)
```

---

## 5. Screen 3: Incident Workspace & 8D Approval

> **Full Specification:** [`03_incident_workspace.md`](./03_incident_workspace.md)  
> **Target Personas:** Shift Leader (John Tran) & QA Engineer (Huong Pham)  
> **Single JTBD:** Monitor 50-good-part streak verification gate, audit Agent Team reasoning timeline, and sign off on 8D closure.

```text
+--------------------------------------------------------------------------------------------------------------------------------+
| Cell Line 1 / Incidents / INC-2026-042     [ (o) VERIFYING 38/50 ]  [ Scenario: CNC Tool Wear v ]  [⏱ 18.2s]    [John Tran (Lead) v]  |
| <-- TOP HEADER BAR (h-14) ----------------------------------------------------------------------------------------------------+ |
|                                                                                                                                |
| === TIER 1 (GLANCE): LIVE OPTICAL VERIFICATION GATE (rounded-xl) ============================================================ |
| +----------------------------------------------------------------------------------------------------------------------------+ |
| | Verification Gate: Conveyor Optical Inspection Station (Workpiece: Housing-B42)                                            | |
| | Progress: [====================================----------------] 38 / 50 Good Parts (76%)                                   | |
| | Batch Defect Rate: 0.00% (Nominal) | Gate Rule: 50 consecutive clean parts | Automatic Reset on Defect: ACTIVE             | |
| +----------------------------------------------------------------------------------------------------------------------------+ |
|                                                                                                                                |
| === TIER 3 (DEEP DIVE): AGENT TEAM REASONING (60%) ============  === TIER 2 (FOCUS): 8D REPORT SIGN-OFF (40%) ============= |
| +-------------------------------------------------------------+  +---------------------------------------------------------+ |
| | Tabs: [ ⚡ Agent Stream* ] [ 5-Whys ] [ Telemetry ] [ Lot ]   |  | Incident: INC-2026-042 | Equipment: CNC-02 / Tool T07   | |
| | Mode: (•) Live Stream Realtime   ( ) Historical Audit Log   |  | Severity: Major | Workpiece: Housing-B42 (FC250)        | |
| |-------------------------------------------------------------|  |---------------------------------------------------------| |
| | [09:40] 🔍 QUALITY INSPECTOR AGENT              [Conf: 98%] |  | D1 Team: J. Tran (Lead), T. Le (Tech), H. Pham (QA)     | |
| | • Finding: Surface vertical scratch, defect rate 1.42%>UCL  |  | D2 Problem: T07 flank wear causing Ra 3.8 um roughness  | |
| | • Evidence: 23/300 defective parts; edge filter dropped 96% |  | D3 Containment: Quarantined 14 pieces from Lot B42-03   | |
| | • Source: Gemma Edge Gateway + CAM-LINE01-EOL               |  | D4 Root Cause: Lot hardness HB240 (+15%) accelerated wear| |
| |-------------------------------------------------------------|  | D5 Corrective: WNMG-080408 insert, torque 45 Nm (Bin A14)| |
| | [09:41] 🔄 TRACEABILITY AGENT                   [Conf: 95%] |  | D6 Verification: 38/50 parts passed (Target: 50 streak) | |
| | • Finding: 100% defective parts from CNC-02 / Tool T07.     |  | D7 Prevention: Revise SOP-CNC-042 (piece count counter) | |
| | • Evidence: CNC-01/03 same raw lot with nominal 0.04% defect|  | D8 Recognition: Safe shift handover                     | |
| | • Source: BigQuery Discrete Topology Query                  |  +---------------------------------------------------------+ |
| |-------------------------------------------------------------|  | SHIFT LEADER SIGN-OFF BAR (Invariant #3)                | |
| | [09:42] 📊 PROCESS ANALYST AGENT                [Conf: 80%] |  | Remarks: [ Verified torque 45 Nm and 50 clean parts   ] | |
| | • Finding: Spindle vibration surged +35% starting at 09:30. |  |                                                         | |
| | • Evidence: Vibration 2.84 mm/s (Base: 1.50 mm/s); Curr +12%|  | [ 🔒 LOCKED — AWAITING 50 GOOD PARTS (38/50) ]          | |
| | • Source: BigQuery Sensor Window (09:00 - 10:00)            |  |   *(Unlocks into solid Slate button at 50/50 passed)    | |
| |-------------------------------------------------------------|  +---------------------------------------------------------+ |
| | [09:42] 📖 KNOWLEDGE RAG AGENT                  [Conf: 90%] |                                                              |
| | • Finding: Matches tool wear pattern > 2,000 pcs lifetime.  |                                                              |
| | • Source: CNC Manual p.112 • Maint Log T07 • 8D 2026-03-12  |                                                              |
| |-------------------------------------------------------------|                                                              |
| | [09:43] 🧠 ROOT CAUSE AGENT (RCA)               [Conf: 87%] |                                                              |
| | • Finding: Tool T07 worn out due to calendar-based schedule |                                                              |
| |   lacking piece counter and uncompensated hardness HB240.   |                                                              |
| | • Synthesis: 5-Whys deduction complete • Ready for repair.  |                                                              |
| +-------------------------------------------------------------+                                                              |
+--------------------------------------------------------------------------------------------------------------------------------+
```

---

## 6. Screen 4: Kaizen Knowledge & Sustainability Hub

> **Full Specification:** [`04_knowledge_sustainability_hub.md`](./04_knowledge_sustainability_hub.md)  
> **Target Personas:** Plant Manager (David Vu), Continuous Improvement (Kaizen) Lead, ESG Lead  
> **Single JTBD:** Query institutional 8D memory via RAG, audit cumulative ESG savings, and inspect Google Drive source provenance.

```text
+-----------------------+--------------------------------------------------------------------------------------------------------------------------------+
|  KAIZEN AGENT         | Cell Line 1 / Knowledge & ESG Hub  [ Scenario: CNC Tool Wear v ]  [⚡ Inject Defect]  [↺ Reset]  [⏱ Baseline]  [David Vu (Mgr) v]      |
|  Cell Line 1: Turning | <-- TOP HEADER BAR (h-14) ----------------------------------------------------------------------------------------------------+ |
+-----------------------+                                                                                                                                |
|                       | === TIER 1 (GLANCE): 3 SUSTAINABILITY KPI METRIC CARDS (rounded-xl) ========================================================== |
|  OPERATIONAL LOOP     | +-- ESG: SCRAP AVOIDED --+  +-- ESG: DOWNTIME SAVED -+  +-- ESG: CO2 REDUCED -----+                                            |
|  [#] Line Overview    | | Raw Cast Iron Saved    |  | Stoppages Saved        |  | Prevented Remelt        |                                            |
|  [T] Tech Copilot     | |   1.28 Tons (428 Pcs)  |  |   18.5 Hours ($24,050) |  |   3,840 kg CO2e         |                                            |
|  [!] Incidents (1)    | |   (^) +34% vs prior mo |  |   (^) 94.2% avail      |  |   Equiv. 160 trees      |                                            |
|                       | +------------------------+  +------------------------+  +-------------------------+                                            |
|  KNOWLEDGE LOOP       |                                                                                                                                |
|  [?] Knowledge & ESG* | === TIER 2 (FOCUS): SUB-TABS & RAG KNOWLEDGE SEARCH (rounded-xl) ============================================================ |
|  [@] SOP Change Log   | Sub-tabs: [ (•) Verified 8D Solutions (RAG) ]  [ ( ) SOP Revision Registry (Change Log) ]                                      |
|                       | +----------------------------------------------------------------------------------------------------------------------------+ |
|                       | | [ Q Search past anomalies, tooling codes (e.g. WNMG-080408), 5-Whys, or SOPs...                                 ] [Search] | |
|                       | | Filters: (x) All (24)  ( ) Tool Wear (11)  ( ) Thermal (6)  ( ) Spindle (4)  ( ) Material (3)                              | |
|                       | +----------------------------------------------------------------------------------------------------------------------------+ |
|                       |                                                                                                                                |
|                       | === TIER 2 (FOCUS): VERIFIED KAIZEN SOLUTIONS TABLE (rounded-xl) ============================================================ |
|                       | +----------------------------------------------------------------------------------------------------------------------------+ |
|                       | | Anomaly Symptom  | Machine/Tool | Validated Root Cause  | Permanent Fix / SOP  | Source Provenance     | Video / Actions     | |
|                       | +------------------+--------------+-----------------------+----------------------+-----------------------+---------------------+ |
|                       | | Flank Wear VB>0.3| CNC-02 / T07 | Lot hardness HB 240   | WNMG-080408 (45 Nm)  | [💻 Google Drive Doc] | [> 30s SOP Video]   | |
|                       | | High Roughness   | Lathe Cell   | Lack of feed scaling  | SOP-CNC-042 v2.1     | INC-2026-042 Dossier  | [ View 8D Sheet ]   | |
|                       | +------------------+--------------+-----------------------+----------------------+-----------------------+---------------------+ |
|                       | | Thermal Drift    | CNC-01 / Main| Coolant chiller flow  | Threshold set 14L/min| [💻 Google Drive Doc] | [> 30s SOP Video]   | |
|                       | | Z-axis Drift     | Mill Cell    | Filter debris buildup | SOP-CHL-008 v1.4     | INC-2026-038 Dossier  | [ View 8D Sheet ]   | |
|                       | +------------------+--------------+-----------------------+----------------------+-----------------------+---------------------+ |
|                       | | Short Fill Cav #3| IM-05 / M03  | Material dryer dew pt | Replace dryer filter | [💻 Google Drive Doc] | [> 30s SOP Video]   | |
|                       | | Sink Marks ABS   | Molding Cell | Dew pt rose to -18 °C | SOP-IM-019 v2.0      | INC-2026-029 Dossier  | [ View 8D Sheet ]   | |
|                       | +----------------------------------------------------------------------------------------------------------------------------+ |
|-----------------------|                                                                                                                                |
| (o) Live Connected    | === TIER 3 (DEEP DIVE): HISTORICAL 8D DOSSIER SLIDE-OVER SHEET (Opens on row click) ========================================= |
| Shift A (06:00-14:00) | | [Slide-over Sheet]: Complete 5-Whys tree + BigQuery telemetry + Google Drive link + Full SOP Document                      | |
| David Vu (Plant Mgr)  | +----------------------------------------------------------------------------------------------------------------------------+ |
+-----------------------+--------------------------------------------------------------------------------------------------------------------------------+
```

---

## 7. End-to-End UI State & Transition Matrix

The diagram below maps how UI components dynamically transition throughout an anomaly incident lifecycle across all screens:

```
[Normal Production (90% of shift)]
  │ • Screen 1: Canvas completely serene, all badges green Nominal, defect rate 0.04% < 0.25% UCL
  │
  ▼ (SPC Defect Rate jumps to 1.42% > 0.25% UCL or Demo Inject triggered)
[State: ANOMALY_DETECTED]
  │ • Screen 1: Top Destructive Alert banner slides in with 1-click CTA "Dispatch Copilot"
  │ • Screen 1: CNC-02 row highlighted with red CRITICAL badge
  │
  ▼ (Shift Leader taps "Dispatch Floor Copilot" -> Technician opens mobile)
[State: AWAITING_EVIDENCE (If Agent Team RCA confidence < 70%)]
  │ • Screen 2: Technician at CNC-02 sees State 2-DIAG (Diagnostic Evidence Probe)
  │ • Screen 2: Gemini Live voice directive: "Take macro close-up of Tool T07 cutting edge to inspect flank wear"
  │ • Screen 2: Technician takes macro photo -> Gemini Metrology measures VB = 0.42 mm (> 0.35 mm)
  │ • Agent Team RCA confidence converges to 92% -> Transitions to Repair
  │
  ▼ (RCA Confident >= 70%)
[State: REPAIR_IN_PROGRESS]
  │ • Screen 2: Technician follows State 2B 3-step checklist (WNMG-080408, 45 Nm torque)
  │ • Screen 2: Hands-free Gemini Live audio visualizer active if hands are greasy
  │ • Screen 2: Technician taps sticky 48px button "CONFIRM REPAIR COMPLETED"
  │
  ▼ (Repair confirmed on Blackboard -> Physical Line Restored)
[State: VERIFYING (Streak 0..49 / 50)]
  │ • Screen 3: Conveyor optical inspection bar activates: Progress increments dynamically
  │ • Screen 3: Shift Leader approval button is HARD-DISABLED (🔒 Invariant #3)
  │ • Edge Case: If any single defect detected, streak resets to 0/50 immediately
  │
  ▼ (Verification counter reaches 50/50 consecutive clean workpieces)
[State: CLOSED (Streak 50/50 Achieved)]
  │ • Screen 3: Incident automatically transitions status to 'closed' (pending_approval: shift_leader)
  │ • Screen 3: Verification gate turns solid emerald green
  │ • Screen 3: Shift Leader approval button UNLOCKS into solid primary Slate button: [ ✔ SIGN OFF & APPROVE 8D REPORT ]
  │
  ▼ (Shift Leader enters remarks and taps "Sign Off & Approve 8D Report")
[State: APPROVED & LEARNED]
  │ • Screen 3: Incident marked approved: true and permanently archived
  │ • Screen 4: 8D solution & updated SOP-CNC-042 v2.1 indexed into RAG memory with Google Drive provenance
  │ • Screen 4: Sustainability KPIs increment (+84 scrap parts avoided, +$3,200 downtime saved)
  │ • Screen 1: Top alert banner dismissed; Line returns to all-green Nominal status
```
