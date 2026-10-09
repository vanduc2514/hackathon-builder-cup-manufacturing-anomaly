"""Multi-machine telemetry generator simulating parallel CNC production lines."""

from __future__ import annotations

import logging
import random
from datetime import datetime, timezone

from simulator.models import MachineTelemetry

logger = logging.getLogger(__name__)


class MachineSimulator:
    """Simulates real-time sensor streams across CNC-01, CNC-02, CNC-03, and optional IM-05."""

    def __init__(self, include_im: bool = False, seed: int | None = None) -> None:
        self.rng = random.Random(seed)
        self.include_im = include_im
        self.anomaly_active: dict[str, bool] = {
            "CNC-01": False,
            "CNC-02": False,
            "CNC-03": False,
            "IM-05": False,
        }
        self.anomaly_severity: dict[str, float] = {
            "CNC-01": 0.0,
            "CNC-02": 0.0,
            "CNC-03": 0.0,
            "IM-05": 0.0,
        }
        # Nominal baselines
        self.machines_meta = {
            "CNC-01": {"tool_id": "T04", "base_rpm": 1480, "type": "cnc"},
            "CNC-02": {"tool_id": "T07", "base_rpm": 1480, "type": "cnc"},
            "CNC-03": {"tool_id": "T07", "base_rpm": 1480, "type": "cnc"},
        }
        if self.include_im:
            self.machines_meta["IM-05"] = {"tool_id": "MOLD-03", "base_rpm": 0, "type": "im"}

    def inject_anomaly(
        self,
        machine_id: str = "CNC-02",
        severity: float = 1.0,
        scenario: str = "cnc_tool_wear",
    ) -> None:
        """Triggers an anomaly: tool wear on CNC-02 or damp material dew point rise on IM-05."""
        if machine_id == "IM-05" or scenario == "im_damp_material":
            machine_id = "IM-05"
            self.include_im = True
            if "IM-05" not in self.machines_meta:
                self.machines_meta["IM-05"] = {"tool_id": "MOLD-03", "base_rpm": 0, "type": "im"}

        if machine_id in self.anomaly_active:
            self.anomaly_active[machine_id] = True
            self.anomaly_severity[machine_id] = max(0.0, min(severity, 2.0))
            logger.warning(
                "Injected anomaly into %s (scenario=%s, severity=%.2f)",
                machine_id,
                scenario,
                severity,
            )

    def reset(self) -> None:
        """Restores all machines to normal baseline operation."""
        for m in self.anomaly_active:
            self.anomaly_active[m] = False
            self.anomaly_severity[m] = 0.0
        # If IM-05 was dynamically added, keep or retain according to initial include_im
        if not self.include_im and "IM-05" in self.machines_meta:
            del self.machines_meta["IM-05"]
        logger.info("Reset all machine telemetry to baseline")

    reset_baseline = reset

    def tick(self) -> list[MachineTelemetry]:
        """Generates a synchronous telemetry snapshot for all machines."""
        now = datetime.now(timezone.utc).isoformat()
        results: list[MachineTelemetry] = []

        for machine_id, meta in self.machines_meta.items():
            is_anomalous = self.anomaly_active.get(machine_id, False)
            sev = self.anomaly_severity.get(machine_id, 0.0)
            m_type = meta.get("type", "cnc")

            if m_type == "im":
                # Injection Molding IM-05: machine parameters remain normal while dew point rises
                base_vib = 0.80 + self.rng.gauss(0.0, 0.02)
                base_current = 16.50 + self.rng.gauss(0.0, 0.20)
                base_temp = 210.0 + self.rng.gauss(0.0, 0.5)
                base_rpm = 0

                if is_anomalous:
                    # Scenario 2: Material dryer dew point rises from -40 C to -18 C
                    dryer_dew_point = round(
                        -18.0 + self.rng.gauss(0.0, 0.3) + (1.0 - sev) * -5.0, 1
                    )
                    status = "ALARM" if sev >= 0.8 else "WARNING"
                    anomaly_score = min(0.96, 0.70 + (0.25 * sev))
                else:
                    dryer_dew_point = round(-40.0 + self.rng.gauss(0.0, 0.5), 1)
                    status = "NORMAL"
                    anomaly_score = max(0.01, round(self.rng.uniform(0.02, 0.06), 3))

                results.append(
                    MachineTelemetry(
                        machine_id=machine_id,
                        timestamp=now,
                        tool_id=meta["tool_id"],
                        spindle_vibration=round(base_vib, 3),
                        motor_current=round(base_current, 2),
                        spindle_temp=round(base_temp, 1),
                        rpm=base_rpm,
                        operating_status=status,
                        anomaly_score=anomaly_score,
                        dryer_dew_point=dryer_dew_point,
                    )
                )
                continue

            # CNC baseline with realistic Gaussian fluctuations
            # Nominal: Vib ~2.0 mm/s, Current ~12.0 A, Temp ~42.0 C, RPM ~1480
            base_vib = 2.00 + self.rng.gauss(0.0, 0.05)
            base_current = 12.00 + self.rng.gauss(0.0, 0.15)
            base_temp = 42.00 + self.rng.gauss(0.0, 0.3)
            base_rpm = meta["base_rpm"] + int(self.rng.gauss(0, 3))

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
                anomaly_score = max(0.01, round(self.rng.uniform(0.02, 0.08), 3))

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
