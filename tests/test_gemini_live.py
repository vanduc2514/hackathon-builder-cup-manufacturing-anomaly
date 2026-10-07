"""Tests for Gemini Live WebSocket Proxy and Copilot Gateway."""

from __future__ import annotations

import base64
import json
import pytest
from starlette.testclient import TestClient

from backend.api.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_gemini_live_status_endpoint(client: TestClient) -> None:
    """Asserts that the Gemini Live status endpoint returns operational health and configs."""
    response = client.get("/api/gemini-live/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "Gemini Live" in data["service"]
    assert "default_model" in data
    assert "default_voice" in data
    assert "default_language" in data
    assert isinstance(data["active_sessions"], int)


def test_gemini_live_session_management(client: TestClient) -> None:
    """Asserts session creation and listing via REST endpoints."""
    # Create session
    create_resp = client.post("/api/gemini-live/session?mode=simulation")
    assert create_resp.status_code == 200
    session_data = create_resp.json()
    session_id = session_data["session_id"]
    assert session_id.startswith("live-sess-")
    assert session_data["mode"] == "simulation"

    # List sessions
    list_resp = client.get("/api/gemini-live/sessions")
    assert list_resp.status_code == 200
    sessions = list_resp.json()
    assert any(s["session_id"] == session_id for s in sessions)


def test_gemini_live_websocket_handshake(client: TestClient) -> None:
    """Asserts initial connection handshake and setup_complete message."""
    with client.websocket_connect("/api/gemini-live/ws?mode=simulation") as ws:
        # First frame must be setup_complete
        data = ws.receive_json()
        assert data["type"] == "setup_complete"
        assert "session_id" in data
        assert "resumption_handle" in data


def test_gemini_live_websocket_text_conversation(client: TestClient) -> None:
    """Asserts end-to-end conversation with transcription and synthetic audio chunks."""
    with client.websocket_connect("/api/gemini-live/ws?mode=simulation") as ws:
        # Handshake
        handshake = ws.receive_json()
        assert handshake["type"] == "setup_complete"

        # Send technician query
        query_msg = {
            "type": "client_content",
            "client_content": {
                "text": "Máy CNC-02 bị gì, sửa thế nào?",
            },
        }
        ws.send_text(json.dumps(query_msg))

        # 1. Expect input transcription
        msg1 = ws.receive_json()
        assert msg1["type"] == "server_content"
        assert msg1["server_content"]["input_transcription"] == "Máy CNC-02 bị gì, sửa thế nào?"

        # 2. Expect output transcription
        msg2 = ws.receive_json()
        assert msg2["type"] == "server_content"
        output_text = msg2["server_content"]["output_transcription"]
        assert "CNC-02" in output_text
        assert "T07" in output_text
        assert "SOP trang 112" in output_text

        # 3. Expect streaming audio chunks
        received_audio_bytes = 0
        while True:
            frame = ws.receive_json()
            assert frame["type"] in ("server_content", "session_resumption_update")
            if frame["type"] == "server_content":
                sc = frame["server_content"]
                if sc.get("audio_pcm_base64"):
                    audio_raw = base64.b64decode(sc["audio_pcm_base64"])
                    received_audio_bytes += len(audio_raw)
                if sc.get("turn_complete"):
                    break

        assert received_audio_bytes > 0, "Expected non-empty PCM audio stream"

        # 4. Expect session resumption update
        resump_frame = ws.receive_json()
        assert resump_frame["type"] == "session_resumption_update"
        assert resump_frame["resumption_handle"].startswith("resume-")
        assert resump_frame["last_consumed_client_message_index"] >= 1


def test_gemini_live_websocket_dial_indicator_response(client: TestClient) -> None:
    """Asserts domain guidance when technician provides dial indicator runout verification."""
    with client.websocket_connect("/api/gemini-live/ws?mode=simulation") as ws:
        ws.receive_json()  # setup_complete

        # Send runout verification query
        ws.send_text(json.dumps({"text": "Đã kiểm tra đồng hồ so độ đảo dao 0.008"}))

        # Input transcription
        ws.receive_json()

        # Output transcription
        msg = ws.receive_json()
        output_text = msg["server_content"]["output_transcription"]
        assert "0.008 mm" in output_text
        assert "50 sản phẩm" in output_text


def test_gemini_live_websocket_binary_audio_streaming(client: TestClient) -> None:
    """Asserts handling of raw binary PCM 16kHz audio frames from microphone."""
    with client.websocket_connect("/api/gemini-live/ws?mode=simulation") as ws:
        ws.receive_json()  # setup_complete

        # Send raw PCM 16-bit audio frame (e.g. 320 bytes = 10ms at 16kHz)
        dummy_pcm = b"\x00\x00" * 160
        ws.send_bytes(dummy_pcm)

        # Expect streaming response triggered by audio
        msg = ws.receive_json()
        assert msg["type"] == "server_content"
        assert "transcription" in str(msg)


def test_gemini_live_websocket_binary_camera_frame(client: TestClient) -> None:
    """Asserts handling of raw binary camera image frames (JPEG header)."""
    with client.websocket_connect("/api/gemini-live/ws?mode=simulation") as ws:
        ws.receive_json()  # setup_complete

        # Send dummy JPEG frame starting with \xff\xd8\xff
        jpeg_frame = b"\xff\xd8\xff\xe0" + b"\x00" * 128
        ws.send_bytes(jpeg_frame)

        msg = ws.receive_json()
        assert msg["type"] == "server_content"
        assert "camera" in str(msg) or "hình ảnh" in str(msg)


def test_gemini_live_websocket_interruption(client: TestClient) -> None:
    """Asserts that client interruption signal resets active model turn immediately."""
    with client.websocket_connect("/api/gemini-live/ws?mode=simulation") as ws:
        ws.receive_json()  # setup_complete

        # Send query
        ws.send_text(json.dumps({"text": "Máy CNC-02 bị gì"}))
        ws.receive_json()  # input transcription

        # Send interruption
        ws.send_text(json.dumps({"type": "interrupt"}))

        # Drain until interrupted message observed
        interrupted_found = False
        for _ in range(5):
            msg = ws.receive_json()
            if msg.get("server_content", {}).get("interrupted"):
                interrupted_found = True
                break

        assert interrupted_found, "Expected server_content with interrupted=True"


def test_gemini_live_websocket_ping_pong(client: TestClient) -> None:
    """Asserts keep-alive ping/pong frame exchange."""
    with client.websocket_connect("/api/gemini-live/ws?mode=simulation") as ws:
        ws.receive_json()  # setup_complete
        ws.send_text(json.dumps({"type": "ping"}))
        pong = ws.receive_json()
        assert pong["type"] == "pong"


def test_gemini_live_session_resumption_workflow(client: TestClient) -> None:
    """Asserts session resumption by handle across reconnects."""
    resumption_handle = ""
    session_id = ""

    # Session 1: Get resumption handle
    with client.websocket_connect("/api/gemini-live/ws?mode=simulation") as ws:
        handshake = ws.receive_json()
        session_id = handshake["session_id"]
        resumption_handle = handshake["resumption_handle"]
        assert resumption_handle.startswith("resume-")

    # Session 2: Connect with resumption handle
    url = f"/api/gemini-live/ws?resumption_handle={resumption_handle}"
    with client.websocket_connect(url) as ws2:
        handshake2 = ws2.receive_json()
        assert handshake2["session_id"] == session_id, "Resumed session should keep same session_id"
