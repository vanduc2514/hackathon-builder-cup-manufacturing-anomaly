"""Injection Engine: Coordinates deterministic anomaly bursts and fast-forward demo triggers."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from simulator.conveyor_simulator import ConveyorSimulator
from simulator.machine_simulator import MachineSimulator

logger = logging.getLogger(__name__)


class DefectInjectionEngine:
    """Deterministic defect burst and scenario injection coordinator."""

    def __init__(
        self,
        machine_sim: Optional[MachineSimulator] = None,
        conveyor_sim: Optional[ConveyorSimulator] = None,
        seed: Optional[int] = None,
    ) -> None:
        self.machine_sim = machine_sim or MachineSimulator(seed=seed)
        self.conveyor_sim = conveyor_sim or ConveyorSimulator(seed=seed)
        self.active_scenario: Optional[str] = None
        self.active_machine: Optional[str] = None
        self.active_severity: float = 1.0

    def inject_scenario_1_cnc_tool_wear(
        self,
        machine_id: str = "CNC-02",
        tool_id: str = "T07",
        severity: float = 1.0,
    ) -> Dict[str, Any]:
        """Injects Scenario 1: CNC-02 mechanical onset (+35% vib, +12% current) & vertical scratch burst."""
        self.active_scenario = "cnc_tool_wear"
        self.active_machine = machine_id
        self.active_severity = severity

        self.machine_sim.inject_anomaly(
            machine_id=machine_id, severity=severity, scenario="cnc_tool_wear"
        )
        self.conveyor_sim.set_anomaly(
            machine_id=machine_id,
            active=True,
            scenario="cnc_tool_wear",
        )
        logger.warning(
            "Injected Scenario 1 (CNC-02 Tool Wear) into %s/%s (severity=%.2f)",
            machine_id,
            tool_id,
            severity,
        )
        return {
            "scenario": "cnc_tool_wear",
            "machine_id": machine_id,
            "tool_id": tool_id,
            "vibration_delta": "+35%",
            "current_delta": "+12%",
            "defect_type": "scratch_vertical",
            "spc_expected_surge": "0.5% -> 7.7%",
        }

    def inject_scenario_2_im_damp_material(
        self,
        machine_id: str = "IM-05",
        tool_id: str = "MOLD-03",
        severity: float = 1.0,
    ) -> Dict[str, Any]:
        """Injects Scenario 2: IM-05 mold damp material (dew point -40 C -> -18 C) & cavity #3 short fill/sink marks."""
        self.active_scenario = "im_damp_material"
        self.active_machine = machine_id
        self.active_severity = severity

        self.machine_sim.inject_anomaly(
            machine_id=machine_id, severity=severity, scenario="im_damp_material"
        )
        self.conveyor_sim.set_anomaly(
            machine_id=machine_id,
            active=True,
            scenario="im_damp_material",
        )
        logger.warning(
            "Injected Scenario 2 (IM-05 Mold Damp Material) into %s/%s (severity=%.2f)",
            machine_id,
            tool_id,
            severity,
        )
        return {
            "scenario": "im_damp_material",
            "machine_id": machine_id,
            "tool_id": tool_id,
            "dew_point_delta": "-40°C -> -18°C",
            "machine_mechanics": "normal",
            "defect_type": "short_fill / sink_mark",
            "cavity_id": 3,
            "spc_expected_surge": "0.4% -> 8.1%",
        }

    def set_verification_recovery(self) -> None:
        """Enables gatekeeper recovery mode where conveyor generates 50 consecutive defect-free parts."""
        self.conveyor_sim.set_recovery_mode(active=True)
        logger.info("Set simulation to recovery mode for gatekeeper verification")

    def reset(self) -> None:
        """Restores all machinery, conveyors, and scenarios back to pristine baseline."""
        self.machine_sim.reset()
        self.conveyor_sim.reset()
        self.active_scenario = None
        self.active_machine = None
        self.active_severity = 1.0
        logger.info("Reset injection engine to baseline")

    def get_status(self) -> Dict[str, Any]:
        return {
            "active_scenario": self.active_scenario,
            "active_machine": self.active_machine,
            "active_severity": self.active_severity,
            "recovery_mode": self.conveyor_sim.recovery_mode,
            "consecutive_passes": self.conveyor_sim.consecutive_pass_count,
        }


# Global shared instance
injection_engine = DefectInjectionEngine()
