"""Core Models: Pydantic schemas for findings, evidence, confidence, citations, incident state, and Gemini Live streaming."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AgentFinding(BaseModel):
    """Four-part contract: finding, evidence, confidence, citation."""

    agent_id: str
    agent_name: str
    phase: str
    finding: str
    evidence: str
    confidence: float = Field(ge=0.0, le=1.0)
    citation: str
    timestamp: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))


class ImpactMetrics(BaseModel):
    scrap_avoided: int = 240
    downtime_minutes: int = 45
    energy_kwh: float = 38.0
    co2_kg: float = 25.0


class IncidentState(BaseModel):
    incident_id: str = "INC-0412"
    status: str = "normal"  # normal, detecting, tracing, investigating, analyzing, repairing, verifying, closed
    defect_type: Optional[str] = None
    defect_rate: float = 0.005
    spc_ucl: float = 0.030
    suspect_machine: Optional[str] = None
    suspect_tool: Optional[str] = None
    root_cause: Optional[str] = None
    verification_count: int = 0
    verification_target: int = 50
    findings: List[AgentFinding] = Field(default_factory=list)
    impact: Optional[ImpactMetrics] = None
    documents: Dict[str, Any] = Field(default_factory=dict)
    updated_at: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))


class DefectInjectionRequest(BaseModel):
    defect_type: str = "scratch_vertical"
    severity: str = "medium"
    machine_id: str = "CNC-02"
    tool_id: str = "T07"


class GeminiLiveModality(str, Enum):
    AUDIO = "AUDIO"
    TEXT = "TEXT"


class GeminiLiveBlob(BaseModel):
    mime_type: str = "audio/pcm;rate=16000"
    data: str  # Base64 encoded payload


class GeminiLiveRealtimeInput(BaseModel):
    media_chunks: List[GeminiLiveBlob] = Field(default_factory=list)


class GeminiLiveClientContent(BaseModel):
    text: Optional[str] = None
    end_of_turn: bool = True


class GeminiLiveSetup(BaseModel):
    model: str = "gemini-2.0-flash-exp"
    voice_name: str = "Aoede"
    language_code: str = "vi-VN"
    system_instruction: Optional[str] = None
    session_id: Optional[str] = None
    mode: str = "live"  # "live" or "simulation"
    session_resumption_handle: Optional[str] = None


class GeminiLiveClientMessage(BaseModel):
    setup: Optional[GeminiLiveSetup] = None
    realtime_input: Optional[GeminiLiveRealtimeInput] = None
    client_content: Optional[GeminiLiveClientContent] = None
    interrupt: bool = False
    message_index: Optional[int] = None


class GeminiLiveServerContent(BaseModel):
    text: Optional[str] = None
    audio_pcm_base64: Optional[str] = None
    input_transcription: Optional[str] = None
    output_transcription: Optional[str] = None
    interrupted: bool = False
    turn_complete: bool = False
    generation_complete: bool = False


class GeminiLiveServerMessage(BaseModel):
    type: str  # "setup_complete", "server_content", "session_resumption_update", "go_away", "error", "pong"
    session_id: Optional[str] = None
    server_content: Optional[GeminiLiveServerContent] = None
    resumption_handle: Optional[str] = None
    last_consumed_client_message_index: Optional[int] = None
    error_message: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))


class GeminiLiveSessionStatus(BaseModel):
    session_id: str
    status: str  # "active", "resumed", "closed", "simulated"
    mode: str  # "live", "simulation"
    client_messages_received: int = 0
    server_messages_sent: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))
    last_active_at: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))
