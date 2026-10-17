---
document_id: drive/maint_logs/ML-SYN-0004.md
title: Maintenance Log (Drive): CORRECTIVE on CNC-SIM-01
category: maint_log
machine_id: CNC-SIM-01
component: Spindle / process
incident_date: 2026-09-10 12:00:00
tags: ["maint_log", "drive_ingest", "corrective"]
---

# Maintenance Log (Drive Ingest): ML-SYN-0004
**Machine:** CNC-SIM-01 (drive_oem_a drive_series_a) — Spindle / process
**Record Type:** CORRECTIVE
**Maintenance Type:** Alarm 50
**Trigger / Alarm Code:** 50.0
**Work Order:** WO-SYN-004
**Technician Role:** Process engineer
**Downtime (min):** 80.0
**Linked 8D:** SYN-8D-003

## Operating Status
- Before: FAULT
- After: RUNNING

## Reported Symptom
Overload 1 alarm with elevated load/overload trend.

## Inspection Findings
Tool condition and process load reviewed; excessive cutting load remains a hypothesis until validated.

## Work Performed
Inspected tool and workpiece; adjusted process conditions in simulation; performed controlled test cut.

## Parts Replaced
Tool insert (simulated)

## Parameter / Setting Changed
Process setting adjusted in simulation; actual values not specified

## Test Run Result
Load trend reduced versus simulated baseline; no alarm during test.

## Follow-up
- Required: Yes
- Due: 2026-09-15

## Notes
Do not copy parameter changes to real equipment without engineering approval.
