"""API Route: WebSocket proxy handling real-time audio and video streaming with Gemini Live API."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import math
import struct
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, Query, UploadFile, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from backend.agents.agent_technician_copilot import (
    AGENT_ID,
    AGENT_NAME,
    DIAGNOSTIC_PHASE,
    analyze_visual_evidence_frame_async,
    build_contextual_diagnostic_probe_vi,
)
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import (
    AgentFinding,
    GeminiLiveServerContent,
    GeminiLiveServerMessage,
    GeminiLiveSessionStatus,
)
from backend.tools.gemini_vision_tool import (
    get_gemini_client,
    is_gemini_vision_available,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gemini-live", tags=["Gemini Live Copilot"])


def generate_synthetic_pcm_chunks(
    frequency: float = 440.0,
    duration_seconds: float = 0.3,
    chunk_seconds: float = 0.1,
    sample_rate: int = 24000,
) -> List[bytes]:
    """Generates synthetic 16-bit mono PCM audio chunks at 24kHz for speech simulation."""
    chunks: List[bytes] = []
    chunk_samples = int(sample_rate * chunk_seconds)
    total_samples = int(sample_rate * duration_seconds)

    current_sample = 0
    while current_sample < total_samples:
        samples_in_this_chunk = min(chunk_samples, total_samples - current_sample)
        buf = bytearray()
        for i in range(samples_in_this_chunk):
            t = (current_sample + i) / sample_rate
            # 16-bit signed integer amplitude (-32768 to 32767), soft 0.3 volume
            sample_val = int(9800 * math.sin(2.0 * math.pi * frequency * t))
            buf.extend(struct.pack("<h", sample_val))
        chunks.append(bytes(buf))
        current_sample += samples_in_this_chunk

    return chunks


def generate_grounded_response(user_text: str) -> Dict[str, str]:
    """Generates domain-grounded Vietnamese technician guidance matching factory telemetry."""
    query = user_text.lower().strip()
    state = blackboard.get_state()

    # Diagnostic Feedback Loop: If incident is awaiting field evidence, Copilot verbalizes the probe
    if (state.status == "awaiting_evidence" or state.diagnostic_request) and any(
        k in query for k in ["bị gì", "sao thế", "làm gì", "kiểm tra", "yêu cầu", "sửa"]
    ):
        probe = state.diagnostic_request or build_contextual_diagnostic_probe_vi(
            confidence=0.65,
            machine_id=state.suspect_machine or "CNC-02",
            tool_id=state.suspect_tool,
            defect_type=state.defect_type,
        )
        return {
            "transcription": probe,
            "freq": "480",
        }

    if any(k in query for k in ["đồng hồ so", "độ đảo", "0.008", "rà gá"]):
        return {
            "transcription": (
                "Độ đảo dao đo được là 0.008 mm, hoàn toàn đạt chuẩn cho phép (<0.01 mm). "
                "Bây giờ anh hãy khởi động chạy thử, hệ thống kiểm định chất lượng sẽ tự động gác cổng "
                "theo dõi 50 sản phẩm liên tiếp đạt chuẩn trên băng chuyền để xác nhận đóng sự cố."
            ),
            "freq": "520",
        }
    elif any(k in query for k in ["ảnh", "hình", "camera", "chụp"]):
        return {
            "transcription": (
                "Đã nhận hình ảnh trực tiếp từ camera trạm CNC-02. Nhận diện mảnh dao T07 mẻ mép cắt 0.4mm, "
                "khớp với tọa độ vết xước dọc trên phôi nhôm AL-5083."
            ),
            "freq": "440",
        }
    elif any(k in query for k in ["bị gì", "sao thế", "sửa", "cnc-02", "dao", "t07"]):
        return {
            "transcription": (
                "Chào anh, máy CNC-02 đang phát hiện rung động 0.22 mm/s (+35%) do dao T07 mòn "
                "vượt hạn mức 2.000 chi tiết. Tỷ lệ xước mặt A tăng lên 4.2% (vượt UCL 3.0%). "
                "Anh vui lòng dừng máy, tháo nắp bảo vệ bên trái, thay insert mới theo SOP trang 112 "
                "và dùng đồng hồ so kiểm tra độ đảo dao nhé."
            ),
            "freq": "480",
        }
    else:
        return {
            "transcription": (
                "Technician Copilot sẵn sàng hỗ trợ. Tôi đang theo dõi dữ liệu cảm biến thời gian thực "
                "từ trạm CNC và camera kiểm định trên dây chuyền #1."
            ),
            "freq": "440",
        }


class SessionState:
    """Tracks state and buffering for an active Gemini Live WebSocket connection."""

    def __init__(self, session_id: str, mode: str = "simulation") -> None:
        self.session_id: str = session_id
        self.mode: str = mode
        self.resumption_handle: str = f"resume-{session_id}-{uuid.uuid4().hex[:8]}"
        self.client_index: int = 1
        self.client_messages_received: int = 0
        self.server_messages_sent: int = 0
        self.created_at: str = datetime.now().strftime("%H:%M:%S")
        self.last_active_at: str = datetime.now().strftime("%H:%M:%S")
        self.message_buffer: Dict[int, Any] = {}
        self.active_generation_task: Optional[asyncio.Task[None]] = None

    def record_activity(self) -> None:
        self.last_active_at = datetime.now().strftime("%H:%M:%S")

    def to_status(self) -> GeminiLiveSessionStatus:
        return GeminiLiveSessionStatus(
            session_id=self.session_id,
            status="simulated" if self.mode == "simulation" else "active",
            mode=self.mode,
            client_messages_received=self.client_messages_received,
            server_messages_sent=self.server_messages_sent,
            created_at=self.created_at,
            last_active_at=self.last_active_at,
        )


LIVE_COPILOT_SYSTEM_INSTRUCTION = (
    "You are Technician Copilot, an expert manufacturing assistant for factory technicians in Vietnam. "
    "Respond in clear, natural Vietnamese. Keep guidance concise (2-4 sentences max), safety-focused, "
    "and grounded in equipment SOPs and telemetry. Ground your advice in the active incident context."
)


async def generate_live_guidance_async(user_text: str, session: SessionState) -> Dict[str, str]:
    """Generates guidance for technician. In live mode with Gemini credentials, queries Gemini Live model."""
    if session.mode == "live" and not settings.gemini_live_simulation_mode and is_gemini_vision_available():
        try:
            from google.genai import types

            client = get_gemini_client()
            state = blackboard.get_state()
            prompt = (
                f"Frontline technician query: {user_text}\n"
                f"Active Incident Context:\n"
                f"- Machine: {state.suspect_machine or 'CNC-02'}\n"
                f"- Tool: {state.suspect_tool or 'T07'}\n"
                f"- Defect: {state.defect_type or 'surface_scratches'}\n"
                f"- Incident Status: {state.status}\n"
                f"- Diagnostic Request: {state.diagnostic_request or 'None'}\n"
                f"Provide concise, immediate repair/diagnostic instructions in Vietnamese."
            )
            resp = await asyncio.to_thread(
                client.models.generate_content,
                model=settings.gemini_live_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=LIVE_COPILOT_SYSTEM_INSTRUCTION,
                    temperature=0.2,
                    max_output_tokens=512,
                ),
            )
            if resp and resp.text:
                return {
                    "transcription": resp.text.strip(),
                    "freq": "480",
                }
        except Exception as exc:
            logger.warning(
                "Gemini Live model invocation failed, falling back to grounded domain response: %s",
                exc,
            )

    return generate_grounded_response(user_text)


class SessionManager:
    """Manages active and resumable Gemini Live sessions."""

    def __init__(self) -> None:
        self._sessions: Dict[str, SessionState] = {}
        self._resumption_index: Dict[str, str] = {}  # resumption_handle -> session_id

    def get_or_create(
        self,
        session_id: Optional[str] = None,
        resumption_handle: Optional[str] = None,
        mode: Optional[str] = None,
    ) -> SessionState:
        # Check resumption handle first
        if resumption_handle and resumption_handle in self._resumption_index:
            existing_id = self._resumption_index[resumption_handle]
            if existing_id in self._sessions:
                session = self._sessions[existing_id]
                session.record_activity()
                logger.info(
                    "Resumed existing session %s via handle %s", existing_id, resumption_handle
                )
                return session

        # Check existing session ID
        if session_id and session_id in self._sessions:
            session = self._sessions[session_id]
            session.record_activity()
            return session

        # Determine operating mode
        target_mode = mode or ("simulation" if settings.gemini_live_simulation_mode else "live")
        target_id = session_id or f"live-sess-{uuid.uuid4().hex[:8]}"

        session = SessionState(session_id=target_id, mode=target_mode)
        self._sessions[target_id] = session
        self._resumption_index[session.resumption_handle] = target_id
        logger.info("Created new Gemini Live session %s (mode=%s)", target_id, target_mode)
        return session

    def remove(self, session_id: str) -> None:
        if session_id in self._sessions:
            session = self._sessions.pop(session_id)
            self._resumption_index.pop(session.resumption_handle, None)
            if session.active_generation_task and not session.active_generation_task.done():
                session.active_generation_task.cancel()
            logger.info("Removed Gemini Live session %s", session_id)

    def list_sessions(self) -> List[GeminiLiveSessionStatus]:
        return [s.to_status() for s in self._sessions.values()]

    def count(self) -> int:
        return len(self._sessions)


manager = SessionManager()


@router.get("/status")
async def get_live_status() -> Dict[str, Any]:
    """Returns the operational status of the Gemini Live WebSocket proxy."""
    return {
        "status": "healthy",
        "service": "Gemini Live Multimodal WebSocket Proxy",
        "simulation_mode": settings.gemini_live_simulation_mode,
        "active_sessions": manager.count(),
        "default_model": settings.gemini_live_model,
        "default_voice": settings.gemini_live_voice,
        "default_language": settings.gemini_live_language,
        "timestamp": datetime.now().strftime("%H:%M:%S"),
    }


@router.get("/sessions", response_model=List[GeminiLiveSessionStatus])
async def list_active_sessions() -> List[GeminiLiveSessionStatus]:
    """Lists all active and resumable Gemini Live sessions."""
    return manager.list_sessions()


@router.post("/session", response_model=GeminiLiveSessionStatus)
async def create_session(
    mode: Optional[str] = Query(None, description="Operating mode ('simulation' or 'live')"),
) -> GeminiLiveSessionStatus:
    """Pre-allocates a Gemini Live session configuration."""
    session = manager.get_or_create(mode=mode)
    return session.to_status()


async def send_server_message(
    websocket: WebSocket, session: SessionState, msg: GeminiLiveServerMessage
) -> None:
    """Helper to safely dispatch a GeminiLiveServerMessage to client over WebSocket."""
    if websocket.client_state == WebSocketState.CONNECTED:
        payload = msg.model_dump()
        session.server_messages_sent += 1
        session.record_activity()
        await websocket.send_text(json.dumps(payload))


async def stream_simulated_speech(
    websocket: WebSocket,
    session: SessionState,
    text_content: str,
    frequency: float = 440.0,
) -> None:
    """Streams simulated speech chunks and transcripts with cancellation support on interrupt."""
    try:
        # 1. Output transcription chunk
        out_msg = GeminiLiveServerMessage(
            type="server_content",
            session_id=session.session_id,
            server_content=GeminiLiveServerContent(
                text=text_content,
                output_transcription=text_content,
                interrupted=False,
                turn_complete=False,
                generation_complete=False,
            ),
        )
        await send_server_message(websocket, session, out_msg)

        # 2. Synthetic PCM 24kHz audio chunks
        chunks = generate_synthetic_pcm_chunks(
            frequency=frequency, duration_seconds=0.4, chunk_seconds=0.1
        )
        for chunk in chunks:
            if asyncio.current_task() and asyncio.current_task().cancelled():
                return
            audio_b64 = base64.b64encode(chunk).decode("utf-8")
            chunk_msg = GeminiLiveServerMessage(
                type="server_content",
                session_id=session.session_id,
                server_content=GeminiLiveServerContent(
                    audio_pcm_base64=audio_b64,
                    interrupted=False,
                    turn_complete=False,
                    generation_complete=False,
                ),
            )
            await send_server_message(websocket, session, chunk_msg)
            await asyncio.sleep(0.04)  # Real-time pacing simulation

        # 3. Turn complete
        complete_msg = GeminiLiveServerMessage(
            type="server_content",
            session_id=session.session_id,
            server_content=GeminiLiveServerContent(
                interrupted=False,
                turn_complete=True,
                generation_complete=True,
            ),
        )
        await send_server_message(websocket, session, complete_msg)

        # 4. Session resumption update
        session.resumption_handle = f"resume-{session.session_id}-{int(time.time())}"
        resumption_msg = GeminiLiveServerMessage(
            type="session_resumption_update",
            session_id=session.session_id,
            resumption_handle=session.resumption_handle,
            last_consumed_client_message_index=session.client_messages_received,
        )
        await send_server_message(websocket, session, resumption_msg)

    except asyncio.CancelledError:
        logger.info("Simulated generation cancelled (interrupted by client)")
        if websocket.client_state == WebSocketState.CONNECTED:
            interrupt_msg = GeminiLiveServerMessage(
                type="server_content",
                session_id=session.session_id,
                server_content=GeminiLiveServerContent(
                    interrupted=True,
                    turn_complete=True,
                    generation_complete=True,
                ),
            )
            await send_server_message(websocket, session, interrupt_msg)
        raise


@router.websocket("/ws")
async def gemini_live_websocket(
    websocket: WebSocket,
    session_id: Optional[str] = Query(None),
    mode: Optional[str] = Query(None),
    resumption_handle: Optional[str] = Query(None),
) -> None:
    """Bidirectional WebSocket proxy connecting client to Gemini Live API or simulated fallback."""
    await websocket.accept()

    session = manager.get_or_create(
        session_id=session_id,
        resumption_handle=resumption_handle,
        mode=mode,
    )

    logger.info(
        "Client connected to Gemini Live WebSocket proxy (session=%s, mode=%s)",
        session.session_id,
        session.mode,
    )

    # Send initial setup_complete to gate sends
    setup_complete_msg = GeminiLiveServerMessage(
        type="setup_complete",
        session_id=session.session_id,
        resumption_handle=session.resumption_handle,
    )
    await send_server_message(websocket, session, setup_complete_msg)

    try:
        while True:
            # Handle text or binary frames from client
            message = await websocket.receive()
            msg_type = message.get("type")

            if msg_type == "websocket.disconnect":
                break

            session.client_messages_received += 1
            session.record_activity()

            # Case A: Binary frame (e.g. raw PCM 16kHz audio or raw image bytes)
            if "bytes" in message and message["bytes"]:
                raw_bytes = message["bytes"]
                is_image = (
                    raw_bytes.startswith(b"\xff\xd8\xff")
                    or raw_bytes.startswith(b"\x89PNG")
                    or b"WEBP" in raw_bytes[:16]
                )

                if is_image:
                    cur_st = blackboard.get_state()
                    ev_payload = await analyze_visual_evidence_frame_async(
                        image_bytes=raw_bytes,
                        machine_id=cur_st.suspect_machine or "CNC-02",
                        tool_id=cur_st.suspect_tool,
                        filename="mobile_camera_frame.jpg",
                    )
                    finding = AgentFinding(
                        agent_id=AGENT_ID,
                        agent_name=AGENT_NAME,
                        phase=DIAGNOSTIC_PHASE,
                        finding=f"Frontline technician camera frame confirms defect root cause on {cur_st.suspect_machine or 'CNC-02'}.",
                        evidence=ev_payload.analysis,
                        confidence=0.92,
                        citation=ev_payload.citation,
                    )
                    blackboard.attach_field_evidence(finding, ev_payload)
                    resp = await generate_live_guidance_async("ảnh camera kiểm định", session)
                else:
                    resp = await generate_live_guidance_async("bị gì", session)

                # Cancel any ongoing speech if active
                if session.active_generation_task and not session.active_generation_task.done():
                    session.active_generation_task.cancel()
                    try:
                        await session.active_generation_task
                    except asyncio.CancelledError:
                        pass

                # Stream response
                session.active_generation_task = asyncio.create_task(
                    stream_simulated_speech(
                        websocket,
                        session,
                        resp["transcription"],
                        frequency=float(resp["freq"]),
                    )
                )
                continue

            # Case B: Text JSON frame
            if "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                except Exception as exc:
                    err_msg = GeminiLiveServerMessage(
                        type="error",
                        session_id=session.session_id,
                        error_message=f"Invalid JSON format: {exc}",
                    )
                    await send_server_message(websocket, session, err_msg)
                    continue

                # 1. Interruption request
                if payload.get("interrupt") or payload.get("type") == "interrupt":
                    if session.active_generation_task and not session.active_generation_task.done():
                        session.active_generation_task.cancel()
                        try:
                            await session.active_generation_task
                        except asyncio.CancelledError:
                            pass
                    interrupt_msg = GeminiLiveServerMessage(
                        type="server_content",
                        session_id=session.session_id,
                        server_content=GeminiLiveServerContent(
                            interrupted=True,
                            turn_complete=True,
                            generation_complete=True,
                        ),
                    )
                    await send_server_message(websocket, session, interrupt_msg)
                    continue

                # 2. Setup message
                if "setup" in payload or payload.get("type") == "setup":
                    setup_complete_ack = GeminiLiveServerMessage(
                        type="setup_complete",
                        session_id=session.session_id,
                        resumption_handle=session.resumption_handle,
                    )
                    await send_server_message(websocket, session, setup_complete_ack)
                    continue

                # 3. Client content (user typed message or speech transcript)
                user_text = ""
                if "client_content" in payload and payload["client_content"]:
                    user_text = payload["client_content"].get("text", "")
                elif "text" in payload:
                    user_text = payload["text"]
                elif payload.get("type") == "ping":
                    pong_msg = GeminiLiveServerMessage(type="pong", session_id=session.session_id)
                    await send_server_message(websocket, session, pong_msg)
                    continue

                # 4. Realtime media input (base64 audio or image)
                if "realtime_input" in payload and payload["realtime_input"]:
                    chunks = payload["realtime_input"].get("media_chunks", [])
                    has_video = any("image" in c.get("mime_type", "") for c in chunks)
                    if has_video:
                        for c in chunks:
                            if "image" in c.get("mime_type", ""):
                                try:
                                    img_bytes = base64.b64decode(c.get("data", ""))
                                except Exception:
                                    img_bytes = b""
                                cur_st = blackboard.get_state()
                                ev_payload = await analyze_visual_evidence_frame_async(
                                    image_bytes=img_bytes,
                                    machine_id=cur_st.suspect_machine or "CNC-02",
                                    tool_id=cur_st.suspect_tool,
                                    filename="realtime_frame.jpg",
                                )
                                finding = AgentFinding(
                                    agent_id=AGENT_ID,
                                    agent_name=AGENT_NAME,
                                    phase=DIAGNOSTIC_PHASE,
                                    finding=f"Frontline technician camera frame confirms defect root cause on {cur_st.suspect_machine or 'CNC-02'}.",
                                    evidence=ev_payload.analysis,
                                    confidence=0.92,
                                    citation=ev_payload.citation,
                                )
                                blackboard.attach_field_evidence(finding, ev_payload)
                                break
                        user_text = "ảnh camera kiểm định"
                    else:
                        user_text = "bị gì"

                if not user_text:
                    user_text = "Chào Copilot"

                # Echo input transcription
                in_transcription_msg = GeminiLiveServerMessage(
                    type="server_content",
                    session_id=session.session_id,
                    server_content=GeminiLiveServerContent(
                        input_transcription=user_text,
                        interrupted=False,
                        turn_complete=False,
                        generation_complete=False,
                    ),
                )
                await send_server_message(websocket, session, in_transcription_msg)

                # Cancel previous generation task if still active
                if session.active_generation_task and not session.active_generation_task.done():
                    session.active_generation_task.cancel()
                    try:
                        await session.active_generation_task
                    except asyncio.CancelledError:
                        pass

                # Start streaming grounded response
                resp = await generate_live_guidance_async(user_text, session)
                session.active_generation_task = asyncio.create_task(
                    stream_simulated_speech(
                        websocket,
                        session,
                        resp["transcription"],
                        frequency=float(resp["freq"]),
                    )
                )

    except WebSocketDisconnect:
        logger.info("Gemini Live WebSocket client disconnected (session=%s)", session.session_id)
    except Exception as exc:
        logger.error("Unhandled error in Gemini Live WebSocket: %s", exc, exc_info=True)
    finally:
        if session.active_generation_task and not session.active_generation_task.done():
            session.active_generation_task.cancel()
        # Keep session in manager for resumption window unless closed


@router.post("/evidence")
async def upload_gemini_live_evidence(
    file: UploadFile = File(...),
    notes: Optional[str] = Form(None),
) -> Dict[str, Any]:
    """Ingests visual evidence photo from technician's mobile device via Gemini Live session."""
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
        evidence=ev_payload.analysis + (f" Ghi chú: {notes}" if notes else ""),
        confidence=0.92,
        citation=ev_payload.citation,
    )
    new_state = blackboard.attach_field_evidence(finding, ev_payload)
    return {
        "status": "success",
        "evidence": ev_payload.model_dump(),
        "finding": finding.model_dump(),
        "incident_status": new_state.status,
    }
