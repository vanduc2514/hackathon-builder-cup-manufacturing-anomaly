---
document_id: drive/maint_logs/ML-SYN-0006.md
title: Maintenance Log (Drive): CORRECTIVE on CNC-SIM-03
category: maint_log
machine_id: CNC-SIM-03
component: Servo axis
incident_date: 2026-09-16 14:00:00
tags: ["maint_log", "drive_ingest", "corrective"]
---

# Maintenance Log (Drive Ingest): ML-SYN-0006
**Machine:** CNC-SIM-03 (drive_oem_a drive_series_a) — Servo axis
**Record Type:** CORRECTIVE
**Maintenance Type:** Alarm 52
**Trigger / Alarm Code:** 52.0
**Work Order:** WO-SYN-006
**Technician Role:** Controls engineer
**Downtime (min):** 90.0
**Linked 8D:** SYN-8D-005

## Operating Status
- Before: FAULT
- After: RUNNING

## Reported Symptom
Excessive error 1 while servo ON.

## Inspection Findings
Position deviation increased in the simulated trace; mechanical binding/parameter issue not confirmed.

## Work Performed
Inspected axis movement, lubrication, coupling and feedback connections; ran approved axis test in simulation.

## Parts Replaced
None

## Parameter / Setting Changed
No parameter change made without approval

## Test Run Result
Command/actual position tracking passed simulated test.

## Follow-up
- Required: Yes
- Due: 2026-09-21

## Notes
Real report should include axis ID, trace and exact configured limits.
