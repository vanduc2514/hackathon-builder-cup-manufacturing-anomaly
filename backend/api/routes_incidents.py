"""API Routes: Incident board state, real-time streaming, and shift-leader approval."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sse_starlette.sse import EventSourceResponse

from backend.agents.agent_technician_copilot import (
    AGENT_ID,
    AGENT_NAME,
    DIAGNOSTIC_PHASE,
    analyze_visual_evidence_frame_async,
)
from backend.agents.orchestrator import EvidenceNotAwaitedError, orchestrator
from backend.core.auth import require_user
from backend.core.blackboard import blackboard
from backend.core.models import (
    AgentFinding,
    AuthUser,
    HandoverNote,
    HandoverNoteRequest,
    IncidentState,
    IncidentSummary,
    PresetEvidenceRequest,
    VisualEvidencePayload,
)
from backend.tools.preset_catalog import get_preset

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("", response_model=IncidentState)
@router.get("/", response_model=IncidentState)
@router.get("/current", response_model=IncidentState)
async def get_current_incident():
    """Returns the current snapshot of the incident blackboard."""
    return blackboard.get_state()


@router.get("/history", response_model=List[IncidentSummary])
async def get_incident_history(
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
) -> List[IncidentSummary]:
    """Returns past incident history records from Firestore or local fallback."""
    incidents = blackboard.list_incidents(limit=limit, status=status)
    return [IncidentSummary.from_incident(inc) for inc in incidents]


@router.get("/events")
@router.get("/stream")
async def incident_events(request: Request):
    """Server-Sent Events (SSE) stream of blackboard updates in real time."""

    async def event_generator():
        async for state_json in blackboard.subscribe():
            if await request.is_disconnected():
                break
            yield {"event": "incident_update", "data": state_json}

    return EventSourceResponse(event_generator(), ping=10, send_timeout=5.0)


@router.post("/approve")
async def approve_incident():
    """Shift-leader approval input, handed to the Orchestrator (closed incidents only)."""
    state = orchestrator.approve()
    if state is None:
        raise HTTPException(status_code=409, detail="No closed incident awaiting approval")
    return {"message": "Incident approved by Shift Leader", "state": state}


@router.post("/evidence")
async def upload_incident_evidence(
    file: UploadFile = File(...),
    notes: Optional[str] = Form(None),
) -> Dict[str, Any]:
    """Uploads technician visual evidence for low-confidence RCA verification."""
    cur_st = blackboard.get_state()
    if cur_st.status != "awaiting_evidence":
        raise HTTPException(
            status_code=409,
            detail="The AI is not waiting for evidence right now",
        )
    image_bytes = await file.read()
    ev_payload = await analyze_visual_evidence_frame_async(
        image_bytes=image_bytes,
        machine_id=cur_st.suspect_machine or "CNC-02",
        tool_id=cur_st.suspect_tool,
        filename=file.filename or "evidence.jpg",
    )
    finding = AgentFinding(
        agent_id=AGENT_ID,
        agent_name=AGENT_NAME,
        phase=DIAGNOSTIC_PHASE,
        finding=f"Frontline technician submitted close-up photo confirming defect root cause on {cur_st.suspect_machine or 'CNC-02'}.",
        evidence=ev_payload.analysis + (f" Ghi chú: {notes}" if notes else ""),
        confidence=0.92,
        citation=ev_payload.citation,
    )
    try:
        new_state = orchestrator.attach_evidence(finding, ev_payload)
    except EvidenceNotAwaitedError as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from exc
    return {
        "status": "success",
        "evidence": ev_payload.model_dump(),
        "finding": finding.model_dump(),
        "incident_status": new_state.status,
    }


@router.post("/evidence/preset")
async def attach_preset_evidence(
    request: PresetEvidenceRequest,
) -> Dict[str, Any]:
    """Attaches a curated benchmark visual evidence preset to the active incident."""
    preset = get_preset(request.preset_id)
    if preset is None:
        raise HTTPException(
            status_code=404,
            detail=f"Preset evidence not found: {request.preset_id}",
        )

    cur_st = blackboard.get_state()
    if cur_st.status != "awaiting_evidence":
        raise HTTPException(
            status_code=409,
            detail="The AI is not waiting for evidence right now",
        )

    ev_payload = VisualEvidencePayload(
        preset_id=preset.id,
        image_url=preset.image_url,
        analysis=preset.analysis,
        defect_detected=preset.expected_defect_detected,
        wear_measurement_mm=preset.expected_wear_mm,
        citation=f"Benchmark preset {preset.id} (curated ground truth)",
    )

    if preset.expected_defect_detected:
        finding_text = (
            f"Frontline technician selected benchmark preset {preset.id} "
            f"confirming defect on {cur_st.suspect_machine or 'CNC-02'}: {preset.title}."
        )
    else:
        finding_text = (
            f"Frontline technician selected benchmark preset {preset.id} "
            f"confirming nominal condition on {cur_st.suspect_machine or 'CNC-02'}: {preset.title}."
        )

    evidence_text = preset.analysis
    if request.notes:
        evidence_text += f" Ghi chú: {request.notes}"

    finding = AgentFinding(
        agent_id=AGENT_ID,
        agent_name=AGENT_NAME,
        phase=DIAGNOSTIC_PHASE,
        finding=finding_text,
        evidence=evidence_text,
        confidence=0.92,
        citation=ev_payload.citation,
    )

    try:
        new_state = orchestrator.attach_evidence(finding, ev_payload)
    except EvidenceNotAwaitedError as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from exc
    return {
        "status": "success",
        "evidence": ev_payload.model_dump(),
        "finding": finding.model_dump(),
        "incident_status": new_state.status,
    }


@router.post("/handover", response_model=HandoverNote)
async def create_handover_note(
    request: HandoverNoteRequest,
    current_user: AuthUser = Depends(require_user),
) -> HandoverNote:
    """Records a technician shift handover note on the active incident via Orchestrator."""
    author = current_user.display_name or current_user.username or "Frontline Technician"
    return orchestrator.add_handover_note(author=author, note=request.note)
