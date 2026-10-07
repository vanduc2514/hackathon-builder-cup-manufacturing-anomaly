"""API Routes: Simulation controls and defect injection trigger."""

from fastapi import APIRouter, HTTPException

from backend.agents.orchestrator import orchestrator
from backend.core.models import DefectInjectionRequest

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


@router.post("/inject")
async def inject_defect(req: DefectInjectionRequest = DefectInjectionRequest()):
    """Triggers defect injection and starts the ADK orchestrator incident workflow."""
    if not orchestrator.start_incident(req):
        raise HTTPException(status_code=409, detail="An incident workflow is already running")
    return {
        "status": "triggered",
        "defect_type": req.defect_type,
        "target_machine": req.machine_id,
        "target_tool": req.tool_id,
        "message": "Defect injected. ADK orchestrator workflow started.",
    }


@router.post("/reset")
async def reset_simulation():
    """Cancels any running incident workflow and resets the blackboard to normal baseline."""
    state = await orchestrator.reset()
    return {"status": "reset", "message": "Simulation reset to normal baseline", "state": state}
