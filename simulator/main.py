"""Main service entrypoint for the standalone factory floor simulator."""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal
from typing import Optional

from simulator.config import settings
from simulator.conveyor_simulator import ConveyorSimulator
from simulator.edge import EdgeInspectionStation, EdgePubSubDispatcher
from simulator.machine_simulator import MachineSimulator
from simulator.models import QualityEventPayload, SimulatorTickSummary
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
        scenario: str = "cnc_tool_wear",
        seed: Optional[int] = None,
        pubsub: bool = False,
    ) -> None:
        self.speed = max(0.1, speed)
        self.interval = settings.tick_interval_sec / self.speed
        self.running = False
        self.tick_count = 0
        self._stopped = False
        self.scenario = scenario
        self.pubsub = pubsub

        include_im = scenario == "im_damp_material"
        self.machine_sim = MachineSimulator(include_im=include_im, seed=seed)
        self.conveyor_sim = ConveyorSimulator(include_im=include_im, seed=seed)
        self.edge_station = EdgeInspectionStation()
        self.publisher = MqttPublisher(dry_run=dry_run)
        self.pubsub_dispatcher = EdgePubSubDispatcher(dry_run=dry_run)

        if inject_on_start:
            self.trigger_anomaly(scenario=scenario)

    def trigger_anomaly(
        self,
        machine_id: Optional[str] = None,
        scenario: str = "cnc_tool_wear",
        severity: float = 1.0,
    ) -> None:
        """Injects defect burst into target machine according to specified scenario."""
        if scenario == "im_damp_material" or machine_id == "IM-05":
            target = machine_id or "IM-05"
            self.machine_sim.inject_anomaly(target, severity=severity, scenario="im_damp_material")
            self.conveyor_sim.set_anomaly(target, active=True, scenario="im_damp_material")
        else:
            target = machine_id or "CNC-02"
            self.machine_sim.inject_anomaly(target, severity=severity, scenario="cnc_tool_wear")
            self.conveyor_sim.set_anomaly(target, active=True, scenario="cnc_tool_wear")

        if self.pubsub:
            quality_evt = QualityEventPayload(
                machine_id=target,
                tool_id="MOLD-03" if scenario == "im_damp_material" else "T07",
                defect_type="short_fill" if scenario == "im_damp_material" else "scratch_vertical",
                scenario=scenario,
                mode="fast" if self.speed > 2.0 else "demo",
                severity="high" if severity >= 1.0 else "medium",
            )
            self.pubsub_dispatcher.publish_quality_event(quality_evt)
            logger.info(
                "Published anomaly trigger quality-event to Pub/Sub (%s, %s)", target, scenario
            )

    def reset_baseline(self) -> None:
        """Restores all machinery to normal baseline."""
        self.machine_sim.reset()
        self.conveyor_sim.reset()
        self.edge_station.edge_filter.reset_statistics()
        self.edge_station.spool.clear()

    async def step(self) -> SimulatorTickSummary:
        """Executes a single simulation tick."""
        self.tick_count += 1
        telemetry = self.machine_sim.tick()
        parts = self.conveyor_sim.tick()

        # Publish via MQTT
        self.publisher.publish_telemetry(telemetry)
        self.publisher.publish_parts(parts)

        # Process parts through edge inspection station
        forwarded_packets = []
        for p in parts:
            _, packet = self.edge_station.inspect(p)
            if packet.filter_decision == "FORWARD":
                forwarded_packets.append(packet)
                if self.pubsub:
                    m_telemetry = next(
                        (t for t in telemetry if t.machine_id == packet.machine_id), None
                    )
                    self.pubsub_dispatcher.dispatch_anomaly(
                        packet=packet,
                        scenario=self.scenario,
                        mode="fast" if self.speed > 2.0 else "demo",
                        telemetry=m_telemetry,
                    )

        # Formatted log summary
        cnc_summaries = []
        for t in telemetry:
            flag = f" [{t.operating_status}]" if t.operating_status != "NORMAL" else ""
            cnc_summaries.append(f"{t.machine_id}: {t.spindle_vibration:.2f}mm/s{flag}")

        defects = [p for p in parts if p.status != "PASS"]
        defect_str = f" ({len(defects)} defect)" if defects else ""
        forward_str = f" [{len(forwarded_packets)} forwarded]" if forwarded_packets else ""
        logger.info(
            "Tick #%d | %s | %d parts%s%s",
            self.tick_count,
            " | ".join(cnc_summaries),
            len(parts),
            defect_str,
            forward_str,
        )

        edge_stats = self.edge_station.edge_filter.get_statistics()
        return SimulatorTickSummary(
            tick_index=self.tick_count,
            telemetry=telemetry,
            parts=parts,
            edge_stats=edge_stats,
            forwarded_packets=forwarded_packets,
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
        if self._stopped:
            return
        self._stopped = True
        self.running = False
        self.publisher.close()
        self.pubsub_dispatcher.close()
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
        help="Start with defect burst pre-injected",
    )
    parser.add_argument(
        "--scenario",
        type=str,
        default="cnc_tool_wear",
        choices=["cnc_tool_wear", "im_damp_material"],
        help="Simulation anomaly scenario (cnc_tool_wear or im_damp_material)",
    )
    parser.add_argument(
        "--ticks",
        type=int,
        default=0,
        help="Number of ticks to run before exiting (0 for continuous)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Optional random seed for deterministic simulation runs",
    )
    parser.add_argument(
        "--pubsub",
        action="store_true",
        help="Publish quality-events to Google Cloud Pub/Sub / emulator",
    )
    args = parser.parse_args()

    service = FactorySimulatorService(
        speed=args.speed,
        dry_run=args.dry_run,
        inject_on_start=args.inject,
        scenario=args.scenario,
        seed=args.seed,
        pubsub=args.pubsub,
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
