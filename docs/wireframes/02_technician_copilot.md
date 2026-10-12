# Screen 2: Technician Floor Copilot & Machine Queue

> **Route:** `/copilot` (Dispatch Queue) • `/copilot?machine=CNC-02&mode=diagnostic` (Diagnostic Probe) • `/copilot?machine=CNC-02` (Repair Workspace)  
> **Viewport:** Mobile `390 × 844 px` (iPhone 14 / Industrial Handheld Terminal)  
> **Primary Persona:** Frontline Maintenance Technician (Tuan Le)  
> **Single Job-to-be-Done (JTBD):** Bay-Side Machine Triage, Macro Visual Metrology, Guided Physical Repair Execution, and Completion Handshake. *(Zero SPC distraction, zero administrative paperwork).*  
> **Design Standard:** [`docs/DESIGN.md`](../DESIGN.md) (shadcn/ui Light Mode)  
> **Terminology:** Unified **Agent Team** across all pages and documentation.

---

## 1. End-to-End User Flow & Technician Journey

The mobile floor copilot accompanies the frontline technician throughout the physical intervention lifecycle, including the **Evidence-Gathering Loop** (when Agent Team RCA confidence < 70%):

```mermaid
flowchart TD
    A["Shift Start / Mobile App Opened (/copilot)"] --> B{"Active Dispatch Queue?"}
    B -->|"No Incidents (Nominal)"| C["State 2D: Idle Queue (All Nominal)"]
    B -->|"Machines Need Action"| D["State 2A: Machine Dispatch Queue"]
    D -->|"Select High-Priority Bay (CNC-02)"| E{"Agent Team Status?"}
    
    subgraph S2_DIAG ["State 2-DIAG: In-Bay Diagnostic Probe (RCA < 70%)"]
        E -->|"Status: awaiting_evidence"| F["State 2-DIAG: Field Evidence Capture (/copilot?machine=CNC-02&mode=diagnostic)"]
        F --> F1["Gemini Live Voice: 'Take macro close-up of Tool T07 cutting edge to inspect flank wear'"]
        F1 --> F2["Technician captures macro photo -> POST /api/incidents/evidence"]
        F2 --> F3["Gemini Metrology assessment: VB = 0.42 mm (Limit 0.35 mm)"]
        F3 --> F4["Agent Team RCA converges to 92% confidence"]
        F4 --> G["Tap: [ START INSERT REPLACEMENT (BAY 4) -> ]"]
    end
    
    subgraph S2B ["State 2B: Bay-Side Physical Repair Execution"]
        E -->|"Status: repairing (Confident)"| G
        G --> H1["Tier 1: Pinned Bay CNC-02 & Tool T07 Slot"]
        H1 --> H2["Tier 2: 3-Step SOP Checklist (WNMG-080408, 45 Nm torque)"]
        H2 -.->|"Greasy / Gloved Hands"| H3["Tier 3: Gemini Live Hands-Free Voice Assistant"]
        H2 --> H4["Tap Sticky Bottom CTA: [ CONFIRM REPAIR COMPLETED ] (48px)"]
    end
    
    H4 --> I["State 2C: Post-Repair Handshake & Conveyor Streak Active"]
    I -->|"Conveyor Optical Verification"| J["Optical Camera verifies 0/50 clean parts on belt"]
    I -->|"Return to Triage"| D
```

---

## 2. Progressive Disclosure Architecture (3 Tiers per Screen State)

### 2.1. State 2A: Machine Dispatch Queue (`/copilot`)
- **Tier 1: Glance (1s):** Header with active shift badge (`Shift A • 06:00 - 14:00`), technician identity (`Tuan Le // TECH-08`), and active queue counter (`1 Critical Anomaly | 1 Preventive Maintenance`).
- **Tier 2: Focus (5s):** Prioritized machine dispatch cards:
  - **Card 1 (Critical Anomaly):** Machine `CNC-02 (Bay 4)`, Tool `T07`, Flank wear symptom (`VB > 0.35mm`, SPC defect rate `1.42%`), elapsed dispatch time (`8m ago`). Primary CTA: `[ START REPAIR (BAY 4) → ]`.
  - **Card 2 (Preventive Task):** Machine `CNC-04 (Bay 2)`, Tool `T03` life at 85%. Secondary CTA: `[ Accept Task ]`.
- **Tier 3: Deep Dive (On-Demand):** Filter tabs (`All (2)`, `Critical (1)`, `Preventive (1)`).

---

### 2.2. State 2-DIAG: Diagnostic Evidence Probe (`/copilot?machine=CNC-02&mode=diagnostic`)
- **Trigger Condition:** Agent Team RCA confidence < 70% (`status: awaiting_evidence`). The Agent Team requires physical confirmation of tool flank wear VB before ordering replacement.
- **Tier 1: Glance (1s):**
  - Top Pinned Header: `[< Back to Queue]` + Pinned Bay `CNC-02 // Bay 4` + Badge `[ (!) FIELD DIAGNOSTIC REQUIRED ]` (`rounded-full`, amber/destructive).
  - Target Confirmation: Workpiece `Housing-B42`, Tool Turret Slot `Tool T07`. Current RCA Confidence: `65% (Awaiting Evidence)`.
- **Tier 2: Focus (5s):**
  - **Diagnostic Directive Card (`rounded-xl`):**
    - Audio transcription from Gemini Live: *"Please use the macro camera to take a close-up of Tool T07 cutting edge so the system can measure flank wear VB."*
    - Primary Camera CTA (`h-11`, Solid Slate `#0F172A`, `rounded-md`): `[ 📷 CAPTURE CUTTING EDGE / UPLOAD ]` (posts to `POST /api/incidents/evidence`).
  - **Visual Metrology Assessment Card (`rounded-xl`, emerges post-capture):**
    - Macro photo preview with detected bounding box on cutting edge.
    - Metrology Measurement: `Flank Wear VB = 0.42 mm (Exceeds 0.35 mm limit)` (`font-mono`).
    - Anomaly Confirmation: `Minor chipping at tool relief angle 0.15 mm — 100% match with workpiece scratch`.
    - Agent Team Convergence: **RCA Confidence updated to 92%** (`rounded-full` emerald badge).
  - **Sticky Bottom Action Button (`h-12` / 48px, Solid Slate `#0F172A`):**
    - Text: `[ START INSERT REPLACEMENT (BAY 4) → ]` (transitions immediately to State 2B).

---

### 2.3. State 2B: In-Bay Active Repair Workspace (`/copilot?machine=CNC-02`)
- **Tier 1: Glance (1s):**
  - Top Pinned Header: `[< Back to Queue]` + Pinned Bay `CNC-02 // Bay 4` + Status badge `rounded-full` (`(!) REPAIR IN PROGRESS`).
  - Target Specs: Workpiece `Housing-B42` (FC250 Cast Iron) and Turret Slot `Tool T07 (Rough Turn)`.
- **Tier 2: Focus (5s):**
  - **Target Specs Card (`rounded-xl`):**
    - Defect Symptom: `Flank Wear (VB = 0.42mm > 0.35mm)`
    - Replacement Insert: `WNMG-080408` (`font-mono`) — Storage Bin: `A-14` (`font-mono`)
    - Calibrated Tightening Torque: `45 Nm` (`font-mono`, Calibrated Torque Wrench #3)
  - **3-Step Action Checklist (`rounded-xl` Card, Touch Targets ≥ 44 × 44 px, Checkboxes `rounded-sm`):**
    - Step 1: `[x] Power down spindle, engage LOTO lockout & open safety door` (Tap target 44px)
    - Step 2: `[ ] Replace worn insert with WNMG-080408 (Bin A-14)` (Tap target 44px)
    - Step 3: `[ ] Tighten clamp screw with torque wrench to exactly 45 Nm` (Tap target 44px)
  - **Sticky Full-Width Completion CTA (`h-12` / 48px, Solid Slate `#0F172A`, `rounded-md`):**
    - Text: `[ CONFIRM REPAIR COMPLETED ]`
    - Ergonomics: High-contrast touch target designed for one-handed operation with heavy work gloves.
- **Tier 3: Deep Dive (On-Demand / Hands-Free):**
  - **Gemini Live Multimodal Voice Visualizer:** Hands-free queries ("Say: 'Insert torqued to 45 Nm'").
  - **Procedural Video Reference Modal:** `[ > Watch 30s SOP Video Clip ]`.

---

### 2.4. State 2C: Post-Repair Handshake & Conveyor Verification (`/copilot?machine=CNC-02&status=verifying`)
- **Tier 1: Glance (1s):** Success checkmark banner `(✓) REPAIR LOGGED SUCCESSFULLY`.
- **Tier 2: Focus (5s):**
  - Intervention Summary: Machine `CNC-02`, Tool `T07`, Insert `WNMG-080408`, Calibrated Torque `45 Nm`, Intervention Duration `6m 40s`.
  - **Conveyor Verification Gate Preview (`rounded-xl` Card):**
    - Conveyor EOL Camera status: `Initiating 50-Part Clean Streak Run`
    - Progress Bar (`rounded-full`): `[--------------------------------] 0 / 50 Clean Parts (0%)`
    - Strict Rule: `Automatic streak reset on any single defect: ACTIVE`
  - Navigation Actions: `[ < Back to Machine Queue ]` and `[ Monitor Verification in Incident Workspace ]`.

---

### 2.5. State 2D: All Nominal / Idle Queue (`/copilot`)
- **Tier 1: Glance (1s):** Serene green indicator `(✓) ALL MACHINES NOMINAL`.
- **Tier 2: Focus (5s):** Fleet status card showing all bays operating within statistical control limits (OEE > 90%, zero uncontained defects).

---

## 3. Low-Fi ASCII Wireframes (Mobile 390px Viewport)

### Wireframe 2A: Machine Dispatch Queue (`/copilot`)

```text
+---------------------------------------+
| [=] KAIZEN COPILOT        (o) Shift A |  <-- Header: Menu + Shift Indicator
| Technician: Tuan Le (ID: TECH-08)     |
+---------------------------------------+
|                                       |
| ACTIVE DISPATCH QUEUE                 |
| [!] 1 Urgent Line Stop | [*] 1 Maint  |
|                                       |
| FILTERS (rounded-full):               |
| (x) Action Needed (2)  ( ) Completed  |
|                                       |
| === CARD 1: CRITICAL ANOMALY (rounded-xl)
| +-----------------------------------+ |
| | (!) CNC-02 (Bay 4)     [CRITICAL] | |  <-- Destructive pill badge (rounded-full)
| | Anomaly: T07 Flank Wear (VB>0.35) | |
| | Part: Housing-B42 | SPC: 1.42% err| |
| | Elapsed: 8 min ago                | |
| | Dispatched by: John Tran (Lead)   | |
| |                                   | |
| | [ START REPAIR (BAY 4)  -> ]      | |  <-- Primary Solid Slate CTA (rounded-md)
| +-----------------------------------+ |
|                                       |
| === CARD 2: PREVENTIVE TASK (rounded-xl)
| +-----------------------------------+ |
| | (*) CNC-04 (Bay 2)      [PREVENT] | |  <-- Warning pill badge (rounded-full)
| | Task: Index Insert T03 (85% life) | |
| | Part: Gear-G15 | Schedule: Shift A| |
| |                                   | |
| | [ Accept Preventive Task ]        | |  <-- Secondary Outline CTA (rounded-md)
| +-----------------------------------+ |
|                                       |
| === FLEET NOMINAL STATUS ============ |
| (o) CNC-01 (Bay 1): Nominal           |
| (o) CNC-03 (Bay 3): Nominal           |
| (o) CONVEYOR-01:    Nominal           |
+---------------------------------------+
```

---

### Wireframe 2-DIAG: In-Bay Diagnostic Evidence Probe (`/copilot?machine=CNC-02&mode=diagnostic`)

```text
+---------------------------------------+
| [<] Machine Queue      CNC-02 (Bay 4) |  <-- Navigates back to State 2A
| Status: [ (!) FIELD DIAGNOSTIC PROBE ]|  <-- Amber/Destructive Badge (rounded-full)
+---------------------------------------+
|                                       |
| === TIER 1 (GLANCE): TARGET PROBE === |
| +-- INSPECTION TARGET (rounded-xl) --+ |
| | Machine: CNC-02 (Bay 4 - Lathe)    | |
| | Turret:  Tool T07 - Rough Turn     | |
| | Suspect: Flank Wear (VB > 0.35 mm) | |
| | Current RCA Confidence: 65% (Need) | |
| +------------------------------------+ |
|                                       |
| === TIER 2 (FOCUS): METROLOGY CAPTURE |
| +-- CAPTURE DIRECTIVE (rounded-xl) --+ |
| | "Use macro camera close to the      | |
| |  cutting edge of T07 for metrology."| |
| |                                     | |
| | [ 📷 OPEN CAMERA / UPLOAD PHOTO ]   | |  <-- Button 44px (Solid Slate #0F172A)
| +------------------------------------+ |
|                                       |
| === GEMINI METROLOGY ASSESSMENT ===== |
| +-- VISION ANALYSIS (rounded-xl) ----+ |
| | [T07 Macro Photo: Bounding box]    | |
| | • Flank Wear VB: 0.42 mm (>0.35 mm)| |  <-- font-mono (Exceeds limit)
| | • Minor Chipping on Relief: 0.15 mm| |
| | • Match: 100% matches part scratch | |
| | • RCA Confidence: 92% (Converged)  | |  <-- Emerald Badge (rounded-full)
| +------------------------------------+ |
|                                       |
+---------------------------------------+
| [ START INSERT REPLACEMENT (BAY 4) ->]|  <-- TIER 2: Sticky 48px Glove Button
+---------------------------------------+      Transitions to State 2B (Checklist)
```

---

### Wireframe 2B: In-Bay Active Repair Workspace (`/copilot?machine=CNC-02`)

```text
+---------------------------------------+
| [<] Machine Queue      CNC-02 (Bay 4) |  <-- [<] Navigates back to State 2A
| Status: [ (!) REPAIR IN PROGRESS ]    |  <-- Red Destructive Badge (rounded-full)
+---------------------------------------+
|                                       |
| === TIER 1 (GLANCE): TARGET SPECS === |
| +-- TARGET MACHINE (rounded-xl) ----+ |
| | Machine: CNC-02 (Bay 4 - Lathe)   | |
| | Turret:  Tool T07 - Rough Turn    | |
| | Anomaly: Flank Wear (VB: 0.42 mm) | |
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
| +-- GEMINI LIVE VOICE ASSISTANT ----+ |
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

### Wireframe 2C: Post-Repair Handshake & Verification (`/copilot?machine=CNC-02&status=verifying`)

```text
+---------------------------------------+
| [V] REPAIR LOGGED         CNC-02      |
+---------------------------------------+
|                                       |
|       ( V )  REPAIR LOGGED!           |  <-- Green success icon & tactile confirmation
|                                       |
| Technician: Tuan Le                   |
| Equipment:  CNC-02 // Bay 4 - Tool T07|
| Replaced:   WNMG-080408 (Bin A-14)    |
| Torque:     45 Nm (Verified)          |
| Duration:   6m 40s                    |
|                                       |
| === CONVEYOR VERIFICATION GATE ====== |
| +-----------------------------------+ |
| | Conveyor Optical Inspection EOL   | |
| | Progress: 0 / 50 Clean Parts (0%) | |  <-- Optical camera begins 50-part count
| | [-------------------------------] | |  <-- Emerald progress bar (rounded-full)
| | Gate Rule: 50 consecutive passed  | |
| | Reset: Resets to 0 on any defect  | |
| +-----------------------------------+ |
|                                       |
| [ < Back to Machine Queue ]           |  <-- Returns to State 2A
| [ Monitor Verification (Workspace) ]  |  <-- Deep links to /incidents/INC-2026-042
+---------------------------------------+
```

---

### Wireframe 2D: All Nominal / Idle Queue (`/copilot`)

```text
+---------------------------------------+
| [=] KAIZEN COPILOT        (o) Shift A |
| Technician: Tuan Le                   |
+---------------------------------------+
|                                       |
|       ( ~ )  ALL BAYS NOMINAL         |
|                                       |
| No active machine anomalies or        |
| urgent maintenance requests.          |
|                                       |
| +-- PRODUCTION FLEET STATUS --------+ |
| | (o) CNC-01 (Bay 1): Nominal       | |
| | (o) CNC-02 (Bay 4): Nominal       | |
| | (o) CNC-03 (Bay 3): Nominal       | |
| | (o) CNC-04 (Bay 2): Nominal       | |
| | (o) CONVEYOR-01:   Nominal        | |
| +-----------------------------------+ |
|                                       |
| [ (↻) Refresh Fleet Telemetry ]      |
+---------------------------------------+
```

---

## 4. UI States & Edge Cases

| State | UI Behavior |
|---|---|
| **Queue Triage (State 2A)** | Ranked by severity: `CRITICAL` (SPC breach) > `WARNING` (Drift) > `PREVENTIVE` (Scheduled tool life). |
| **Diagnostic Probe (State 2-DIAG)** | Triggered when Agent Team RCA < 70%. Focuses on macro photo capture (`POST /api/incidents/evidence`) and Gemini Metrology verification before repair starts. |
| **Bay In-Progress (State 2B)** | Steps 1–3 checked by finger tap (44px) or hands-free voice command ("Insert replaced and torqued"). Sticky 48px button submits completion. |
| **Completion Submitted (State 2C)** | Tactile feedback, logs repair on Blackboard, transitions status to `verifying` (conveyor optical streak begins). |
| **Streak Reset on Defect** | If a defect occurs during conveyor streak, notification alerts technician: `"Verification reset: Defect detected on part #39. Inspect bay alignment."` |
| **All Nominal (State 2D)** | Calm technology view; zero red banners; all indicators serene green. |
