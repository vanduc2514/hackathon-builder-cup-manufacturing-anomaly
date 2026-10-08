"""Conveyor belt simulator emitting discrete serialized parts through inspection."""

from __future__ import annotations

import logging
import random
from datetime import datetime, timezone

from simulator.models import ConveyorPart

logger = logging.getLogger(__name__)


class ConveyorSimulator:
    """Simulates physical conveyor belt moving manufactured parts past optical inspection."""

    def __init__(self, initial_sequence: int = 1001) -> None:
        self.sequence: int = initial_sequence
        self.machines = ["CNC-01", "CNC-02", "CNC-03"]
        self.machine_tools = {
            "CNC-01": "T04",
            "CNC-02": "T07",
            "CNC-03": "T07",
        }
        self.default_lot_id = "AL-5083-B4"
        self.anomaly_active: dict[str, bool] = {
            "CNC-01": False,
            "CNC-02": False,
            "CNC-03": False,
        }
        self.consecutive_pass_count: int = 0

    def set_anomaly(self, machine_id: str = "CNC-02", active: bool = True) -> None:
        """Enables or disables defect generation for a specific machine."""
        if machine_id in self.anomaly_active:
            self.anomaly_active[machine_id] = active
            if not active:
                self.consecutive_pass_count = 0
            logger.info("Conveyor anomaly for %s set to %s", machine_id, active)

    def reset(self) -> None:
        """Resets all defect states on the conveyor."""
        for m in self.anomaly_active:
            self.anomaly_active[m] = False
        self.consecutive_pass_count = 0
        logger.info("Reset conveyor defect state")

    def tick(self) -> list[ConveyorPart]:
        """Emits parts passing the camera inspection station in the current tick."""
        now = datetime.now(timezone.utc).isoformat()
        # Round-robin or random distribution across machines operating in parallel
        # Typically 1 to 2 parts pass the camera every 2 seconds
        parts_count = random.choice([1, 2])
        parts_emitted: list[ConveyorPart] = []

        for _ in range(parts_count):
            machine_id = random.choice(self.machines)
            tool_id = self.machine_tools[machine_id]
            product_id = f"PRD-{self.sequence}"
            self.sequence += 1

            is_defective = False
            defect_type = None

            if self.anomaly_active[machine_id]:
                # Injected tool wear on CNC-02 causes ~7.7% defect spike with vertical scratches
                if random.random() < 0.08:
                    is_defective = True
                    defect_type = "scratch_vertical"
                    self.consecutive_pass_count = 0
                else:
                    self.consecutive_pass_count += 1
            else:
                # Nominal baseline defect rate ~0.4%
                if random.random() < 0.004:
                    is_defective = True
                    defect_type = "minor_burr"
                    self.consecutive_pass_count = 0
                else:
                    self.consecutive_pass_count += 1

            status = (
                "DEFECT_SCRATCH"
                if is_defective and defect_type == "scratch_vertical"
                else ("DEFECT_OTHER" if is_defective else "PASS")
            )

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
                    lot_id=self.default_lot_id,
                    status=status,
                    defect_type=defect_type,
                    confidence=0.96 if is_defective else 0.99,
                    image_token=image_token,
                )
            )

        return parts_emitted
