"""API Routes: Simulation controls and defect injection trigger."""

import asyncio
from fastapi import APIRouter
from backend.core.blackboard import blackboard
from backend.core.models import DefectInjectionRequest
router = APIRouter(prefix="/api/simulation", tags=["simulation"])


@router.post("/inject")
async def inject_defect(req: DefectInjectionRequest = DefectInjectionRequest()):
    """Triggers defect injection and executes the 4-phase Kaizen Agent incident flow."""
    from backend.core.models import AgentFinding
    
    # 1. Phase A: Detection by Quality Inspector triggers the state machine
    blackboard.update_status(
        "detecting",
        defect_type=req.defect_type,
        defect_rate=0.077,
        verification_count=0
    )
    
    from backend.agents.sub_agent_quality_inspector import quality_inspector
    finding = await quality_inspector.run_detection(
        defect_type=req.defect_type,
        current_defect_rate=0.077,
        model_name="vision"
    )
    blackboard.add_finding(finding)
    return {
        "status": "triggered",
        "defect_type": req.defect_type,
        "target_machine": req.machine_id,
        "target_tool": req.tool_id,
        "message": "Defect burst injected: Camera station detecting rising scratches. Orchestrator workflow started."
    }


@router.post("/reset")
async def reset_simulation():
    """Resets the blackboard to normal baseline conditions."""
    state = blackboard.reset()
    return {"status": "reset", "message": "Simulation reset to normal baseline", "state": state}
