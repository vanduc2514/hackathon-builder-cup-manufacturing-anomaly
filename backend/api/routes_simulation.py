"""API Routes: Simulation controls and defect injection trigger."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict

from fastapi import APIRouter

from backend.agents.orchestrator import orchestrator
from backend.core.blackboard import blackboard
from backend.core.models import DefectInjectionRequest, SimulationStatusResponse
from backend.tools.bigquery_tool import reset_buffers
from simulator.injection_engine import injection_engine

router = APIRouter(prefix="/api/simulation", tags=["simulation"])

_active_task: asyncio.Task | None = None


@router.post("/inject")
async def inject_defect(req: DefectInjectionRequest = DefectInjectionRequest()) -> Dict[str, Any]:
    """Triggers defect injection and executes the 4-phase Kaizen Agent incident flow."""
    global _active_task

    # 1. Stop any currently running simulation task
    if _active_task and not _active_task.done():
        _active_task.cancel()
        _active_task = None
    orchestrator.stop_simulation()

    # 2. Trigger deterministic anomaly injection in simulator engine
    scenario = req.scenario or "cnc_tool_wear"
    if scenario == "im_damp_material":
        target_machine = req.machine_id if req.machine_id != "CNC-02" else "IM-05"
        target_tool = req.tool_id if req.tool_id != "T07" else "MOLD-03"
        burst = injection_engine.inject_scenario_2_im_damp_material(
            machine_id=target_machine,
            tool_id=target_tool,
        )
        message = (
            f"Scenario 2 defect burst injected: IM-05 mold cavity #3 short fill & sink marks. "
            f"Dryer dew point rising to -18°C. Mode={req.mode}."
        )
    else:
        target_machine = req.machine_id or "CNC-02"
        target_tool = req.tool_id or "T07"
        burst = injection_engine.inject_scenario_1_cnc_tool_wear(
            machine_id=target_machine,
            tool_id=target_tool,
        )
        message = (
            f"Scenario 1 defect burst injected: CNC-02/T07 spindle vibration spike (+35%) and vertical scratches. "
            f"Defect rate surging to 7.7% (exceeding UCL). Mode={req.mode}."
        )

    # 3. Launch orchestrator flow asynchronously in the background
    _active_task = asyncio.create_task(orchestrator.run_incident_simulation(req=req))

    return {
        "status": "triggered",
        "scenario": scenario,
        "mode": req.mode,
        "duration_seconds": orchestrator.total_duration,
        "target_machine": target_machine,
        "target_tool": target_tool,
        "burst_telemetry": burst,
        "message": message,
    }


@router.post("/reset")
async def reset_simulation() -> Dict[str, Any]:
    """Resets the blackboard, simulator machinery, and BigQuery buffers to normal pristine conditions."""
    global _active_task

    # 1. Cancel active simulation background task
    if _active_task and not _active_task.done():
        _active_task.cancel()
        _active_task = None
    orchestrator.stop_simulation()

    # 2. Reset Blackboard shared state
    state = blackboard.reset()

    # 3. Reset Simulator machine telemetry and conveyor belts
    injection_engine.reset()

    # 4. Reset BigQuery mock data and buffers
    bq_reset = reset_buffers()

    return {
        "status": "reset",
        "message": "Simulation reset to pristine baseline (Blackboard, Simulator, and BigQuery buffers restored)",
        "state": state,
        "bigquery": bq_reset,
    }


@router.get("/status", response_model=SimulationStatusResponse)
async def get_simulation_status() -> SimulationStatusResponse:
    """Returns current active simulation scenario, execution status, and elapsed time."""
    elapsed = None
    if orchestrator.is_running and orchestrator.start_time:
        elapsed = round(time.time() - orchestrator.start_time, 2)

    return SimulationStatusResponse(
        status="running" if orchestrator.is_running else "idle",
        active_scenario=orchestrator.current_scenario,
        mode=orchestrator.current_mode,
        target_machine=orchestrator.target_machine,
        target_tool=orchestrator.target_tool,
        elapsed_seconds=elapsed,
        total_seconds=orchestrator.total_duration,
    )
