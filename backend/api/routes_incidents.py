"""API Routes: Incident board state and real-time streaming."""

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

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
    """Shift leader approval endpoint to finalize 8D report and close incident."""
    state = blackboard.update_status("closed")
    return {"message": "Incident approved and officially closed by Shift Leader", "state": state}
