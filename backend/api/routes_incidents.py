"""API Routes: Incident board state, real-time streaming, and shift-leader approval."""

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from backend.agents.orchestrator import orchestrator
from backend.core.blackboard import blackboard
from backend.core.models import IncidentState

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("/current", response_model=IncidentState)
async def get_current_incident():
    """Returns the current snapshot of the incident blackboard."""
    return blackboard.get_state()


@router.get("/events")
async def incident_events():
    """Server-Sent Events (SSE) stream of blackboard updates in real time."""

    async def event_generator():
        async for state_json in blackboard.subscribe():
            yield {"event": "incident_update", "data": state_json}

    return EventSourceResponse(event_generator())


@router.post("/approve")
async def approve_incident():
    """Shift-leader approval input, handed to the Orchestrator (closed incidents only)."""
    state = orchestrator.approve()
    if state is None:
        raise HTTPException(status_code=409, detail="No closed incident awaiting approval")
    return {"message": "Incident approved by Shift Leader", "state": state}
