# Competition Telemetry Datasets

Canonical copies of the two sensor CSVs shipped with the competition Drive folder
`💻 Competition | AI Builder Cup / open sensor simulate / Dataset/`. They back
the CSV telemetry replay mode of the edge simulator (`simulator/machine_simulator.py`
+ `simulator/csv_replay.py`) and the nested-payload validator in
`backend/core/models.py` (`MachineTelemetryPayload`).

The Developer-experience cache path `.cache/gdrive/Dataset/*.csv` remains as a
fallback when this canonical path is missing (e.g. fresh worktree before
`mise run drive:pull`).

## Files

| File | Rows | Timestamp format | Status |
| --- | --- | --- | --- |
| `normal_machine_operating_data_1000_with_timestamp.csv` | 1000 | `M/D/YYYY H:MM` (e.g. `10/1/2026 8:00`) | Baseline, all rows `RUNNING`, no alarm codes |
| `abnormal_machine_operating_data_1000.csv` | 1000 | `YYYY-MM-DD HH:MM:SS` (e.g. `2026-10-01 09:00:00`) | Failure mode, all rows `FAULT`, non-empty `alarm_code` |

Each row represents a 1-second CNC telemetry tick sampled at the asset's
induction-motor spindle.

## Schema

| Column | Type | Description |
| --- | --- | --- |
| `timestamp` | string | Local wall-clock sample timestamp; format depends on file (see above) |
| `speed` | float | Spindle rotational speed (rpm) |
| `temperature` | float | Spindle bearing temperature (°C) |
| `load_percent` | float | Operating load percentage (0-200) |
| `current_percent` | float | Motor current as percentage of rated current (0-150) |
| `torque_percent` | float | Motor torque percentage (0-200) |
| `overload_percent` | float | Overload indicator percentage (0-200) |
| `position_error` | float | Servo position error (microns) |
| `feedback_error` | float | Sensor feedback error (microns) |
| `vibration` | float | Spindle vibration amplitude (mm/s) |
| `fan_status` | bool | Cooling fan OK flag (`TRUE` / `true`) |
| `alarm_code` | int | Alarm code; empty for normal, populated for abnormal |
| `warning_code` | int | Warning code; empty for normal, populated for abnormal |
| `operating_status` | string | Equipment status (`RUNNING` / `FAULT`) |

## Replay Mode Mapping (CSV → Competition Nested JSON)

When `simulator/csv_replay.py` is used in replay mode, every CSV row is mapped
to the canonical competition nested MQTT payload as documented in `AI-sensor-spec.md`:

| CSV field | Nested JSON path |
| --- | --- |
| `speed` | `sensor.rpm.value` |
| `temperature` | `sensor.temperature.value` |
| `current_percent * 0.123` | `sensor.current.value` (12.3A baseline when `current_percent = 100`) |
| `vibration` | `sensor.vibration.value` |
| `load_percent` | `operating.load_percent` |
| `operating_status` | `health.status = NORMAL` for `RUNNING`, `ANOMALY` for `FAULT`/`ALARM` |
| `alarm_code` (empty) | `health.anomaly_score = 0.02 + uniform(0, 0.06)` |
| `alarm_code` (non-empty) | `health.anomaly_score = 0.65 + min(alarm_code/100, 0.33)` |

## Provenance

- Source: competition Drive folder `💻 Competition | AI Builder Cup / open sensor simulate / Dataset/`.
- License: as supplied by the competition organizer; safe to commit for local
  development.
- Local cache: `.cache/gdrive/Dataset/*.csv` (fetched via `mise run drive:pull`).
- SHA256 checksums recorded during copy for audit traceability.
