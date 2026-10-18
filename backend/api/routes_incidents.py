"""API Routes: Incident board state, real-time streaming, and shift-leader approval."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sse_starlette.sse import EventSourceResponse

from backend.agents.agent_technician_copilot import (
    AGENT_ID,
    AGENT_NAME,
    DIAGNOSTIC_PHASE,
    analyze_visual_evidence_frame_async,
)
from backend.agents.orchestrator import EvidenceNotAwaitedError, RepairNotAwaitedError, orchestrator
from backend.core.auth import require_user
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import (
    AgentFinding,
    AuthUser,
    HandoverNote,
    HandoverNoteRequest,
    IncidentDocumentsResponse,
    IncidentState,
    IncidentSummary,
    PresetEvidenceRequest,
    VisualEvidencePayload,
    VisualEvidencePreset,
)
from backend.tools.document_export import documents_response
from backend.tools.gemini_vision_tool import (
    SCRIPTED_CONFIDENCE,
    analyze_visual_evidence_frame,
    guarded_insert_inspection,
    guarded_part_inspection,
    payload_confidence,
)
from backend.tools.preset_catalog import get_preset, load_preset_image

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

INSERT_ROLES = ("tool_worn", "tool_new", "reference")
PART_ROLES = ("qa_defect", "streak_good")


def _analyse_preset(
    preset: VisualEvidencePreset, machine_id: str, tool_id: str, defect_type: Optional[str]
) -> tuple[VisualEvidencePayload, str]:
    """Runs Gemini Vision on a preset image (blocking); returns the payload and display summary."""
    image = load_preset_image(preset)
    base: dict[str, Any] = {
        "preset_id": preset.id,
        "image_url": preset.image_url,
        "filename": preset.image_file,
        "size_bytes": len(image),
    }

    if preset.role in INSERT_ROLES or preset.role in PART_ROLES:
        guard = guarded_insert_inspection if preset.role in INSERT_ROLES else guarded_part_inspection
        guarded = guard(image, expected=preset.expected_class, machine_id=machine_id, tool_id=tool_id)
        result = guarded.insert or guarded.part
        assert result is not None
        if guarded.insert is not None:
            defect = guarded.insert.replace_insert
        else:
            defect = guarded.part.defect_class != "none"  # type: ignore[union-attr]
        if guarded.source == "gemini":
            citation = f"Gemini Vision ({guarded.model}) analysis of benchmark preset {preset.id}"
        else:
            citation = f"Scripted expectation for preset {preset.id} ({guarded.source})"
        return (
            VisualEvidencePayload(
                **base,
                analysis=guarded.summary,
                defect_detected=defect,
                wear_measurement_mm=preset.expected_wear_mm,
                citation=citation,
                source=guarded.source,
                confidence=result.confidence,
            ),
            guarded.summary,
        )

    # Free-form role (IM-05): real Gemini analysis, DEMO_SCRIPTED pins defect_detected.
    payload = analyze_visual_evidence_frame(
        image_bytes=image,
        machine_id=machine_id,
        tool_id=tool_id,
        filename=preset.image_file,
        defect_type=defect_type,
    )
    payload = payload.model_copy(update=base)
    mismatch = settings.demo_scripted and payload.defect_detected != preset.expected_defect_detected
    if payload.source == "mock" or mismatch:
        if mismatch:
            payload.source = "fallback"
        payload = payload.model_copy(
            update={
                "analysis": preset.analysis,
                "defect_detected": preset.expected_defect_detected,
                "wear_measurement_mm": preset.expected_wear_mm,
                "confidence": SCRIPTED_CONFIDENCE,
                "citation": f"Scripted expectation for preset {preset.id} ({payload.source})",
            }
        )
    return payload, payload.analysis


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
async def approve_incident(current_user: AuthUser = Depends(require_user)) -> Dict[str, Any]:
    """Shift-leader approval input, handed to the Orchestrator (learning-complete incidents only)."""
    approver = current_user.username
    state = orchestrator.approve(approver=approver)
    if state is None:
        raise HTTPException(status_code=409, detail="No incident awaiting approval")
    return {
        "message": f"Incident approved by {approver}",
        "state": state,
    }

@router.get("/documents", response_model=IncidentDocumentsResponse)
async def get_incident_documents() -> IncidentDocumentsResponse:
    """Returns the exported Markdown documents (URIs + console link) for the current incident (#333)."""
    return documents_response(blackboard.get_state())


@router.post("/repair-done")
async def confirm_repair_done() -> Dict[str, Any]:
    """Technician 'Repair done' input, handed to the Orchestrator (releases verification)."""
    try:
        state = orchestrator.confirm_repair()
    except RepairNotAwaitedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"message": "Repair confirmed; verification starting", "state": state}


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
        confidence=payload_confidence(ev_payload),
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

    machine_id = cur_st.suspect_machine or preset.machine_id
    tool_id = cur_st.suspect_tool or preset.tool_id
    try:
        ev_payload, summary = await asyncio.to_thread(
            _analyse_preset, preset, machine_id, tool_id, cur_st.defect_type
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500, detail=f"Preset image missing for {preset.id}"
        ) from exc

    if ev_payload.defect_detected:
        finding_text = (
            f"Frontline technician selected preset {preset.id} "
            f"confirming defect on {machine_id}: {preset.title}."
        )
    else:
        finding_text = (
            f"Frontline technician selected preset {preset.id} "
            f"confirming nominal condition on {machine_id}: {preset.title}."
        )

    evidence_text = summary
    if ev_payload.source != "gemini":
        evidence_text += " (scripted expectation)"
    if request.notes:
        evidence_text += f" Ghi chú: {request.notes}"

    finding = AgentFinding(
        agent_id=AGENT_ID,
        agent_name=AGENT_NAME,
        phase=DIAGNOSTIC_PHASE,
        finding=finding_text,
        evidence=evidence_text,
        confidence=payload_confidence(ev_payload),
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
