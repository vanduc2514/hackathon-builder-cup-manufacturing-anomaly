---
document_id: "maint_logs/cnc_tool_t07_maintenance.md"
title: "CNC-02 Tool Station T07 Maintenance & Inspection Log"
machine_id: "CNC-02"
component: "Tool Station T07 (Face Mill Ø50 - APMT1604PDER)"
category: "maint_log"
effective_sop: "SOP-MNT-CNC-04 (Calendar-Based Tooling Cycle)"
log_period: "2026-09-20 to 2026-10-07"
tags: ["cnc_02", "tool_t07", "maintenance_log", "insert_wear", "calendar_sop", "tool_life"]
---

# Machine Tool Maintenance Log: CNC-02 / Tool Station T07

<!-- page: 1 -->
## [Page 1] Tool Asset Overview & Installation Metadata

| Asset Field | Record Value | Engineering Specification |
|---|---|---|
| **Machine ID** | CNC-02 (Precision VMC-850 Line 1) | Station #2 (Parallel milling line) |
| **Tool Station** | Pot T07 (Spindle Tool 07) | 4-Flute Indexable Shoulder Mill Ø50 |
| **Cutter Body Model** | BAP400R-50-22-4T | BBT40-FMA22.225-60 Face Mill Arbor |
| **Insert Specification** | APMT1604PDER-M2 VP15TF | PVD TiAlN coated micro-grain carbide |
| **Number of Inserts** | 4 Inserts (Pockets #1, #2, #3, #4) | Clamp Screw M3.5 x 8 (Torx T15) |
| **Manufacturer Life Limit** | **2,000 Parts Maximum** | Based on aluminum A380 die-cast Face A |
| **Governing SOP** | **SOP-MNT-CNC-04 (Calendar Interval)** | **Fixed 21-Day Inspection & Swap Schedule** |

---

<!-- page: 2 -->
## [Page 2] Historical Maintenance Timeline & Cumulative Tool Usage

### Log Entry 1: Tool Assembly & Installation
- **Date & Time:** 2026-09-20 08:15:00 UTC+7 (Day 0)
- **Technician:** Nguyen Van Duc (Tech ID: TECH-841)
- **Work Performed:** 
  - Installed brand-new 4x carbide inserts (`APMT1604PDER-M2 VP15TF`).
  - Pocket seats cleaned with ultrasonic bath and isopropyl alcohol.
  - Inserts torqued to manufacturer spec **$3.5\text{ N}\cdot\text{m}$** with calibrated torque wrench.
  - Spindle taper cleaned; tool holder clamped into BBT40 spindle.
  - Spindle runout (TIR) verified at tool nose with dial test indicator: **$0.002\text{ mm}$** ($2.0\ \mu\text{m}$), well within $< 0.005\text{ mm}$ limit.
  - Initial flank wear $V_B = 0.00\text{ mm}$.
  - Machine part counter set to 0.
  - Next scheduled calendar maintenance recorded as **2026-10-11** (per 21-day calendar rule in SOP-MNT-CNC-04).

### Log Entry 2: Routine Shift Check (Day 7)
- **Date & Time:** 2026-09-27 16:30:00 UTC+7 (Day 7)
- **Technician:** Tran Van Binh (Tech ID: TECH-523)
- **Observations:**
  - Cumulative parts cut: **980 parts**.
  - Flank wear measurement under 10x optical loupe: $V_B = 0.12\text{ mm}$.
  - Spindle vibration RMS: $1.4\text{ mm/s}$ (normal baseline).
  - Machined surface roughness: $Ra = 0.65\ \mu\text{m}$ (specification $Ra < 0.8\ \mu\text{m}$).
  - Status: Tool in good operational condition. Continued in service.

### Log Entry 3: Routine Shift Check (Day 14)
- **Date & Time:** 2026-10-04 17:00:00 UTC+7 (Day 14)
- **Technician:** Tran Van Binh (Tech ID: TECH-523)
- **Observations:**
  - Cumulative parts cut: **1,920 parts** (approaching manufacturer rating of 2,000 parts).
  - Flank wear measurement: $V_B = 0.26\text{ mm}$ (wear rate accelerating).
  - Machined surface roughness: $Ra = 0.78\ \mu\text{m}$.
  - **SOP Conflict Note:** Technician noted that part count was within 80 pieces of manufacturer's recommended 2,000-part life limit. However, under factory standard operating procedure **SOP-MNT-CNC-04**, tool replacement is strictly scheduled on calendar interval (every 21 days; next scheduled replacement due on 2026-10-11, 7 days away). No piece-counter interlock exists in the PLC. Tool was left in service.

### Log Entry 4: Incident Telemetry & Failure Event (Day 18)
- **Date & Time:** 2026-10-07 09:30:00 – 09:45:00 UTC+7 (Day 18)
- **Technician:** Hoang Minh Tuan (Night Shift / Relief Tech TECH-119)
- **Observations:**
  - Cumulative parts cut reached: **2,400 parts** (**400 parts in excess of manufacturer rated limit** of 2,000 parts).
  - Inspection camera flagged surface defects: **Vertical scratches (`scratch_vertical`)** across Face A of automotive transmission housing.
  - Defect rate surged from baseline $0.5\%$ to $7.8\%$ (breaching SPC UCL $3.0\%$).
  - Spindle accelerometer telemetry on CNC-02: Spindle RMS vibration surged by $+35\%$, reaching **$4.8\text{ mm/s}$** (critical limit $4.5\text{ mm/s}$).
  - Spindle drive current rose from $18.0\text{ A}$ to **$20.4\text{ A}$** ($+13.3\%$).

---

<!-- page: 3 -->
## [Page 3] Corrective Action & Verification Record

### Tool Disassembly & Wear Inspection:
- Tool T07 unloaded from spindle.
- Pocket #2 insert exhibited micro-chipping ($0.45\text{ mm}$ fracture on nose radius) and flank wear $V_B = 0.38\text{ mm}$ (critical limit $0.30\text{ mm}$).
- Chipped edge geometry dragged directly across workpiece during traverse, causing vertical scratch defects.

### Immediate Corrective Action:
1. Removed all 4 worn inserts from cutter body BAP400R-50-22-4T.
2. Cleaned insert seats and tool holder shank.
3. Installed 4 fresh inserts (`APMT1604PDER-M2 VP15TF`).
4. Torqued clamp screws to manufacturer specification **$3.5\text{ N}\cdot\text{m}$** using calibrated Torx T15 wrench.
5. Re-seated tool holder into BBT40 spindle and checked runout:
   - **Dial indicator measurement (TIR): $0.003\text{ mm}$** ($3.0\ \mu\text{m}$, compliant with $< 0.005\text{ mm}$ threshold).

### Post-Repair Physical Verification:
- Machine restarted under test regime.
- 50 consecutive pieces inspected at the exit station: **50/50 PASS** (0 defects).
- Spindle vibration RMS returned to nominal baseline: **$1.5\text{ mm/s}$**.
- Process defect rate dropped to **$0.4\%$**.

### Preventive Action Recommendation:
- Immediate revision of SOP-MNT-CNC-04: Terminate calendar-based replacement. Enforce cycle-counter-based replacement at **1,900 parts** (automatic warning) with hard interlock at **2,000 parts**.
