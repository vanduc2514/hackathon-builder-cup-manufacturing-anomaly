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
    
    finding = AgentFinding(
        agent_id="QA",
        agent_name="Quality Inspector",
        phase="Phase A - Detection",
        finding="Vertical scratch 2–3 mm on face A detected on conveyor station.",
        evidence="23/300 products defective (7.7% defect rate), exceeding SPC UCL of 3.0%. Started at 09:40.",
        confidence=0.96,
        citation="Gemma Edge Gateway Frame #8412 + Gemini Vision Metrology"
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
