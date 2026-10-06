"""API Routes: Simulation controls and defect injection trigger."""

import asyncio

from fastapi import APIRouter

from backend.agents.orchestrator import orchestrator
from backend.core.blackboard import blackboard
from backend.core.models import DefectInjectionRequest

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


@router.post("/inject")
async def inject_defect(req: DefectInjectionRequest = DefectInjectionRequest()):
    """Triggers defect injection and executes the 4-phase Kaizen Agent incident flow."""
    # Launch orchestrator flow asynchronously in the background
    asyncio.create_task(orchestrator.run_incident_simulation(delay=1.0))
    return {
        "status": "triggered",
        "defect_type": req.defect_type,
        "target_machine": req.machine_id,
        "target_tool": req.tool_id,
        "message": "Defect burst injected: Camera station detecting rising scratches. Orchestrator workflow started.",
    }


@router.post("/reset")
async def reset_simulation():
    """Resets the blackboard to normal baseline conditions."""
    state = blackboard.reset()
    return {"status": "reset", "message": "Simulation reset to normal baseline", "state": state}
