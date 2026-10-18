"""Unit and integration tests for Step 7b Diagnostic Feedback Loop (Evidence Gathering)."""

from __future__ import annotations

import asyncio
import base64
import io
import json
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from backend.agents.agent_technician_copilot import (
    AGENT_ID,
    AGENT_NAME,
    DIAGNOSTIC_PHASE,
    analyze_visual_evidence_frame,
    build_contextual_diagnostic_probe_vi,
)
from backend.agents.workflow_nodes import (
    MAX_EVIDENCE_ROUNDS,
    rca_gate,
    record_field_evidence,
)
from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.models import (
    AgentFinding,
    FindingDraft,
    IncidentState,
    RootCauseFindingDraft,
    VisualEvidencePayload,
)


@pytest.fixture(autouse=True)
def reset_blackboard_state():
    """Resets Blackboard to fresh analyzing state before every test."""
    blackboard._state = IncidentState(
        incident_id="INC-0412",
        status="analyzing",
        suspect_machine="CNC-02",
        suspect_tool="T07",
        defect_type="scratch_vertical",
        findings=[],
    )
    yield
    blackboard._state = IncidentState(
        incident_id="INC-0412",
        status="normal",
        findings=[],
    )


# =============================================================================
# Criterion 1: Low-Confidence Triggering (< 0.70)
# =============================================================================


def test_rca_gate_low_confidence_halts_and_routes_need_evidence():
    """Confidence < 0.70 halts progression, sets awaiting_evidence, and extracts diagnostic_request."""
    ctx = MagicMock()
    ctx.state = {"evidence_rounds": 0}
    draft = RootCauseFindingDraft(
        finding="Preliminary hypothesis: cutting tool T07 wear.",
        evidence="Optical camera resolution at line speed is insufficient to discern flank wear vs chipped insert.",
        confidence=0.65,
        citation="CNC-02 Maintenance Log 2026-03",
        diagnostic_request="Yêu cầu kỹ thuật viên kiểm tra mũi dao T07.",
    )

    event = asyncio.run(rca_gate(ctx, draft))

    assert event.actions.route == "NEED_EVIDENCE"
    assert ctx.state["evidence_rounds"] == 1

    state = blackboard.get_state()
    assert state.status == "awaiting_evidence"
    assert state.diagnostic_request == "Yêu cầu kỹ thuật viên kiểm tra mũi dao T07."
    assert len(state.findings) == 1
    assert state.findings[0].agent_id == "RCA"
    assert state.findings[0].confidence == 0.65


def test_rca_gate_low_confidence_generates_vietnamese_probe_if_unspecified():
    """If draft omits diagnostic_request, rca_gate synthesizes a contextual Vietnamese probe."""
    ctx = MagicMock()
    ctx.state = {"evidence_rounds": 0}
    draft = RootCauseFindingDraft(
        finding="Suspect tool insert wear.",
        evidence="High vibration 0.22 mm/s.",
        confidence=0.62,
        citation="CNC-02 OEM Manual",
        diagnostic_request=None,
    )

    event = asyncio.run(rca_gate(ctx, draft))

    assert event.actions.route == "NEED_EVIDENCE"
    state = blackboard.get_state()
    assert state.status == "awaiting_evidence"
    assert state.diagnostic_request is not None
    assert "62%" in state.diagnostic_request
    assert "T07" in state.diagnostic_request


# =============================================================================
# Criterion 2: Contextual Technician Probe in Vietnamese
# =============================================================================


def test_build_contextual_diagnostic_probe_vi_cnc():
    """Generates Vietnamese prompt with confidence % and specific tool inspection instructions."""
    probe = build_contextual_diagnostic_probe_vi(
        confidence=0.65,
        machine_id="CNC-02",
        tool_id="T07",
        defect_type="scratch_vertical",
    )
    assert "65%" in probe
    assert "T07" in probe
    assert "mòn lưỡi hay mẻ hạt" in probe


def test_build_contextual_diagnostic_probe_vi_im():
    """Generates Vietnamese prompt for injection molding desiccant dryer short fill defect."""
    probe = build_contextual_diagnostic_probe_vi(
        confidence=0.68,
        machine_id="IM-05",
        tool_id=None,
        defect_type="short_fill",
    )
    assert "68%" in probe
    assert "Dryer-03" in probe
    assert "hút ẩm desiccant" in probe
    assert "thiếu liệu" in probe






# =============================================================================
# Criterion 3 & 4: Visual Evidence Ingestion & Blackboard Update
# =============================================================================


def test_analyze_visual_evidence_frame():
    """Analyzes image frame and returns VisualEvidencePayload with wear measurements and citation."""
    mock_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 200  # JPEG header + dummy payload
    payload = analyze_visual_evidence_frame(
        image_bytes=mock_bytes,
        machine_id="CNC-02",
        tool_id="T07",
        filename="cnc_insert_closeup.jpg",
    )

    assert isinstance(payload, VisualEvidencePayload)
    assert payload.filename == "cnc_insert_closeup.jpg"
    assert payload.defect_detected is True
    assert payload.wear_measurement_mm == 0.35
    assert "VB = 0.35 mm" in payload.analysis
    assert "Gemini Live" in payload.citation


def test_blackboard_attach_field_evidence():
    """attach_field_evidence updates blackboard, clears diagnostic_request, and preserves awaiting_evidence status."""
    blackboard.update_status("awaiting_evidence", diagnostic_request="Cần chụp ảnh mũi dao.")
    assert blackboard.get_state().status == "awaiting_evidence"
    assert blackboard.get_state().diagnostic_request is not None

    evidence = VisualEvidencePayload(
        filename="t07_macro.jpg",
        size_bytes=1024,
        analysis="Insert flank wear VB=0.35 mm exceeds tolerance.",
        defect_detected=True,
        wear_measurement_mm=0.35,
        citation="Gemini Live macro inspection",
    )
    finding = AgentFinding(
        agent_id=AGENT_ID,
        agent_name=AGENT_NAME,
        phase=DIAGNOSTIC_PHASE,
        finding="Technician submitted insert macro photo.",
        evidence=evidence.analysis,
        confidence=0.92,
        citation=evidence.citation,
    )

    new_state = blackboard.attach_field_evidence(finding, evidence)

    assert new_state.status == "awaiting_evidence"
    assert new_state.diagnostic_request is None
    assert new_state.visual_evidence is not None
    assert new_state.visual_evidence.wear_measurement_mm == 0.35
    assert len(new_state.findings) == 1
    assert new_state.findings[0].phase == DIAGNOSTIC_PHASE


def test_record_field_evidence_workflow_node():
    """record_field_evidence records finding under DIAGNOSTIC_PHASE and transitions to analyzing."""
    draft = FindingDraft(
        finding="Field evidence confirms severe flank wear on tool T07.",
        evidence="Macro photo shows VB = 0.35 mm wear.",
        confidence=0.92,
        citation="Gemini Live macro inspection",
    )

    state = asyncio.run(record_field_evidence(draft))
    assert state.status == "analyzing"
    assert state.diagnostic_request is None
    assert any(f.phase == DIAGNOSTIC_PHASE for f in state.findings)


def test_upload_evidence_gemini_live_rest_endpoint():
    """POST /api/gemini-live/evidence ingests image file and attaches evidence to blackboard."""
    client = TestClient(app)
    blackboard.update_status("awaiting_evidence", diagnostic_request="Cần chụp ảnh mũi dao.")

    dummy_image = io.BytesIO(b"\xff\xd8\xff\xe0" + b"dummypixels" * 50)
    response = client.post(
        "/api/gemini-live/evidence",
        files={"file": ("insert_t07.jpg", dummy_image, "image/jpeg")},
        data={"notes": "Kỹ thuật viên chụp cận cảnh mũi T07 trạm CNC-02"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["evidence"]["defect_detected"] is True
    assert data["incident_status"] == "awaiting_evidence"

    state = blackboard.get_state()
    assert state.status == "awaiting_evidence"
    assert state.visual_evidence is not None
    assert state.visual_evidence.filename == "insert_t07.jpg"


def test_upload_evidence_gemini_live_rest_endpoint_outside_awaiting_evidence_returns_409():
    """POST /api/gemini-live/evidence outside awaiting_evidence is rejected and attaches nothing."""
    client = TestClient(app)

    dummy_image = io.BytesIO(b"\xff\xd8\xff\xe0" + b"dummypixels" * 50)
    response = client.post(
        "/api/gemini-live/evidence",
        files={"file": ("insert_t07.jpg", dummy_image, "image/jpeg")},
    )

    assert response.status_code == 409
    assert blackboard.get_state().status == "analyzing"
    assert blackboard.get_state().visual_evidence is None


def test_gemini_live_websocket_binary_image_frame_outside_awaiting_evidence_errors():
    """WebSocket image frame outside awaiting_evidence yields an error message, no attach."""
    client = TestClient(app)
    jpeg_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 128

    with client.websocket_connect("/api/gemini-live/ws?session_id=VN-COPILOT-409") as ws:
        assert ws.receive_json()["type"] == "setup_complete"
        ws.send_bytes(jpeg_bytes)
        resp = ws.receive_json()
        assert resp["type"] == "error"
        assert resp["error_message"]
    assert blackboard.get_state().visual_evidence is None


def test_upload_evidence_incidents_rest_endpoint():
    """POST /api/incidents/evidence uploads photo evidence directly to the incident board."""
    client = TestClient(app)
    blackboard.update_status("awaiting_evidence", diagnostic_request="Cần chụp ảnh mũi dao.")

    dummy_image = io.BytesIO(b"\xff\xd8\xff\xe0" + b"dummypixels" * 50)
    response = client.post(
        "/api/incidents/evidence",
        files={"file": ("dryer_filter.jpg", dummy_image, "image/jpeg")},
        data={"notes": "Ảnh cụm sấy Dryer-03"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["incident_status"] == "awaiting_evidence"

    state = blackboard.get_state()
    assert state.status == "awaiting_evidence"
    assert state.visual_evidence is not None


def test_gemini_live_websocket_binary_image_frame():
    """WebSocket binary image frame triggers visual evidence attachment to blackboard."""
    client = TestClient(app)
    blackboard.update_status("awaiting_evidence", diagnostic_request="Cần chụp ảnh.")

    jpeg_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 128

    with client.websocket_connect("/api/gemini-live/ws?session_id=VN-COPILOT-TEST") as ws:
        # Handshake received automatically from server upon connection
        handshake = ws.receive_json()
        assert handshake["type"] == "setup_complete"

        # Send binary JPEG frame
        ws.send_bytes(jpeg_bytes)

        # Server content stream response
        resp = ws.receive_json()
        assert resp["type"] == "server_content"

        # Check that visual evidence was attached to blackboard
        state = blackboard.get_state()
        assert state.status == "awaiting_evidence"
        assert state.visual_evidence is not None
        assert state.visual_evidence.filename == "mobile_camera_frame.jpg"


def test_gemini_live_websocket_realtime_media_chunks():
    """WebSocket JSON realtime_input with base64 image triggers visual evidence attachment."""
    client = TestClient(app)
    blackboard.update_status("awaiting_evidence", diagnostic_request="Cần chụp ảnh.")

    jpeg_b64 = base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x00" * 64).decode("ascii")

    with client.websocket_connect("/api/gemini-live/ws?session_id=VN-COPILOT-TEST-2") as ws:
        # Handshake received automatically
        handshake = ws.receive_json()
        assert handshake["type"] == "setup_complete"

        # Realtime media input
        payload = {
            "type": "client_content",
            "realtime_input": {"media_chunks": [{"mime_type": "image/jpeg", "data": jpeg_b64}]},
        }
        ws.send_text(json.dumps(payload))

        # Input echo
        echo = ws.receive_json()
        assert echo["type"] == "server_content"
        assert echo["server_content"]["input_transcription"] == "ảnh camera kiểm định"

        # Blackboard updated
        state = blackboard.get_state()
        assert state.status == "awaiting_evidence"
        assert state.visual_evidence is not None


# =============================================================================
# Criterion 5: Secondary Convergence (Confidence >= 0.85)
# =============================================================================


def test_rca_gate_secondary_convergence_passes_at_or_above_85():
    """When evidence_rounds >= 1, confidence >= 0.85 passes to CONFIDENT (repairing)."""
    ctx = MagicMock()
    ctx.state = {"evidence_rounds": 1}

    draft = RootCauseFindingDraft(
        finding="Confirmed: insert T07 flank wear VB=0.35 mm.",
        evidence="Field photo confirms abrasive wear on cutting flank exceeding 0.30 mm tolerance limit.",
        confidence=0.88,
        citation="CNC-02 OEM Manual p.112 & technician field photo",
    )

    event = asyncio.run(rca_gate(ctx, draft))
    assert event.actions.route == "CONFIDENT"

    state = blackboard.get_state()
    assert state.status == "repairing"
    assert state.root_cause == "Confirmed: insert T07 flank wear VB=0.35 mm."
    assert state.diagnostic_request is None


def test_rca_gate_secondary_convergence_rejects_below_85_if_rounds_left():
    """When evidence_rounds == 1, confidence 0.75 (< 0.85) triggers another evidence round."""
    ctx = MagicMock()
    ctx.state = {"evidence_rounds": 1}

    draft = RootCauseFindingDraft(
        finding="Ambiguous wear pattern on insert T07.",
        evidence="Photo slightly blurry; unable to measure flank wear accurately.",
        confidence=0.75,  # Above RCA_CONFIDENCE_THRESHOLD (0.70) but BELOW SECONDARY_CONFIDENCE_THRESHOLD (0.85)
        citation="CNC-02 OEM Manual",
    )

    event = asyncio.run(rca_gate(ctx, draft))
    assert event.actions.route == "NEED_EVIDENCE"
    assert ctx.state["evidence_rounds"] == 2

    state = blackboard.get_state()
    assert state.status == "awaiting_evidence"


def test_rca_gate_secondary_convergence_escalates_if_below_85_after_max_rounds():
    """When evidence_rounds reaches MAX_EVIDENCE_ROUNDS and confidence < 0.85, routes ESCALATE."""
    ctx = MagicMock()
    ctx.state = {"evidence_rounds": MAX_EVIDENCE_ROUNDS}

    draft = RootCauseFindingDraft(
        finding="Still unverified root cause on CNC-02.",
        evidence="Multiple photos inconclusive.",
        confidence=0.80,  # Below 0.85 threshold
        citation="CNC-02 OEM Manual",
    )

    event = asyncio.run(rca_gate(ctx, draft))
    assert event.actions.route == "ESCALATE"

    state = blackboard.get_state()
    assert state.status == "escalated"
    assert "still below 0.85" in event.output
