---
document_id: "past_8d_reports/8D_2026_03_12_dryer_filter_dewpoint.md"
title: "8D Incident Report: IM-05 Cavity 3 Sink Marks & Clogged Dryer Intake Filter"
incident_id: "8D-2026-03-12-02"
category: "8d_report"
machine_id: "IM-05"
mold_id: "MOLD-E4C-05"
equipment_id: "Dryer-03"
incident_date: "2026-03-12"
closure_date: "2026-03-15"
status: "closed"
tags: ["8d_report", "im_05", "cavity_3", "sink_mark", "short_fill", "abs_resin", "dew_point", "dryer_filter"]
---

# Global 8D Incident Report: 8D-2026-03-12-02
**Title:** IM-05 Mold Cavity 3 Short Fill and Sink Marks Caused by Clogged Dryer Filter and High ABS Moisture  
**Facility:** Injection Molding Plant, Bay 2  
**Target Machine & Mold:** IM-05 (180-Ton Press) / Mold MOLD-E4C-05 (4-Cavity Enclosure)  
**Auxiliary System:** Dryer-03 (DryMax DM-100 Desiccant Dehumidifier)

---

<!-- page: 1 -->
## [Page 1] D1: Team Establishment & D2: Problem Description

### D1: Champion & Cross-Functional Team
- **Champion / Sponsor:** Vu Thi Huong (Plant Quality Director)
- **8D Team Leader:** Nguyen Van Duc (Senior Manufacturing Automation Engineer)
- **Process Technician:** Tran Van Binh (Injection Molding Process Specialist)
- **Quality Assurance Lead:** Le Thi Mai (Metrology / SPC Engineer)
- **Materials Handling Lead:** Pham Van Long (Warehouse & Resin Prep Lead)

### D2: Problem Description (5W2H Analysis)
- **What (Defect):** Severe sink marks (`sink_mark`) along the main structural mounting boss and localized short fill (`short_fill`) at the outer bezel edge.
- **Where (Location):** IM-05, strictly isolated to parts produced in **Cavity #3** of 4-cavity mold MOLD-E4C-05. Parts from Cavities #1, #2, and #4 showed zero dimensional or cosmetic defects.
- **When (Timing):** Detected at 14:20:00 UTC+7 on 2026-03-12, exactly 20 minutes after raw material lot changeover from Lot ABS-A to Lot ABS-B.
- **Machine State:** Hydraulic injection pressure (145 MPa), melt temperature (235 °C), cycle time (28.4 s), and clamp tonnage on IM-05 were completely stable and matching baseline recipes.
- **Auxiliary Telemetry:** Dryer-03 process air dew point sensor showed an elevation from nominal $-40^\circ\text{C}$ to **$-18^\circ\text{C}$** beginning at 13:50 UTC+7.

---

<!-- page: 2 -->
## [Page 2] D3: Interim Containment Actions (ICA)

1. **Immediate Machine Pause:** Halted IM-05 at 14:25 UTC+7 to prevent defect accumulation.
2. **Quarantine:** Quarantined 160 molded enclosures (40 shots) produced between 14:00 and 14:25.
3. **100% Visual and Dimensional Sorting:**
   - 40 parts from Cavity #3 scrapped (sink marks on cosmetic face $> 0.25\text{ mm}$ depth).
   - 120 parts from Cavities #1, #2, and #4 inspected and verified compliant with cosmetic drawing specs (accepted).

---

<!-- page: 3 -->
## [Page 3] D4: Root Cause Analysis (5-Whys & Ishikawa)

### 5-Whys Analysis (Product-First Traceability)
1. **Why 1:** Why did parts from Cavity #3 have sink marks and short fill?  
   *Because holding pressure during the pack phase was inadequate to compensate for volumetric shrinkage in Cavity #3.*
2. **Why 2:** Why was holding pressure inadequate only in Cavity #3 while Cavities 1, 2, and 4 packed out normally?  
   *Because Cavity #3 has a 285 mm runner length (longest flow path in the mold), causing the highest pressure drop (ΔP) when melt viscosity was degraded by moisture vapor.*
3. **Why 3:** Why did the ABS polymer melt possess excess moisture vapor?  
   *Because ABS resin pellets from new lot ABS-B had residual moisture of 0.045%, exceeding the 0.02% manufacturer processing limit.*
4. **Why 4:** Why did the raw material pellets have 0.045% moisture despite spending time in the drying hopper?  
   *Because Dryer-03 dew point rose to -18 °C, failing to extract moisture from incoming damp pellets.*
5. **Why 5 (Root Cause):** Why did Dryer-03 dew point rise to -18 °C?  
   *Because the air intake filter cartridge was clogged with polymer fines (differential pressure 680 Pa), choking airflow across the desiccant rotor, and lot changeover SOP had no requirement to check dew point.*

### Ishikawa (Fishbone) 6M Analysis
```
                       Ishikawa Diagram (8D-2026-03-12-02)
================================================================================
  MACHINE (IM-05 & Dryer-03)     |  METHOD (SOP)
  - Press hydraulic params: OK   |  - Lot changeover SOP lacked dew point check
  - Dryer intake filter clogged  |  - No mandatory 4-hr pre-dry verification
  - Dew point drifted to -18 °C  |  - Runner balance offset in Cavity #3
  -------------------------------+----------------------------------------------
  MATERIAL (ABS Resin Terluran)  |  MAN / OPERATOR
  - Lot B damp from storage      |  - Material handler did not wait for dry time
  - Pellet moisture: 0.045%      |  - Assumed hopper was ready upon dump
  - Moisture limit: 0.02% max    |  - Did not check hygrometer gauge
  -------------------------------+----------------------------------------------
  MEASUREMENT (Sensors & QC)     |  MILIEU / ENVIRONMENT
  - AOI flagged Cavity 3 defect  |  - High warehouse humidity (78% RH)
  - Dew point sensor logged -18°C|  - Summer monsoon rain outside plant
================================================================================
```

---

<!-- page: 4 -->
## [Page 4] D5: Permanent Corrective Action (PCA) & D6: Verification

### D5: Permanent Corrective Action
1. **Filter Replacement & Dryer Regeneration:** Replaced choked intake filter cartridge FLT-DM-04 on Dryer-03. Regenerated desiccant rotor for 30 minutes until dew point stabilized at **$-41^\circ\text{C}$**.
2. **Resin Pre-Drying Protocol:** Purged unconditioned resin from machine hopper. Re-dried virgin ABS lot for 4 hours at $82^\circ\text{C}$ with dew point $\le -40^\circ\text{C}$. Measured residual moisture: **$0.012\%$** ($< 0.02\%$ specification).
3. **Molding Resumption:** Resumed production on IM-05 using certified dried resin.

### D6: Verification of Effectiveness (DVOE)
- **Verification Gate:** Monitored **50 consecutive shots** (200 consecutive parts across all 4 cavities).
- **Inspection Results:**
  - Cavity #1: 50/50 PASS
  - Cavity #2: 50/50 PASS
  - Cavity #3: 50/50 PASS (Sink mark depth $0.00\text{ mm}$, short fill eliminated)
  - Cavity #4: 50/50 PASS
- Total streak: 200 consecutive parts defect-free. Process defect rate dropped to **$0.0\%$**.

---

<!-- page: 5 -->
## [Page 5] D7: Prevent Recurrence & D8: Sign-off

### D7: Preventive Action (Systemic Kaizen)
- **SOP Revision:** Updated SOP-MNT-IM-08 to mandate:
  1. Mandatory inspection of Dryer dew point ($\le -35^\circ\text{C}$) before opening hopper gate on any new material lot.
  2. Mandatory 4-hour pre-drying period for all bagged resin.
- **Hardware Interlock:** Installed differential pressure switch across dryer intake filter to sound alarm if pressure exceeds $300\text{ Pa}$.

### D8: Closure Sign-Off & Approvals
- **8D Team Leader:** Nguyen Van Duc (Signed: 2026-03-15)
- **Maintenance Manager:** Hoang Quoc Viet (Signed: 2026-03-15)
- **Plant Quality Director:** Vu Thi Huong (Signed: 2026-03-15)
- **Incident Status:** CLOSED
