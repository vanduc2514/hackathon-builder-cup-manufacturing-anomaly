"""Main service entrypoint for the standalone factory floor simulator."""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal

from simulator.config import settings
from simulator.conveyor_simulator import ConveyorSimulator
from simulator.machine_simulator import MachineSimulator
from simulator.models import SimulatorTickSummary
from simulator.mqtt_publisher import MqttPublisher

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("simulator")


class FactorySimulatorService:
    """Orchestrates machine and conveyor simulation loops and MQTT dispatch."""

    def __init__(
        self,
        speed: float = 1.0,
        dry_run: bool = False,
        inject_on_start: bool = False,
    ) -> None:
        self.speed = max(0.1, speed)
        self.interval = settings.tick_interval_sec / self.speed
        self.running = False
        self.tick_count = 0

        self.machine_sim = MachineSimulator()
        self.conveyor_sim = ConveyorSimulator()
        self.publisher = MqttPublisher(dry_run=dry_run)

        if inject_on_start:
            self.machine_sim.inject_anomaly("CNC-02")
            self.conveyor_sim.set_anomaly("CNC-02", active=True)

    def trigger_anomaly(self, machine_id: str = "CNC-02") -> None:
        """Injects tool wear defect into target machine."""
        self.machine_sim.inject_anomaly(machine_id)
        self.conveyor_sim.set_anomaly(machine_id, active=True)

    def reset_baseline(self) -> None:
        """Restores all machinery to normal baseline."""
        self.machine_sim.reset()
        self.conveyor_sim.reset()

    async def step(self) -> SimulatorTickSummary:
        """Executes a single simulation tick."""
        self.tick_count += 1
        telemetry = self.machine_sim.tick()
        parts = self.conveyor_sim.tick()

        # Publish via MQTT
        self.publisher.publish_telemetry(telemetry)
        self.publisher.publish_parts(parts)

        # Formatted log summary
        cnc_summaries = []
        for t in telemetry:
            flag = f" [{t.operating_status}]" if t.operating_status != "NORMAL" else ""
            cnc_summaries.append(f"{t.machine_id}: {t.spindle_vibration:.2f}mm/s{flag}")

        defects = [p for p in parts if p.status != "PASS"]
        defect_str = f" ({len(defects)} defect)" if defects else ""
        logger.info(
            "Tick #%d | %s | %d parts%s",
            self.tick_count,
            " | ".join(cnc_summaries),
            len(parts),
            defect_str,
        )

        return SimulatorTickSummary(
            tick_index=self.tick_count,
            telemetry=telemetry,
            parts=parts,
        )

    async def run(self, max_ticks: int = 0) -> None:
        """Runs the continuous simulation loop."""
        self.running = True
        logger.info(
            "Starting Factory Simulator (interval=%.2fs, speed=%.1fx, max_ticks=%s)",
            self.interval,
            self.speed,
            max_ticks or "infinite",
        )

        try:
            while self.running:
                await self.step()
                if max_ticks > 0 and self.tick_count >= max_ticks:
                    logger.info("Reached maximum requested ticks (%d). Stopping.", max_ticks)
                    break
                await asyncio.sleep(self.interval)
        except asyncio.CancelledError:
            logger.info("Simulation loop cancelled.")
        finally:
            self.stop()

    def stop(self) -> None:
        """Gracefully stops the simulator and cleans up resources."""
        self.running = False
        self.publisher.close()
        logger.info("Factory Simulator stopped.")


def main() -> None:
    """CLI runner parsing flags and starting the simulator loop."""
    parser = argparse.ArgumentParser(description="Kaizen Agent Factory & Conveyor Simulator")
    parser.add_argument(
        "--speed",
        type=float,
        default=settings.speed_multiplier,
        help="Simulation speed multiplier (default: 1.0; e.g. 5.0 for 5x)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run without connecting to external MQTT broker",
    )
    parser.add_argument(
        "--inject",
        action="store_true",
        help="Start with CNC-02 mechanical defect pre-injected",
    )
    parser.add_argument(
        "--ticks",
        type=int,
        default=0,
        help="Number of ticks to run before exiting (0 for continuous)",
    )
    args = parser.parse_args()

    service = FactorySimulatorService(
        speed=args.speed,
        dry_run=args.dry_run,
        inject_on_start=args.inject,
    )

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def handle_signal(*_):
        logger.info("Received interrupt signal. Initiating shutdown...")
        service.running = False
        for task in asyncio.all_tasks(loop):
            task.cancel()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except NotImplementedError:
            signal.signal(sig, handle_signal)

    try:
        loop.run_until_complete(service.run(max_ticks=args.ticks))
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        service.stop()
        loop.close()


if __name__ == "__main__":
    main()
