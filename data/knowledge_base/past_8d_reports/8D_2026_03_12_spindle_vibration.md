---
document_id: "past_8d_reports/8D_2026_03_12_spindle_vibration.md"
title: "8D Incident Report: CNC-02 Spindle Vibration Spike & Machined Face Scratching"
incident_id: "8D-2026-03-12-01"
category: "8d_report"
machine_id: "CNC-02"
component: "Tool Station T07 / Spindle Bearings"
incident_date: "2026-03-12"
closure_date: "2026-03-14"
status: "closed"
tags: ["8d_report", "cnc_02", "vibration", "tool_wear", "scratch_vertical", "5_whys", "ishikawa"]
---

# Global 8D Incident Report: 8D-2026-03-12-01
**Title:** CNC-02 Spindle Vibration Spike and Surface Scratching on Transmission Housing Face A  
**Facility:** Automotive Powertrain Machining Plant, Line 1  
**Target Machine:** CNC-02 (Precision VMC-850 Milling Center)

---

<!-- page: 1 -->
## [Page 1] D1: Team Establishment & D2: Problem Description

### D1: Champion & Cross-Functional Team
- **Champion / Sponsor:** Vu Thi Huong (Plant Quality Director)
- **8D Team Leader:** Nguyen Van Duc (Senior Manufacturing Automation Engineer)
- **Machine Maintenance Specialist:** Tran Van Binh (CNC Senior Maintenance Technician)
- **Quality Assurance Lead:** Le Thi Mai (Statistical Process Control / Metrology Engineer)
- **Production Shift Supervisor:** Pham Van Long (Shift 2 Lead)

### D2: Problem Description (5W2H Analysis)
- **What (Defect):** Appearance of prominent vertical linear scratches (`scratch_vertical`) along the finished face of aluminum transmission housing covers (Part # ATH-6061-A).
- **Where (Location):** CNC Machining Cell 1, specifically parts produced on machine **CNC-02**. Parallel machines CNC-01 and CNC-03 operating on the same aluminum raw material lot showed zero surface defects.
- **When (Timing):** First flagged on 2026-03-12 at 14:15:00 UTC+7 during Shift 2.
- **Who (Discovered By):** Downstream automated optical inspection (AOI) camera station.
- **Extent (Magnitude):** Process defect rate escalated rapidly from nominal $0.4\%$ to **$7.5\%$**, breaching the statistical Upper Control Limit (UCL = $3.0\%$).
- **Machine Sensor Telemetry:** Spindle piezoelectric vibration sensor on CNC-02 exhibited an RMS acceleration spike to **$4.6\text{ mm/s}$** (nominal baseline $1.5\text{ mm/s}$, process limit $3.5\text{ mm/s}$). Spindle motor current increased by $+12.5\%$ ($18.0\text{ A} \rightarrow 20.25\text{ A}$).

---

<!-- page: 2 -->
## [Page 2] D3: Interim Containment Actions (ICA)

1. **Production Reroute (Immediate):** Halted CNC-02 spindle operations at 14:22:00 UTC+7. Redirected aluminum housing blank feeding exclusively to CNC-01 and CNC-03 to preserve line throughput.
2. **Quarantine:** Quarantined lot `LOT-20260312-A` comprising 140 parts produced on CNC-02 between 13:30 and 14:20.
3. **100% Manual Metrology Sorting:** Metrology inspector sorted quarantined lot:
   - 28 parts exhibited scratch depth $> 15\ \mu\text{m}$ (Scrapped; aluminum remelt).
   - 112 parts passed dimensional and visual criteria (Released).

---

<!-- page: 3 -->
## [Page 3] D4: Root Cause Analysis (5-Whys & Ishikawa)

### 5-Whys Root Cause Chain
1. **Why 1:** Why did finished housing Face A exhibit vertical surface scratches?  
   *Because carbide insert #3 on tool station T07 developed micro-chipping and flank wear, dragging chipped carbide edges across the surface.*
2. **Why 2:** Why did carbide insert #3 chip and wear excessively?  
   *Because cutting forces and spindle chatter vibration escalated to $4.6\text{ mm/s}$ RMS due to severe insert edge degradation.*
3. **Why 3:** Why had tool station T07 degraded beyond its mechanical limit?  
   *Because Tool T07 had completed 2,350 cutting cycles, significantly exceeding the manufacturer recommended maximum life of 2,000 cycles.*
4. **Why 4:** Why was Tool T07 allowed to operate past 2,000 cycles?  
   *Because the plant maintenance standard operating procedure (SOP-MNT-CNC-04) prescribed tool changes on a 21-calendar-day interval rather than on actual machined piece count.*
5. **Why 5 (Root Cause):** Why was a calendar-based SOP utilized instead of a cycle-based SOP?  
   *Because legacy tool management procedures had not integrated real-time CNC PLC cycle telemetry into maintenance work-order dispatching.*

### Ishikawa (Fishbone) 6M Analysis
```
                       Ishikawa Diagram (8D-2026-03-12-01)
================================================================================
  MACHINE (CNC-02)               |  METHOD (SOP)
  - Spindle vibration: 4.6 mm/s  |  - Calendar-based 21-day tool change
  - Spindle runout: 0.003 mm OK  |  - No automated piece count interlock
  - Motor current: +12.5%        |  - Manual log entry delay
  -------------------------------+----------------------------------------------
  MATERIAL (Aluminum A380)       |  MAN / OPERATOR
  - Alloy hardness: In-spec      |  - Replacement operator on shift
  - Same lot on CNC-01/03 (OK)   |  - Visual inspection loupe not used
  - No metallurgical defect      |  - Relied on calendar clipboard schedule
  -------------------------------+----------------------------------------------
  MEASUREMENT (AOI Camera)       |  MILIEU / ENVIRONMENT
  - Camera detected at 7.5% rate |  - Ambient temp 28°C (Normal)
  - High correlation with sensor |  - Emulsion coolant: 8.2% conc (Normal)
================================================================================
```

---

<!-- page: 4 -->
## [Page 4] D5: Permanent Corrective Action (PCA) & D6: Verification

### D5: Permanent Corrective Action Implemented
1. **Insert Replacement (Immediate Physical Fix):** Removed tool cutter body BAP400R-50-22-4T from spindle. Removed all 4 worn APMT1604PDER-M2 VP15TF carbide inserts. Installed 4 new manufacturer-certified inserts.
2. **Torque Calibration:** Cleaned insert pockets and torqued M3.5 clamp screws to **$3.5\text{ N}\cdot\text{m}$** with calibrated torque wrench.
3. **Spindle Runout Verification:** Mounted dial test indicator on machine table. Checked tool tip radial runout:
   - **Measured TIR: $0.003\text{ mm}$** ($3.0\ \mu\text{m}$), safely below the maximum permissible limit of $< 0.005\text{ mm}$.
4. **Spindle Telemetry Verification:** Restarted spindle under dry run and test cut. Spindle RMS vibration dropped from $4.6\text{ mm/s}$ to **$1.45\text{ mm/s}$**. Motor current normalized to $18.1\text{ A}$.

### D6: Verification of Effectiveness (DVOE)
- **Product Verification Gate:** CNC-02 resumed production under monitored verification.
- **Streak Requirement:** Evaluated **50 consecutive machined pieces** (`verification_count = 50 / 50`).
- **Result:**
  - 50/50 parts passed 100% surface inspection with zero scratches (`scratch_vertical = 0`).
  - Defect rate dropped from $7.5\%$ to **$0.35\%$** (baseline).
  - Surface roughness $Ra = 0.52\ \mu\text{m}$ (well within $0.80\ \mu\text{m}$ tolerance).

---

<!-- page: 5 -->
## [Page 5] D7: Prevent Recurrence & D8: Sign-off

### D7: Preventive Action (Systemic Kaizen)
- **Engineering Proposal:** Install Fanuc FOCAS automated tool life counter macro on CNC-01, CNC-02, and CNC-03 to flag tool wear warning at 1,900 parts and enforce machine pause at 2,000 parts.
- **Documentation Revision:** Revise SOP-MNT-CNC-04 to mandate part-count-based tool changes across all machining centers.

### D8: Closure Sign-Off & Approvals
- **8D Team Leader:** Nguyen Van Duc (Signed: 2026-03-14)
- **Maintenance Manager:** Hoang Quoc Viet (Signed: 2026-03-14)
- **Quality Director:** Vu Thi Huong (Signed: 2026-03-14)
- **Incident Status:** CLOSED
