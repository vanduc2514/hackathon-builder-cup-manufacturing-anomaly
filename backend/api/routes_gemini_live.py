"""API Route: Technician Copilot WebSocket streaming real Gemini replies the mobile browser speaks aloud."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import ValidationError
from starlette.websockets import WebSocketState

from backend.agents.agent_technician_copilot import (
    AGENT_ID,
    AGENT_NAME,
    COPILOT_LANGUAGE,
    DIAGNOSTIC_PHASE,
    analyze_visual_evidence_frame_async,
    stream_copilot_reply,
)
from backend.agents.orchestrator import EvidenceNotAwaitedError, orchestrator
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import (
    AgentFinding,
    CopilotTurnRequest,
    GeminiLiveServerMessage,
    GeminiLiveSessionStatus,
)
from backend.tools.gemini_vision_tool import (
    get_gemini_client,
    is_gemini_vision_available,
    payload_confidence,
)
from backend.tools.preset_catalog import get_preset, load_preset_image

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gemini-live", tags=["Technician Copilot"])

OFFLINE_MESSAGE = "Copilot offline: Gemini is not configured on this backend."
REQUEST_FAILED_MESSAGE = "Copilot could not reach Gemini. Try again in a moment."
# Technician turn sent with a raw camera frame (the frame itself is the content).
FRAME_TURN_TEXT = "I just sent a photo from my phone camera. What does it show?"
PHOTO_HISTORY_NOTE = "[Technician attached a photo]"


class SessionState:
    """Tracks the chat history and the in-flight reply of one Copilot WebSocket session."""

    def __init__(self, session_id: str) -> None:
        self.session_id: str = session_id
        self.resumption_handle: str = f"resume-{session_id}-{uuid.uuid4().hex[:8]}"
        self.client_messages_received: int = 0
        self.server_messages_sent: int = 0
        self.created_at: str = datetime.now().strftime("%H:%M:%S")
        self.last_active_at: str = datetime.now().strftime("%H:%M:%S")
        # (role, text) pairs, role "user" or "model", oldest first.
        self.history: List[tuple[str, str]] = []
        self.active_generation_task: Optional[asyncio.Task[None]] = None

    def record_activity(self) -> None:
        self.last_active_at = datetime.now().strftime("%H:%M:%S")

    def to_status(self) -> GeminiLiveSessionStatus:
        return GeminiLiveSessionStatus(
            session_id=self.session_id,
            status="active",
            client_messages_received=self.client_messages_received,
            server_messages_sent=self.server_messages_sent,
            created_at=self.created_at,
            last_active_at=self.last_active_at,
        )


class SessionManager:
    """Manages active and resumable Copilot sessions."""

    def __init__(self) -> None:
        self._sessions: Dict[str, SessionState] = {}
        self._resumption_index: Dict[str, str] = {}  # resumption_handle -> session_id

    def get_or_create(
        self,
        session_id: Optional[str] = None,
        resumption_handle: Optional[str] = None,
    ) -> SessionState:
        if resumption_handle and resumption_handle in self._resumption_index:
            existing_id = self._resumption_index[resumption_handle]
            if existing_id in self._sessions:
                session = self._sessions[existing_id]
                session.record_activity()
                logger.info(
                    "Resumed existing session %s via handle %s", existing_id, resumption_handle
                )
                return session

        if session_id and session_id in self._sessions:
            session = self._sessions[session_id]
            session.record_activity()
            return session

        target_id = session_id or f"live-sess-{uuid.uuid4().hex[:8]}"
        session = SessionState(session_id=target_id)
        self._sessions[target_id] = session
        self._resumption_index[session.resumption_handle] = target_id
        logger.info("Created new Copilot session %s", target_id)
        return session

    def remove(self, session_id: str) -> None:
        if session_id in self._sessions:
            session = self._sessions.pop(session_id)
            self._resumption_index.pop(session.resumption_handle, None)
            if session.active_generation_task and not session.active_generation_task.done():
                session.active_generation_task.cancel()
            logger.info("Removed Copilot session %s", session_id)

    def list_sessions(self) -> List[GeminiLiveSessionStatus]:
        return [s.to_status() for s in self._sessions.values()]

    def count(self) -> int:
        return len(self._sessions)


manager = SessionManager()


@router.get("/status")
async def get_live_status() -> Dict[str, Any]:
    """Returns the operational status of the Technician Copilot service."""
    return {
        "status": "healthy",
        "service": "Technician Copilot (Gemini streaming)",
        "copilot_available": is_gemini_vision_available(),
        "active_sessions": manager.count(),
        "model": settings.gemini_model,
        "language": COPILOT_LANGUAGE,
        "timestamp": datetime.now().strftime("%H:%M:%S"),
    }


@router.get("/sessions", response_model=List[GeminiLiveSessionStatus])
async def list_active_sessions() -> List[GeminiLiveSessionStatus]:
    """Lists all active and resumable Copilot sessions."""
    return manager.list_sessions()


@router.post("/session", response_model=GeminiLiveSessionStatus)
async def create_session() -> GeminiLiveSessionStatus:
    """Pre-allocates a Copilot session."""
    return manager.get_or_create().to_status()


async def send_server_message(
    websocket: WebSocket, session: SessionState, msg: GeminiLiveServerMessage
) -> None:
    """Helper to safely dispatch a GeminiLiveServerMessage to client over WebSocket."""
    if websocket.client_state == WebSocketState.CONNECTED:
        session.server_messages_sent += 1
        session.record_activity()
        await websocket.send_text(json.dumps(msg.model_dump()))


async def send_error(websocket: WebSocket, session: SessionState, message: str) -> None:
    await send_server_message(
        websocket,
        session,
        GeminiLiveServerMessage(type="error", session_id=session.session_id, error_message=message),
    )


async def run_copilot_turn(
    websocket: WebSocket,
    session: SessionState,
    user_text: str,
    image_bytes: Optional[bytes] = None,
) -> None:
    """One technician turn: stream the Gemini reply as `text_delta` messages, then `turn_complete`.

    Cancelling the task (interrupt or a newer turn) ends the turn with `interrupted=True`. A
    reply that is cut off is still kept in the chat history.
    """
    if not is_gemini_vision_available():
        await send_server_message(
            websocket,
            session,
            GeminiLiveServerMessage(
                type="offline", session_id=session.session_id, error_message=OFFLINE_MESSAGE
            ),
        )
        return

    reply: List[str] = []
    interrupted = False
    try:
        async for delta in stream_copilot_reply(
            state=blackboard.get_state(),
            user_text=user_text,
            history=list(session.history),
            image_bytes=image_bytes,
            client=get_gemini_client(),
        ):
            reply.append(delta)
            await send_server_message(
                websocket,
                session,
                GeminiLiveServerMessage(
                    type="text_delta", session_id=session.session_id, text=delta
                ),
            )
    except asyncio.CancelledError:
        interrupted = True
        raise
    except Exception as exc:
        logger.error("Copilot Gemini turn failed: %s", exc, exc_info=True)
        await send_error(websocket, session, REQUEST_FAILED_MESSAGE)
        return
    finally:
        text = "".join(reply)
        if text:
            history_user = f"{user_text} {PHOTO_HISTORY_NOTE}" if image_bytes else user_text
            session.history.append(("user", history_user))
            session.history.append(("model", text))
        if interrupted:
            await send_server_message(
                websocket,
                session,
                GeminiLiveServerMessage(
                    type="turn_complete", session_id=session.session_id, interrupted=True
                ),
            )

    await send_server_message(
        websocket,
        session,
        GeminiLiveServerMessage(
            type="turn_complete", session_id=session.session_id, model=settings.gemini_model
        ),
    )


async def cancel_generation(session: SessionState) -> None:
    """Cancels the in-flight reply (if any) and waits until it has wound down."""
    task = session.active_generation_task
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


async def start_turn(
    websocket: WebSocket,
    session: SessionState,
    user_text: str,
    image_bytes: Optional[bytes] = None,
) -> None:
    """Replaces any in-flight reply with a new Gemini turn running in the background."""
    await cancel_generation(session)
    session.active_generation_task = asyncio.create_task(
        run_copilot_turn(websocket, session, user_text, image_bytes)
    )


async def ingest_evidence_frame(image_bytes: bytes, filename: str) -> Optional[str]:
    """Attaches a camera frame as field evidence via the Orchestrator; returns an error message."""
    cur_st = blackboard.get_state()
    ev_payload = await analyze_visual_evidence_frame_async(
        image_bytes=image_bytes,
        machine_id=cur_st.suspect_machine or "CNC-02",
        tool_id=cur_st.suspect_tool,
        filename=filename,
    )
    finding = AgentFinding(
        agent_id=AGENT_ID,
        agent_name=AGENT_NAME,
        phase=DIAGNOSTIC_PHASE,
        finding=f"Frontline technician camera frame confirms defect root cause on {cur_st.suspect_machine or 'CNC-02'}.",
        evidence=ev_payload.analysis,
        confidence=payload_confidence(ev_payload),
        citation=ev_payload.citation,
    )
    try:
        orchestrator.attach_evidence(finding, ev_payload)
    except EvidenceNotAwaitedError as exc:
        return str(exc)
    return None


def _is_image(raw_bytes: bytes) -> bool:
    return (
        raw_bytes.startswith(b"\xff\xd8\xff")
        or raw_bytes.startswith(b"\x89PNG")
        or b"WEBP" in raw_bytes[:16]
    )


async def handle_user_turn(
    websocket: WebSocket, session: SessionState, payload: Dict[str, Any]
) -> None:
    """Validates a `user_turn` message, resolves its preset photo and starts the Gemini turn."""
    try:
        turn = CopilotTurnRequest.model_validate(payload)
    except ValidationError:
        await send_error(websocket, session, "Invalid user_turn: text is required.")
        return

    image_bytes: Optional[bytes] = None
    if turn.preset_id:
        preset = get_preset(turn.preset_id)
        if preset is None or not preset.image_file:
            await send_error(websocket, session, f"Unknown preset photo: {turn.preset_id}")
            return
        image_bytes = await asyncio.to_thread(load_preset_image, preset)

    await start_turn(websocket, session, turn.text, image_bytes)


@router.websocket("/ws")
async def gemini_live_websocket(
    websocket: WebSocket,
    session_id: Optional[str] = None,
    resumption_handle: Optional[str] = None,
) -> None:
    """Technician Copilot socket: JSON `user_turn` in, streamed `text_delta` / `turn_complete` out."""
    await websocket.accept()

    session = manager.get_or_create(session_id=session_id, resumption_handle=resumption_handle)
    logger.info("Client connected to Copilot WebSocket (session=%s)", session.session_id)

    await send_server_message(
        websocket,
        session,
        GeminiLiveServerMessage(
            type="setup_complete",
            session_id=session.session_id,
            resumption_handle=session.resumption_handle,
        ),
    )

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            session.client_messages_received += 1
            session.record_activity()

            # Binary frame: a raw camera image, attached as field evidence and shown to Gemini.
            if message.get("bytes"):
                raw_bytes = message["bytes"]
                if not _is_image(raw_bytes):
                    await send_error(websocket, session, "Unsupported binary frame: send a JPEG, PNG or WEBP image.")
                    continue
                evidence_error = await ingest_evidence_frame(raw_bytes, "mobile_camera_frame.jpg")
                if evidence_error is not None:
                    await send_error(websocket, session, evidence_error)
                    continue
                await start_turn(websocket, session, FRAME_TURN_TEXT, raw_bytes)
                continue

            if not message.get("text"):
                continue

            try:
                payload = json.loads(message["text"])
            except Exception as exc:
                await send_error(websocket, session, f"Invalid JSON format: {exc}")
                continue
            if not isinstance(payload, dict):
                await send_error(websocket, session, "Invalid message: expected a JSON object.")
                continue

            msg_type = payload.get("type")
            if msg_type == "interrupt":
                was_streaming = (
                    session.active_generation_task is not None
                    and not session.active_generation_task.done()
                )
                await cancel_generation(session)
                if not was_streaming:
                    # Nothing to cut: still acknowledge so the client can unlock its controls.
                    await send_server_message(
                        websocket,
                        session,
                        GeminiLiveServerMessage(
                            type="turn_complete", session_id=session.session_id, interrupted=True
                        ),
                    )
            elif msg_type == "setup":
                await send_server_message(
                    websocket,
                    session,
                    GeminiLiveServerMessage(
                        type="setup_complete",
                        session_id=session.session_id,
                        resumption_handle=session.resumption_handle,
                    ),
                )
            elif msg_type == "ping":
                await send_server_message(
                    websocket, session, GeminiLiveServerMessage(type="pong", session_id=session.session_id)
                )
            elif msg_type == "user_turn":
                await handle_user_turn(websocket, session, payload)
            elif payload.get("realtime_input"):
                chunks = payload["realtime_input"].get("media_chunks", [])
                image_chunk = next((c for c in chunks if "image" in c.get("mime_type", "")), None)
                if image_chunk is None:
                    await send_error(websocket, session, "Unsupported realtime_input: no image chunk.")
                    continue
                try:
                    img_bytes = base64.b64decode(image_chunk.get("data", ""))
                except Exception:
                    await send_error(websocket, session, "Invalid base64 image data.")
                    continue
                evidence_error = await ingest_evidence_frame(img_bytes, "realtime_frame.jpg")
                if evidence_error is not None:
                    await send_error(websocket, session, evidence_error)
                    continue
                await start_turn(websocket, session, FRAME_TURN_TEXT, img_bytes)
            else:
                await send_error(websocket, session, "Unsupported message: send a user_turn.")

    except WebSocketDisconnect:
        logger.info("Copilot WebSocket client disconnected (session=%s)", session.session_id)
    except Exception as exc:
        logger.error("Unhandled error in Copilot WebSocket: %s", exc, exc_info=True)
    finally:
        if session.active_generation_task and not session.active_generation_task.done():
            session.active_generation_task.cancel()
        # Keep session in manager for resumption window unless closed


@router.post("/evidence")
async def upload_gemini_live_evidence(
    file: UploadFile = File(...),
    notes: Optional[str] = Form(None),
) -> Dict[str, Any]:
    """Ingests a visual evidence photo from the technician's mobile device."""
    image_bytes = await file.read()
    cur_st = blackboard.get_state()
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
        evidence=ev_payload.analysis + (f" Technician note: {notes}" if notes else ""),
        confidence=payload_confidence(ev_payload),
        citation=ev_payload.citation,
    )
    try:
        new_state = orchestrator.attach_evidence(finding, ev_payload)
    except EvidenceNotAwaitedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {
        "status": "success",
        "evidence": ev_payload.model_dump(),
        "finding": finding.model_dump(),
        "incident_status": new_state.status,
    }
