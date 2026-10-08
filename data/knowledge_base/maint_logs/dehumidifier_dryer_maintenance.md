---
document_id: "maint_logs/dehumidifier_dryer_maintenance.md"
title: "Dehumidifier Honeycomb Dryer Maintenance & Dew Point Log"
equipment_id: "Dryer-03 (DryMax DM-100)"
servicing_machine: "IM-05"
category: "maint_log"
effective_sop: "SOP-MNT-IM-08 (Auxiliary Drying & Material Handling)"
log_period: "2026-08-25 to 2026-10-07"
tags: ["dehumidifier", "dryer_03", "dew_point", "filter_maintenance", "abs_resin", "im_05"]
---

# Auxiliary Equipment Maintenance Log: Dehumidifier Dryer-03
**Target Equipment:** DryMax DM-100 Desiccant Honeycomb Dehumidifying Dryer  
**Dedicated Host Machine:** IM-05 (Injection Molding Cell 2)  
**Assigned Material:** ABS Terluran GP-22 Resin Pellets

---

<!-- page: 1 -->
## [Page 1] Equipment Profile & Telemetry Baselines

| Equipment Field | Record Value | Engineering Specification |
|---|---|---|
| **Equipment ID** | Dryer-03 | DryMax DM-100 Twin-Tower Desiccant |
| **Connected Press** | IM-05 (Cell 2) | Feeds 4-Cavity Mold MOLD-E4C-05 |
| **Desiccant Rotor Medium** | Honeycomb Synthetic Zeolite (Molecular Sieve) | Moisture Absorption Capacity: 18% dry wt |
| **Nominal Operating Dew Point**| **$-42^\circ\text{C}$ to $-40^\circ\text{C}$** | Chilled Mirror Hygrometer sensor |
| **Dew Point Warning Limit** | **$-30^\circ\text{C}$** | PLC Yellow Alarm Indicator |
| **Dew Point Critical Limit** | **$-18^\circ\text{C}$** | PLC Red Trip (Resin Drying Failure) |
| **Air Filter Part Number** | FLT-DM-04 | Pleated micro-fiber intake dust cartridge |

---

<!-- page: 2 -->
## [Page 2] Maintenance History & Filter Service Records

### Entry 1: Quarterly Desiccant Rotor Service
- **Date & Time:** 2026-08-25 09:00:00 UTC+7
- **Technician:** Tran Van Binh (Tech ID: TECH-523)
- **Work Performed:**
  - Complete cleaning of desiccant wheel housing and regeneration heater elements.
  - Replaced process air intake filter (Cartridge # FLT-DM-04).
  - Dew point sensor calibrated against certified reference hygrometer.
  - Measured baseline dew point: **$-42.5^\circ\text{C}$**.
  - Status: Full service completed; equipment cleared for production.

### Entry 2: Monthly Filter Inspection
- **Date & Time:** 2026-09-20 14:00:00 UTC+7
- **Technician:** Nguyen Van Duc (Tech ID: TECH-841)
- **Work Performed:**
  - Inspected air intake filter cartridge. Moderate resin dust accumulated on pleats.
  - Blow-cleaned cartridge with dry 6 bar compressed air.
  - Process dew point measured at **$-40.2^\circ\text{C}$**.
  - Differential pressure across filter: $120\text{ Pa}$ (clean threshold $< 250\text{ Pa}$).

### Entry 3: Incident Telemetry & Lot Changeover Event
- **Date & Time:** 2026-10-07 13:50:00 – 14:45:00 UTC+7
- **Technician:** Hoang Minh Tuan (Tech ID: TECH-119) & Le Thi Mai (QC)
- **Incident Chronology:**
  - **13:50 UTC+7:** Dryer-03 dew point sensor detected thermal desorption anomaly. Operating dew point began drifting rapidly upwards from nominal $-40^\circ\text{C}$, crossing warning threshold ($-30^\circ\text{C}$) at 14:05, and stabilizing at an abnormal high of **$-18^\circ\text{C}$** by 14:15.
  - **14:00 UTC+7:** Material handler switched raw material hopper to newly arrived resin lot **Lot ABS-20261007-B**. Due to warehouse storage in high ambient humidity ($78\%$ RH), virgin resin pellets possessed initial moisture content of $0.32\%$.
  - **14:20 UTC+7:** Automated optical inspection at exit conveyor of IM-05 flagged defect breach: **Sink marks (`sink_mark`)** and **short fill (`short_fill`)** appearing on $100\%$ of parts produced by **Cavity #3**. Cavities #1, #2, and #4 remained visually acceptable.
  - **14:35 UTC+7:** Traceability analysis confirmed adjacent machine IM-06 operating on previous resin lot (Lot ABS-20261006-A) experienced zero defects.

---

<!-- page: 3 -->
## [Page 3] Inspection Findings, Filter Remediation & Recovery

### Dryer-03 Physical Inspection:
- Maintenance technician inspected Dryer-03 intake filter compartment.
- **Findings:**
  - Intake filter cartridge FLT-DM-04 was severely choked with dense polymer fines, degraded resin lint, and ambient airborne particulates.
  - Differential pressure across filter measured **$680\text{ Pa}$** (normal clean limit $< 250\text{ Pa}$).
  - Restricted airflow choked regeneration air volume across the desiccant wheel, preventing proper zeolite regeneration and causing process dew point to spike to **$-18^\circ\text{C}$**.
  - ABS resin pellets in hopper exited with residual moisture of **$0.048\%$**, well in excess of the **$0.02\%$** manufacturer upper limit.

### Corrective Action Carried Out:
1. Removed choked intake filter cartridge and installed brand-new spare filter (Part # FLT-DM-04).
2. Cleaned filter plenum chamber and intake grille.
3. Activated high-velocity desiccant regeneration cycle. Within 30 minutes, process air dew point restored to **$-41.5^\circ\text{C}$**.
4. Quarantined resin in hopper; initiated full 4-hour pre-drying cycle at $82^\circ\text{C}$.
5. Re-sampled ABS resin pellets: Moisture analyzer measured **$0.011\%$** ($< 0.02\%$ specification).
6. Resumed molding on IM-05. Inspected 50 consecutive shots (200 parts across all 4 cavities).
   - **Verification Result:** 50/50 consecutive shots defect-free across all cavities including Cavity #3.
   - Sink marks and short fill resolved completely.

### Preventive SOP Action:
- Update SOP-MNT-IM-08: Add mandatory checklist item to verify dew point sensor reads $\le -35^\circ\text{C}$ before authorizing any material lot changeover.
- Install automated differential pressure switch across intake filter to trigger warning alarm when pressure exceeds $300\text{ Pa}$.
