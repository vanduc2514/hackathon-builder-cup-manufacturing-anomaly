"""Standalone Factory Client API Server & real-time SSE telemetry broadcaster."""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import time
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Optional

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from simulator.config import settings
from simulator.injection_engine import DefectInjectionEngine
from simulator.models import (
    ActiveAnomalyStatus,
    ConveyorPart,
    EdgeFilterStatistics,
    FactoryStatusResponse,
    FactoryTickPacket,
    InjectAnomalyRequest,
    MachineTelemetry,
)

logger = logging.getLogger("simulator.server")


class EdgeFilterTracker:
    """Tracks Gemma 3 edge noise filtering and bandwidth conservation metrics."""

    def __init__(self) -> None:
        self.total_frames_evaluated: int = 0
        self.pass_frames_dropped: int = 0
        self.defect_frames_forwarded: int = 0
        self.uncertain_frames_forwarded: int = 0
        self.audit_sampled_forwarded: int = 0
        self._pass_counter: int = 0

    def record_frame(self, status: str) -> None:
        """Evaluates frame status: drops >=95% normal PASS frames, forwards 100% defects."""
        self.total_frames_evaluated += 1
        if status == "PASS":
            self._pass_counter += 1
            # 95% pass frames dropped, 5% audit-sampled (1 in 20 forwarded)
            if self._pass_counter % 20 == 0:
                self.audit_sampled_forwarded += 1
            else:
                self.pass_frames_dropped += 1
        else:
            self.defect_frames_forwarded += 1

    def get_statistics(self) -> EdgeFilterStatistics:
        """Computes live filtering metrics and estimated bandwidth saved."""
        total_fwd = (
            self.defect_frames_forwarded
            + self.uncertain_frames_forwarded
            + self.audit_sampled_forwarded
        )
        drop_ratio = (
            (self.pass_frames_dropped / self.total_frames_evaluated)
            if self.total_frames_evaluated > 0
            else 0.0
        )
        saved_mb = round(self.pass_frames_dropped * 0.512, 2)
        return EdgeFilterStatistics(
            total_frames_evaluated=self.total_frames_evaluated,
            pass_frames_dropped=self.pass_frames_dropped,
            defect_frames_forwarded=self.defect_frames_forwarded,
            uncertain_frames_forwarded=self.uncertain_frames_forwarded,
            audit_sampled_forwarded=self.audit_sampled_forwarded,
            total_frames_forwarded=total_fwd,
            drop_ratio=round(drop_ratio, 4),
            cloud_bandwidth_reduction_pct=round(drop_ratio * 100.0, 1),
            estimated_bandwidth_saved_mb=saved_mb,
        )

    def reset(self) -> None:
        """Resets all metrics back to zero baseline."""
        self.total_frames_evaluated = 0
        self.pass_frames_dropped = 0
        self.defect_frames_forwarded = 0
        self.uncertain_frames_forwarded = 0
        self.audit_sampled_forwarded = 0
        self._pass_counter = 0


class FactoryServerService:
    """Coordinates simulation loop, anomaly injection, and real-time SSE dispatch."""

    def __init__(self, interval_sec: float = 1.0, speed: float = 1.0) -> None:
        self.interval_sec = interval_sec
        self.speed = max(0.1, speed)
        self.running = False
        self.tick_count = 0
        self.anomaly_start_time: Optional[float] = None
        self._subscribers: set[asyncio.Queue[FactoryTickPacket]] = set()
        self._recent_parts: deque[ConveyorPart] = deque(maxlen=30)
        self.edge_tracker = EdgeFilterTracker()
        self._task: Optional[asyncio.Task[None]] = None

        self.injection_engine = DefectInjectionEngine()
        # Always register IM-05 baseline so 4 machine bays (CNC-01..03, IM-05) are monitored
        if "IM-05" not in self.injection_engine.machine_sim.machines_meta:
            self.injection_engine.machine_sim.include_im = True
            self.injection_engine.machine_sim.machines_meta["IM-05"] = {
                "tool_id": "MOLD-03",
                "base_rpm": 0,
                "type": "im",
            }
        if "IM-05" not in self.injection_engine.conveyor_sim.machines:
            self.injection_engine.conveyor_sim.include_im = True
            self.injection_engine.conveyor_sim.machines.append("IM-05")

    @property
    def interval(self) -> float:
        """Effective sleep duration in seconds between ticks."""
        return self.interval_sec / self.speed

    def get_active_anomaly_status(self) -> Optional[ActiveAnomalyStatus]:
        """Returns metadata and elapsed seconds for currently active defect scenario."""
        scenario = self.injection_engine.active_scenario
        if not scenario:
            return None
        elapsed = 0.0
        if self.anomaly_start_time is not None:
            elapsed = round(time.monotonic() - self.anomaly_start_time, 1)
        tool = "MOLD-03" if scenario == "im_damp_material" else "T07"
        return ActiveAnomalyStatus(
            scenario=scenario,
            machine_id=self.injection_engine.active_machine,
            tool_id=tool,
            severity=self.injection_engine.active_severity,
            elapsed_seconds=elapsed,
        )

    def get_current_snapshot(self) -> FactoryTickPacket:
        """Generates an immediate telemetry snapshot for newly connected clients."""
        telemetry = [
            MachineTelemetry(
                machine_id=m_id,
                tool_id=meta["tool_id"],
                spindle_vibration=1.25 if meta["type"] == "cnc" else 0.08,
                motor_current=14.2 if meta["type"] == "cnc" else 28.5,
                spindle_temp=42.0 if meta["type"] == "cnc" else 78.0,
                rpm=meta["base_rpm"],
                operating_status="NORMAL",
                anomaly_score=0.0,
                dryer_dew_point=-40.0 if meta["type"] == "im" else None,
            )
            for m_id, meta in self.injection_engine.machine_sim.machines_meta.items()
        ]
        return FactoryTickPacket(
            tick_index=self.tick_count,
            timestamp=datetime.now(timezone.utc).isoformat(),
            telemetry=telemetry,
            machines=telemetry,
            parts=list(self._recent_parts)[-5:] if self._recent_parts else [],
            recent_parts=list(self._recent_parts),
            edge_stats=self.edge_tracker.get_statistics(),
            active_anomaly=self.get_active_anomaly_status(),
        )

    def add_subscriber(self, q: asyncio.Queue[FactoryTickPacket]) -> None:
        """Registers a new SSE listener queue."""
        self._subscribers.add(q)

    def remove_subscriber(self, q: asyncio.Queue[FactoryTickPacket]) -> None:
        """Unregisters an SSE listener queue."""
        self._subscribers.discard(q)

    def inject(
        self,
        scenario: str = "cnc_tool_wear",
        machine_id: Optional[str] = None,
        severity: float = 1.0,
        mode: str = "demo",
    ) -> dict[str, Any]:
        """Triggers a simulated defect scenario and optionally accelerates timing."""
        if scenario == "im_damp_material" or machine_id == "IM-05":
            target = machine_id or "IM-05"
            res = self.injection_engine.inject_scenario_2_im_damp_material(
                machine_id=target, severity=severity
            )
        else:
            target = machine_id or "CNC-02"
            res = self.injection_engine.inject_scenario_1_cnc_tool_wear(
                machine_id=target, severity=severity
            )

        self.anomaly_start_time = time.monotonic()
        if mode == "fast":
            self.speed = 5.0
        else:
            self.speed = 1.0

        return {
            "status": "ok",
            "message": f"Injected scenario {scenario} into {target}",
            "details": res,
            "speed_multiplier": self.speed,
        }

    def reset(self) -> None:
        """Restores machines, conveyors, and statistics to pristine baseline."""
        self.injection_engine.reset()
        self.anomaly_start_time = None
        self.speed = 1.0
        self.edge_tracker.reset()

    async def step(self) -> FactoryTickPacket:
        """Advances simulation by one tick and broadcasts to all active SSE queues."""
        self.tick_count += 1
        telemetry = self.injection_engine.machine_sim.tick()
        parts = self.injection_engine.conveyor_sim.tick()

        for p in parts:
            self._recent_parts.append(p)
            self.edge_tracker.record_frame(p.status)

        packet = FactoryTickPacket(
            tick_index=self.tick_count,
            timestamp=datetime.now(timezone.utc).isoformat(),
            telemetry=telemetry,
            machines=telemetry,
            parts=parts,
            recent_parts=list(self._recent_parts),
            edge_stats=self.edge_tracker.get_statistics(),
            active_anomaly=self.get_active_anomaly_status(),
        )

        dead_queues = []
        for q in list(self._subscribers):
            try:
                if q.full():
                    try:
                        q.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                q.put_nowait(packet)
            except Exception:
                dead_queues.append(q)

        for dq in dead_queues:
            self._subscribers.discard(dq)

        return packet

    async def _run_loop(self) -> None:
        """Continuous async simulation clock."""
        self.running = True
        logger.info(
            "Factory simulation loop started (interval=%.2fs, speed=%.1fx)",
            self.interval_sec,
            self.speed,
        )
        try:
            while self.running:
                await self.step()
                await asyncio.sleep(self.interval)
        except asyncio.CancelledError:
            logger.info("Factory simulation loop cancelled")
        finally:
            self.running = False

    def start(self) -> None:
        """Launches the background simulation worker task."""
        if self.running and self._task and not self._task.done():
            return
        self.running = True
        try:
            loop = asyncio.get_running_loop()
            self._task = loop.create_task(self._run_loop())
        except RuntimeError:
            pass

    def stop(self) -> None:
        """Gracefully halts the simulation loop and cancels background worker."""
        self.running = False
        if self._task and not self._task.done():
            self._task.cancel()

    def get_status(self) -> FactoryStatusResponse:
        """Returns current operational status and parameters."""
        return FactoryStatusResponse(
            running=self.running,
            tick_index=self.tick_count,
            interval_sec=self.interval_sec,
            speed=self.speed,
            active_scenario=self.injection_engine.active_scenario,
            active_anomaly=self.get_active_anomaly_status(),
            edge_stats=self.edge_tracker.get_statistics(),
            machine_count=len(self.injection_engine.machine_sim.machines_meta),
            machines=list(self.injection_engine.machine_sim.machines_meta.keys()),
        )


# Global service coordinator
service = FactoryServerService()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manages background simulation worker across FastAPI application lifecycle."""
    service.start()
    yield
    service.stop()


app = FastAPI(
    title="Kaizen Factory Floor Simulator API",
    description="Standalone factory floor telemetry generator and SSE stream",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
@app.get("/healthz")
async def health() -> dict[str, str]:
    """Standard Cloud Run health probe."""
    return {"status": "healthy"}


@app.get("/api/factory/status", response_model=FactoryStatusResponse)
async def get_factory_status() -> FactoryStatusResponse:
    """Returns the current operating status and configuration of the factory."""
    return service.get_status()


@app.post("/api/factory/inject")
async def inject_anomaly(req: InjectAnomalyRequest = InjectAnomalyRequest()) -> dict[str, Any]:
    """Triggers Scenario 1 (CNC Tool Wear) or Scenario 2 (IM Damp Material)."""
    return service.inject(
        scenario=req.scenario,
        machine_id=req.machine_id,
        severity=req.severity,
        mode=req.mode,
    )


@app.post("/api/factory/reset")
async def reset_factory() -> dict[str, Any]:
    """Restores all machinery to nominal baseline."""
    service.reset()
    return {"status": "ok", "message": "Factory restored to nominal baseline"}


@app.get("/api/factory/stream")
@app.get("/api/factory/events")
async def factory_stream(request: Request) -> EventSourceResponse:
    """Server-Sent Events (SSE) broadcasting real-time factory telemetry packets."""

    async def event_generator() -> AsyncIterator[dict[str, str]]:
        q: asyncio.Queue[FactoryTickPacket] = asyncio.Queue(maxsize=30)
        service.add_subscriber(q)
        try:
            # Yield initial snapshot immediately upon connect
            initial = service.get_current_snapshot()
            yield {"event": "factory_tick", "data": initial.model_dump_json()}
            while True:
                if await request.is_disconnected():
                    break
                try:
                    packet = await asyncio.wait_for(q.get(), timeout=2.0)
                    yield {"event": "factory_tick", "data": packet.model_dump_json()}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": ""}
        finally:
            service.remove_subscriber(q)

    return EventSourceResponse(event_generator())


def main() -> None:
    """CLI runner parsing arguments and starting the uvicorn server."""
    parser = argparse.ArgumentParser(description="Kaizen Agent Factory Client API Server")
    parser.add_argument(
        "--host",
        default=os.getenv("HOST", "0.0.0.0"),
        help="Host address to bind (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("PORT", "8010")),
        help="Port number to bind (default: 8010)",
    )
    parser.add_argument(
        "--speed",
        type=float,
        default=settings.speed_multiplier,
        help="Simulation speed multiplier (default: 1.0)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Base tick interval in seconds (default: 1.0)",
    )
    args = parser.parse_args()

    service.speed = args.speed
    service.interval_sec = args.interval

    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
