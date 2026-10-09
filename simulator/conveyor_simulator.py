"""Conveyor belt simulator emitting discrete serialized parts through inspection."""

from __future__ import annotations

import logging
import random
from datetime import datetime, timezone

from simulator.models import ConveyorPart

logger = logging.getLogger(__name__)


class ConveyorSimulator:
    """Simulates physical conveyor belt moving manufactured parts past optical inspection."""

    def __init__(
        self,
        initial_sequence: int = 1001,
        include_im: bool = False,
        seed: int | None = None,
    ) -> None:
        self.rng = random.Random(seed)
        self.sequence: int = initial_sequence
        self.include_im = include_im
        self.machines = ["CNC-01", "CNC-02", "CNC-03"]
        if self.include_im:
            self.machines.append("IM-05")
        self.machine_tools = {
            "CNC-01": "T04",
            "CNC-02": "T07",
            "CNC-03": "T07",
            "IM-05": "MOLD-03",
        }
        self.default_lot_id = "AL-5083-B4"
        self.im_lot_id = "PA66-GF30-L12"
        self.anomaly_active: dict[str, bool] = {
            "CNC-01": False,
            "CNC-02": False,
            "CNC-03": False,
            "IM-05": False,
        }
        self.anomaly_scenario: dict[str, str] = {}
        self.consecutive_pass_count: int = 0
        self.recovery_mode: bool = False

    def set_anomaly(
        self,
        machine_id: str = "CNC-02",
        active: bool = True,
        scenario: str = "cnc_tool_wear",
    ) -> None:
        """Enables or disables defect generation for a specific machine and scenario."""
        if machine_id == "IM-05" or scenario == "im_damp_material":
            machine_id = "IM-05"
            self.include_im = True
            if "IM-05" not in self.machines:
                self.machines.append("IM-05")

        if machine_id in self.anomaly_active:
            self.anomaly_active[machine_id] = active
            self.anomaly_scenario[machine_id] = scenario
            if active:
                self.recovery_mode = False
            else:
                self.consecutive_pass_count = 0
            logger.info(
                "Conveyor anomaly for %s set to %s (scenario=%s)", machine_id, active, scenario
            )

    def set_recovery_mode(self, active: bool = True) -> None:
        """Enables post-repair recovery mode where all parts pass cleanly."""
        self.recovery_mode = active
        if active:
            for m in self.anomaly_active:
                self.anomaly_active[m] = False

    def reset(self) -> None:
        """Resets all defect states on the conveyor."""
        for m in self.anomaly_active:
            self.anomaly_active[m] = False
        self.anomaly_scenario.clear()
        self.consecutive_pass_count = 0
        self.recovery_mode = False
        if not self.include_im and "IM-05" in self.machines:
            self.machines.remove("IM-05")
        logger.info("Reset conveyor defect state")

    reset_baseline = reset

    def tick(self) -> list[ConveyorPart]:
        """Emits parts passing the camera inspection station in the current tick."""
        now = datetime.now(timezone.utc).isoformat()
        # Round-robin or random distribution across machines operating in parallel
        parts_count = self.rng.choice([1, 2])
        parts_emitted: list[ConveyorPart] = []

        for _ in range(parts_count):
            machine_id = self.rng.choice(self.machines)
            tool_id = self.machine_tools.get(machine_id, "T07")
            product_id = f"PRD-{self.sequence}"
            self.sequence += 1

            is_defective = False
            defect_type = None
            cavity_id = None
            lot_id = self.im_lot_id if machine_id == "IM-05" else self.default_lot_id

            if self.recovery_mode:
                # Post-repair gatekeeper recovery stream (100% PASS)
                is_defective = False
                self.consecutive_pass_count += 1
            elif self.anomaly_active.get(machine_id, False):
                scenario = self.anomaly_scenario.get(machine_id, "cnc_tool_wear")
                if scenario == "im_damp_material" or machine_id == "IM-05":
                    # Scenario 2: Mold cavity #3 short fill and sink marks (~8.1% line defect spike)
                    if self.rng.random() < 0.324:
                        is_defective = True
                        cavity_id = 3
                        defect_type = self.rng.choice(["short_fill", "sink_mark"])
                        self.consecutive_pass_count = 0
                    else:
                        self.consecutive_pass_count += 1
                        cavity_id = self.rng.choice([1, 2, 4])
                else:
                    # Scenario 1: Tool wear on CNC-02 causes ~7.7% line defect spike (23% on CNC-02)
                    if self.rng.random() < 0.231:
                        is_defective = True
                        defect_type = "scratch_vertical"
                        self.consecutive_pass_count = 0
                    else:
                        self.consecutive_pass_count += 1
            else:
                # Nominal baseline defect rate ~0.4%
                if self.rng.random() < 0.004:
                    is_defective = True
                    defect_type = "minor_burr"
                    self.consecutive_pass_count = 0
                else:
                    self.consecutive_pass_count += 1

            if is_defective:
                if defect_type == "scratch_vertical":
                    status = "DEFECT_SCRATCH"
                elif defect_type == "short_fill":
                    status = "DEFECT_SHORT_FILL"
                elif defect_type == "sink_mark":
                    status = "DEFECT_SINK_MARK"
                else:
                    status = "DEFECT_OTHER"
            else:
                status = "PASS"

            image_token = (
                f"mvtec_ad/metal_nut/scratch/frame_{self.sequence % 50:03d}.png"
                if is_defective
                else f"mvtec_ad/metal_nut/good/frame_{self.sequence % 100:03d}.png"
            )

            parts_emitted.append(
                ConveyorPart(
                    product_id=product_id,
                    timestamp=now,
                    machine_id=machine_id,
                    tool_id=tool_id,
                    lot_id=lot_id,
                    status=status,
                    defect_type=defect_type,
                    confidence=0.96 if is_defective else 0.99,
                    image_token=image_token,
                    cavity_id=cavity_id,
                )
            )

        return parts_emitted
