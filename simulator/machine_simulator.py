"""Multi-machine telemetry generator simulating parallel CNC production lines."""

from __future__ import annotations

import logging
import random
from datetime import datetime, timezone

from simulator.models import MachineTelemetry

logger = logging.getLogger(__name__)


class MachineSimulator:
    """Simulates real-time sensor streams across CNC-01, CNC-02, and CNC-03."""

    def __init__(self) -> None:
        self.anomaly_active: dict[str, bool] = {
            "CNC-01": False,
            "CNC-02": False,
            "CNC-03": False,
        }
        self.anomaly_severity: dict[str, float] = {
            "CNC-01": 0.0,
            "CNC-02": 0.0,
            "CNC-03": 0.0,
        }
        # Nominal baselines
        self.machines_meta = {
            "CNC-01": {"tool_id": "T04", "base_rpm": 1480},
            "CNC-02": {"tool_id": "T07", "base_rpm": 1480},
            "CNC-03": {"tool_id": "T07", "base_rpm": 1480},
        }

    def inject_anomaly(self, machine_id: str = "CNC-02", severity: float = 1.0) -> None:
        """Triggers a mechanical anomaly (tool wear vibration spike + motor current rise)."""
        if machine_id in self.anomaly_active:
            self.anomaly_active[machine_id] = True
            self.anomaly_severity[machine_id] = max(0.0, min(severity, 2.0))
            logger.warning(
                "Injected mechanical anomaly into %s (severity=%.2f)", machine_id, severity
            )

    def reset(self) -> None:
        """Restores all machines to normal baseline operation."""
        for m in self.anomaly_active:
            self.anomaly_active[m] = False
            self.anomaly_severity[m] = 0.0
        logger.info("Reset all machine telemetry to baseline")

    def tick(self) -> list[MachineTelemetry]:
        """Generates a synchronous telemetry snapshot for all machines."""
        now = datetime.now(timezone.utc).isoformat()
        results: list[MachineTelemetry] = []

        for machine_id, meta in self.machines_meta.items():
            is_anomalous = self.anomaly_active[machine_id]
            sev = self.anomaly_severity[machine_id]

            # Baselines with realistic Gaussian fluctuations
            # Nominal: Vib ~2.0 mm/s, Current ~12.0 A, Temp ~42.0 C, RPM ~1480
            base_vib = 2.00 + random.gauss(0.0, 0.05)
            base_current = 12.00 + random.gauss(0.0, 0.15)
            base_temp = 42.00 + random.gauss(0.0, 0.3)
            base_rpm = meta["base_rpm"] + int(random.gauss(0, 3))

            if is_anomalous:
                # Scenario 1: Tool wear causes +35% vibration surge and +12% current rise
                vib_multiplier = 1.0 + (0.35 * sev)
                curr_multiplier = 1.0 + (0.12 * sev)
                spindle_vib = round(base_vib * vib_multiplier, 3)
                motor_curr = round(base_current * curr_multiplier, 2)
                spindle_temp = round(base_temp + (2.5 * sev), 1)
                rpm = base_rpm - int(15 * sev)
                status = "ALARM" if sev >= 0.8 else "WARNING"
                anomaly_score = min(0.98, 0.65 + (0.3 * sev))
            else:
                spindle_vib = round(base_vib, 3)
                motor_curr = round(base_current, 2)
                spindle_temp = round(base_temp, 1)
                rpm = base_rpm
                status = "NORMAL"
                anomaly_score = max(0.01, round(random.uniform(0.02, 0.08), 3))

            results.append(
                MachineTelemetry(
                    machine_id=machine_id,
                    timestamp=now,
                    tool_id=meta["tool_id"],
                    spindle_vibration=spindle_vib,
                    motor_current=motor_curr,
                    spindle_temp=spindle_temp,
                    rpm=rpm,
                    operating_status=status,
                    anomaly_score=anomaly_score,
                )
            )

        return results
