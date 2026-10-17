---
document_id: drive/maint_logs/ML-SYN-0005.md
title: Maintenance Log (Drive): CORRECTIVE on CNC-SIM-02
category: maint_log
machine_id: CNC-SIM-02
component: Motor / drive
incident_date: 2026-09-13 13:00:00
tags: ["maint_log", "drive_ingest", "corrective"]
---

# Maintenance Log (Drive Ingest): ML-SYN-0005
**Machine:** CNC-SIM-02 (drive_oem_a drive_series_a) — Motor / drive
**Record Type:** CORRECTIVE
**Maintenance Type:** Alarm 51
**Trigger / Alarm Code:** 51.0
**Work Order:** WO-SYN-005
**Technician Role:** Drive engineer
**Downtime (min):** 105.0
**Linked 8D:** SYN-8D-004

## Operating Status
- Before: FAULT
- After: RUNNING

## Reported Symptom
Overload 2 / high-current alarm.

## Inspection Findings
Current trend was elevated in the synthetic trace; mechanical restriction and configuration are not yet proven.

## Work Performed
Preserved trace; inspected mechanical movement and checked drive/motor configuration against approved records.

## Parts Replaced
None

## Parameter / Setting Changed
None

## Test Run Result
Controlled run passed in simulation after the suspected restriction was cleared.

## Follow-up
- Required: Yes
- Due: 2026-09-18

## Notes
Record actual current-duration trace and approved ratings in real cases.
