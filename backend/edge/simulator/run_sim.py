"""Edge simulator runner feeding synthetic camera frames through Gemma edge gateway."""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal

from backend.edge.gateway.edge_filter import EdgeInspectionStation, EdgeNoiseFilter
from backend.edge.gateway.gemma_classifier import GemmaEdgeClassifier
from simulator.conveyor_simulator import ConveyorSimulator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("edge_sim")


class EdgeSimulatorRunner:
    """Feeds synthetic conveyor camera frames through the Gemma edge classifier and noise filter."""

    def __init__(
        self,
        mode: str = "heuristic",
        drop_ratio: float = 0.95,
        inject_on_start: bool = False,
        scenario: str = "cnc_tool_wear",
    ) -> None:
        self.conveyor = ConveyorSimulator(include_im=(scenario == "im_damp_material"))
        self.classifier = GemmaEdgeClassifier(mode=mode)
        self.edge_filter = EdgeNoiseFilter(pass_drop_ratio=drop_ratio)
        self.station = EdgeInspectionStation(
            classifier=self.classifier, edge_filter=self.edge_filter
        )
        self.running = False
        self.tick_count = 0

        if inject_on_start:
            target = "IM-05" if scenario == "im_damp_material" else "CNC-02"
            self.conveyor.set_anomaly(target, active=True, scenario=scenario)
            logger.info("Injected anomaly '%s' on %s", scenario, target)

    def step(self) -> None:
        """Executes one simulation step: emits conveyor parts and processes through edge gateway."""
        self.tick_count += 1
        parts = self.conveyor.tick()

        for part in parts:
            classification, packet = self.station.inspect(part)
            if packet.filter_decision == "FORWARD":
                logger.info(
                    "--> [FORWARD TO CLOUD] %s (%s) | type=%s conf=%.2f hash=%.8s... diverter=%s bbox=%s",
                    packet.product_id,
                    packet.machine_id,
                    packet.defect_type or packet.classification,
                    packet.confidence,
                    packet.frame_hash,
                    packet.diverter_actuated,
                    packet.bounding_box.to_list() if packet.bounding_box else None,
                )
            else:
                logger.debug(
                    "    [DROP LOCAL] %s (%s) | normal pass frame discarded locally (privacy protected)",
                    packet.product_id,
                    packet.machine_id,
                )

        stats = self.edge_filter.get_statistics()
        logger.info(
            "Tick #%d | Total: %d | Forwarded: %d | Dropped: %d | Bandwidth Saved: %.1f%% (%.2f MB)",
            self.tick_count,
            stats.total_frames_evaluated,
            stats.total_frames_forwarded,
            stats.pass_frames_dropped,
            stats.cloud_bandwidth_reduction_pct,
            stats.estimated_bandwidth_saved_mb,
        )

    async def run(self, max_ticks: int = 5, interval_seconds: float = 0.5) -> None:
        """Runs the edge inspection loop."""
        self.running = True
        logger.info(
            "Starting Edge Gateway Simulator (max_ticks=%s, interval=%.2fs, mode=%s)",
            max_ticks or "infinite",
            interval_seconds,
            self.classifier.mode.value,
        )

        try:
            while self.running:
                self.step()
                if max_ticks > 0 and self.tick_count >= max_ticks:
                    logger.info("Reached maximum requested ticks (%d). Stopping.", max_ticks)
                    break
                await asyncio.sleep(interval_seconds)
        except asyncio.CancelledError:
            logger.info("Edge simulation cancelled.")
        finally:
            self.running = False


def main() -> None:
    """CLI entrypoint for running the local edge simulator."""
    parser = argparse.ArgumentParser(description="Gemma 3 Edge Inspection Simulator")
    parser.add_argument(
        "--ticks",
        type=int,
        default=5,
        help="Number of ticks to run (default: 5; 0 for continuous)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=0.5,
        help="Delay between ticks in seconds (default: 0.5)",
    )
    parser.add_argument(
        "--mode",
        type=str,
        default="heuristic",
        choices=["heuristic", "dataset_playback", "ollama"],
        help="Classifier mode (default: heuristic)",
    )
    parser.add_argument(
        "--drop-ratio",
        type=float,
        default=0.95,
        help="Pass frame drop ratio (default: 0.95)",
    )
    parser.add_argument(
        "--inject",
        action="store_true",
        help="Inject defect burst on startup",
    )
    parser.add_argument(
        "--scenario",
        type=str,
        default="cnc_tool_wear",
        choices=["cnc_tool_wear", "im_damp_material"],
        help="Defect injection scenario",
    )
    args = parser.parse_args()

    runner = EdgeSimulatorRunner(
        mode=args.mode,
        drop_ratio=args.drop_ratio,
        inject_on_start=args.inject,
        scenario=args.scenario,
    )

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def handle_signal(*_):
        runner.running = False
        for task in asyncio.all_tasks(loop):
            task.cancel()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except NotImplementedError:
            signal.signal(sig, handle_signal)

    try:
        loop.run_until_complete(runner.run(max_ticks=args.ticks, interval_seconds=args.interval))
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        loop.close()


if __name__ == "__main__":
    main()
