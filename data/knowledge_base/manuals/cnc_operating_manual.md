---
document_id: "manuals/cnc_operating_manual.md"
title: "CNC Vertical Machining Center Operating & Maintenance Manual"
model: "CNC-VMC-850 (Fanuc 31i-B5 Control)"
category: "manual"
machines: ["CNC-01", "CNC-02", "CNC-03"]
revision: "Rev 4.2"
effective_date: "2025-01-15"
total_pages: 128
tags: ["cnc", "spindle", "vibration", "tooling", "insert_wear", "scratch_vertical", "maintenance"]
---

# CNC Vertical Machining Center Operating & Maintenance Manual
**Model: Precision VMC-850 / CNC-01, CNC-02, CNC-03**  
**CNC Controller: Fanuc Series 31i-Model B5**

---

<!-- page: 1 -->
## [Page 1] Chapter 1: Machine Architecture & Operating Boundaries

### 1.1 Technical Specifications Overview
The VMC-850 is a rigid 3-axis vertical machining center engineered for precision milling of aluminum alloys (A380 die-cast and 6061-T6 wrought aluminum automotive transmission housings).

| Parameter | Nominal Specification | Permissible Operating Range | Critical Safety Limit |
|---|---|---|---|
| Maximum Spindle Speed | 12,000 RPM | 0 – 10,000 RPM (Continuous) | 12,000 RPM |
| Spindle Motor Power | 15.0 kW (Continuous) / 18.5 kW (30 min) | 0 – 14.5 kW | 18.5 kW |
| Spindle Full-Load Current | 18.0 A (400 V / 50 Hz) | 12.0 A – 19.5 A | 24.0 A (Overcurrent Trip) |
| Rapid Traverse Rate (X / Y / Z) | 36 / 36 / 30 m/min | — | — |
| Tool Shank Interface | BBT40 (Big-Plus Dual Contact) | — | — |
| Tool Magazine Capacity | 30 Tools (Random Tool Pot) | Stations T01 – T30 | — |

---

<!-- page: 45 -->
## [Page 45] Chapter 3: Spindle Dynamics & Vibration Thresholds

### 3.2 Spindle Health & Triaxial Accelerometer Baselines
Every production CNC machine is instrumented with an industrial triaxial high-frequency piezoelectric accelerometer mounted directly on the front spindle bearing housing (Drive-End).

```
Spindle Acceleration Signals (RMS Velocity 10 Hz – 1,000 Hz):
  - Nominal Baseline (New Tool):  1.20 – 1.80 mm/s RMS
  - Normal Operating Ceiling:     2.50 mm/s RMS
  - Process Warning Limit:        3.50 mm/s RMS
  - Upper Control Limit (UCL):    4.20 mm/s RMS
  - Critical Stop Limit:          4.50 mm/s RMS
```

### 3.3 Dynamic Runout Tolerances (TIR)
Spindle arbor runout must be inspected periodically using a test bar (L = 300 mm) and 0.001 mm dial test indicator (DTI).
- **Spindle Taper Runout (Static):** Total Indicator Reading (TIR) $\le 0.002\text{ mm}$ ($2.0\ \mu\text{m}$).
- **Tool Tip Runout (Mounted in BBT40 chuck):** TIR $\le 0.005\text{ mm}$ ($5.0\ \mu\text{m}$).
- **Maximum Permissible Spindle Runout:** Any measured runout $> 0.005\text{ mm}$ causes asymmetric chip loading, localized harmonic chatter, accelerated insert flank wear, and surface scratching on finished faces.

---

<!-- page: 88 -->
## [Page 88] Chapter 4: Tooling Station Allocations & Life Ratings

### 4.2 Standard Automotive Transmission Housing Tooling Layout (Face A & Bore)
The standard automotive transmission housing process involves face milling, drilling, reaming, and circular pocketing.

| Tool Station | Description | Cutter Body | Insert Type | Substrate / Coating | Rated Life (Parts) |
|---|---|---|---|---|---|
| **T01** | Rough Endmill Ø20 | 3-Flute Carbide | Solid Carbide | AlCrN | 1,500 |
| **T03** | Spot Drill Ø12 x 90° | 2-Flute | Solid Carbide | TiAlN | 4,000 |
| **T07** | **Finish Face Mill Ø50** | **4-Flute Shoulder Cutter** | **APMT1604PDER-M2** | **Carbide VP15TF (PVD)** | **2,000** |
| **T12** | Tap M10 x 1.5 | 3-Flute Spiral Flute | HSS-E PM | TiN | 1,800 |
| **T15** | Precision Boring Head | Single Point | CCMT060204-PF | Cermet | 2,500 |

### 4.3 Cutting Conditions for Tool T07 (Face A Finish Milling)
- **Workpiece Material:** Cast Aluminum A380 / 6061-T6 Housing Face A.
- **Cutting Speed ($V_c$):** 280 m/min (Spindle Speed $n = 1,780\text{ RPM}$).
- **Feed per Tooth ($f_z$):** 0.12 mm/tooth (Table Feed $v_f = 854\text{ mm/min}$).
- **Axial Depth of Cut ($a_p$):** 1.20 mm.
- **Radial Width of Cut ($a_e$):** 40 mm.
- **Coolant:** Semi-synthetic water-soluble emulsion (8% concentration, 20 bar high-pressure through-spindle).

---

<!-- page: 112 -->
## [Page 112] Section 4.5: Spindle Vibration & Cutting Insert Diagnostics

### 4.5.1 Diagnostics of Vertical Scratches & Insert Wear Correlation
Surface inspection at the exit station regularly evaluates machined face quality. A prevalent defect category is the occurrence of longitudinal and vertical scratches (`scratch_vertical`) along the finished face of the workpiece.

> **CRITICAL DIAGNOSTIC RULE [Page 112, Rule 4.5-A]:**  
> When vertical scratches (`scratch_vertical`) or periodic chatter grooves appear on finished Face A, accompanied by an increase in spindle RMS vibration ($> 35\%$ above baseline or absolute RMS $> 4.5\text{ mm/s}$) and an elevation in spindle drive motor current ($+10\%$ to $+15\%$), the primary root cause is **cutting tool insert flank wear ($V_B$) or edge chipping** on the active milling cutter (Tool Station T07).

### 4.5.2 Tool Wear Evolution & Flank Wear Limit ($V_B$)
Cutting inserts undergo progressive mechanical and thermal abrasion:
1. **Initial Running-in Wear ($0 - 200\text{ parts}$):** $V_B < 0.08\text{ mm}$. Minor hone rounding.
2. **Steady-state Wear ($200 - 1,800\text{ parts}$):** $V_B \approx 0.08 - 0.25\text{ mm}$. Surface roughness $Ra < 0.8\ \mu\text{m}$.
3. **Critical Wear Threshold ($1,800 - 2,000\text{ parts}$):** $V_B \approx 0.28 - 0.30\text{ mm}$. Approaching manufacturer end-of-life.
4. **Accelerated Wear & Micro-chipping ($> 2,000\text{ parts}$):** $V_B > 0.35\text{ mm}$.
   - Severe flank wear degrades clearance angle $\alpha$.
   - Cutting forces increase exponentially. Spindle current rises from baseline 18.0 A to $20.2 - 20.8\text{ A}$ ($+12\% - 15\%$).
   - Built-Up Edge (BUE) micro-welds and tears away, leaving chipped crater pockets on the carbide insert nose radius.
   - Chipped insert fragments and rough crater edges drag across the workpiece surface during subsequent spindle rotations, creating distinctive **vertical surface scratches (`scratch_vertical`)**.

### 4.5.3 Permissible Runout and Spindle Verification Protocol
Before resuming production following a tool or insert change:
1. Thoroughly clean the tool holder taper and BBT40 spindle bore with an alcohol-soaked lint-free wipe.
2. Insert fresh carbide inserts (`APMT1604PDER-M2 VP15TF`) into all 4 pockets.
3. Fasten clamp screws (M3.5 x 8 Torx T15) using a calibrated torque wrench set to exactly **$3.5\text{ N}\cdot\text{m}$**. Uneven torque causes insert seating deflection and angular runout.
4. Mount dial test indicator on the machine table. Rotate spindle by hand:
   - **Spindle runout requirement:** Total Indicator Reading (TIR) must be strictly **$< 0.005\text{ mm}$** ($5\ \mu\text{m}$).
   - Any measured runout $\ge 0.005\text{ mm}$ must be rejected; re-seat tool holder or check spindle taper for particulate entrapment.

### 4.5.4 Post-Repair Production Verification Gate
Following tool replacement, the machine must run a test sequence. To ensure zero recurrence:
- Continuous monitoring of 50 consecutive machined parts (`good_streak >= 50`).
- Process defect rate must drop below the target background baseline ($< 0.5\%$, well under SPC Upper Control Limit of $3.0\%$).
- Spindle vibration RMS must stabilize within the normal operating band ($1.2 - 1.8\text{ mm/s}$).

---

<!-- page: 120 -->
## [Page 120] Chapter 5: Preventive Maintenance Schedules & SOP References

### 5.1 Cutting Tool Life Management Rules
1. **Manufacturer Life Rating:** Tool T07 insert life is rated for a maximum of **2,000 machined parts** under documented cutting parameters.
2. **Defect Hazard with Calendar-based Scheduling:** Tool replacement schedules governed strictly by calendar days (e.g., 21-day or 30-day fixed maintenance windows) present extreme defect risks when production volume surges or shifts run overtime. Tool wear is directly proportional to actual cutting cycle count, not elapsed calendar days.
3. **Recommended Kaizen SOP:** CNC PLC piece counter must be linked to automated tool wear alerts at 1,900 parts, with mandatory lockout at 2,000 parts.
