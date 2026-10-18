"""Tests for the Technician Copilot WebSocket: real Gemini streaming replies, no canned text."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from starlette.testclient import TestClient

import backend.agents.agent_technician_copilot as copilot_mod
import backend.api.routes_gemini_live as live_mod
from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import CitationReference, RAGSearchResult

WORN_PRESET = "preset-cnc02-tool-worn-insert-commons-bautsch-cc0"
SOP_SNIPPET = "Torque the T07 insert clamp screw to the value in table 4-2 (marker SOP-TORQUE-XYZ)."
ROOT_CAUSE = "T07 flank wear beyond limit (marker ROOT-CAUSE-XYZ)"


class FakeStreamingClient:
    """Minimal google-genai client double: `aio.models.generate_content_stream` yields scripted chunks."""

    def __init__(self, replies: list[list[str]], hold_after: bool = False) -> None:
        self._replies = list(replies)
        self._hold_after = hold_after
        self.calls: list[dict[str, Any]] = []
        self.aio = SimpleNamespace(
            models=SimpleNamespace(generate_content_stream=self._generate_content_stream)
        )

    async def _generate_content_stream(self, *, model: str, contents: Any, config: Any) -> Any:
        self.calls.append({"model": model, "contents": contents, "config": config})
        chunks = self._replies.pop(0)
        hold = self._hold_after

        async def stream() -> Any:
            for text in chunks:
                yield SimpleNamespace(text=text)
            if hold:
                await asyncio.Event().wait()

        return stream()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def gemini_available(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(live_mod, "is_gemini_vision_available", lambda: True)


@pytest.fixture
def incident(monkeypatch: pytest.MonkeyPatch) -> None:
    """Board in the repair phase plus a stubbed RAG lookup returning a recognisable SOP snippet."""
    blackboard.reset()
    blackboard.update_status(
        "repairing",
        suspect_machine="CNC-02",
        suspect_tool="T07",
        defect_type="scratch_vertical",
        root_cause=ROOT_CAUSE,
    )

    async def fake_search(**kwargs: Any) -> RAGSearchResult:
        fake_search.kwargs = kwargs  # type: ignore[attr-defined]
        return RAGSearchResult(
            defect_symptom="scratch_vertical",
            suspect_asset="CNC-02",
            query=str(kwargs.get("query")),
            citations=[
                CitationReference(
                    document_id="manuals/cnc02.md",
                    title="CNC-02 OEM Manual",
                    page_number=112,
                    snippet=SOP_SNIPPET,
                )
            ],
            confidence=0.9,
        )

    monkeypatch.setattr(copilot_mod, "search_knowledge_base", fake_search)


def _use_client(monkeypatch: pytest.MonkeyPatch, fake: FakeStreamingClient) -> None:
    monkeypatch.setattr(live_mod, "get_gemini_client", lambda: fake)


def _collect_turn(ws: Any) -> list[dict[str, Any]]:
    """Receives messages up to and including the terminal one of a turn."""
    messages: list[dict[str, Any]] = []
    while True:
        msg = ws.receive_json()
        messages.append(msg)
        if msg["type"] in ("turn_complete", "error", "offline"):
            return messages


def _text_of(content: Any) -> str:
    return " ".join(p.text for p in content.parts if p.text)


def test_status_endpoint_reports_copilot_availability(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(live_mod, "is_gemini_vision_available", lambda: False)
    data = client.get("/api/gemini-live/status").json()
    assert data["status"] == "healthy"
    assert data["copilot_available"] is False
    assert data["model"] == settings.gemini_model
    assert data["language"] == "en-US"
    assert isinstance(data["active_sessions"], int)
    for retired in ("simulation_mode", "default_voice", "default_language", "default_model"):
        assert retired not in data


def test_session_management(client: TestClient) -> None:
    created = client.post("/api/gemini-live/session")
    assert created.status_code == 200
    session = created.json()
    assert session["status"] == "active"
    assert "mode" not in session
    sessions = client.get("/api/gemini-live/sessions").json()
    assert any(s["session_id"] == session["session_id"] for s in sessions)


def test_websocket_handshake(client: TestClient) -> None:
    with client.websocket_connect("/api/gemini-live/ws?session_id=copilot-hs") as ws:
        data = ws.receive_json()
        assert data["type"] == "setup_complete"
        assert data["session_id"] == "copilot-hs"
        assert data["resumption_handle"]


def test_user_turn_streams_gemini_deltas_with_incident_sop_and_history(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    gemini_available: None,
    incident: None,
    caplog: pytest.LogCaptureFixture,
) -> None:
    fake = FakeStreamingClient(
        [
            ["The T07 insert shows flank wear. ", "Replace it per the SOP."],
            ["Torque it as the manual says."],
        ]
    )
    _use_client(monkeypatch, fake)
    caplog.set_level(logging.INFO)

    with client.websocket_connect("/api/gemini-live/ws?session_id=copilot-turn") as ws:
        assert ws.receive_json()["type"] == "setup_complete"
        ws.send_json({"type": "user_turn", "text": "What is wrong with this machine?"})
        first = _collect_turn(ws)
        ws.send_json({"type": "user_turn", "text": "What torque do I use?"})
        second = _collect_turn(ws)

    assert [m["type"] for m in first] == ["text_delta", "text_delta", "turn_complete"]
    assert [m["text"] for m in first[:2]] == [
        "The T07 insert shows flank wear. ",
        "Replace it per the SOP.",
    ]
    assert first[-1]["interrupted"] is False
    assert [m["type"] for m in second] == ["text_delta", "turn_complete"]

    call = fake.calls[0]
    assert call["model"] == settings.gemini_model
    system = call["config"].system_instruction
    assert "CNC-02" in system
    assert "T07" in system
    assert "scratch_vertical" in system
    assert "repairing" in system
    assert "ROOT-CAUSE-XYZ" in system
    assert "SOP-TORQUE-XYZ" in system
    assert "CNC-02 OEM Manual" in system
    assert len(call["contents"]) == 1
    assert _text_of(call["contents"][-1]) == "What is wrong with this machine?"
    assert call["contents"][-1].role == "user"

    # Second turn carries the first exchange as chat history.
    contents = fake.calls[1]["contents"]
    assert [c.role for c in contents] == ["user", "model", "user"]
    assert _text_of(contents[0]) == "What is wrong with this machine?"
    assert _text_of(contents[1]) == "The T07 insert shows flank wear. Replace it per the SOP."
    assert _text_of(contents[2]) == "What torque do I use?"

    assert copilot_mod.search_knowledge_base.kwargs["query"] == "What torque do I use?"  # type: ignore[attr-defined]
    assert any("gemini_call kind=copilot model=" in r.getMessage() for r in caplog.records)


def test_user_turn_with_preset_attaches_the_image_without_touching_evidence(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    gemini_available: None,
    incident: None,
) -> None:
    fake = FakeStreamingClient([["That insert is badly worn."]])
    _use_client(monkeypatch, fake)

    with client.websocket_connect("/api/gemini-live/ws?session_id=copilot-img") as ws:
        ws.receive_json()
        ws.send_json(
            {"type": "user_turn", "text": "Here is the insert I removed.", "preset_id": WORN_PRESET}
        )
        messages = _collect_turn(ws)

    assert messages[-1]["type"] == "turn_complete"
    parts = fake.calls[0]["contents"][-1].parts
    image_parts = [p for p in parts if p.inline_data is not None]
    assert len(image_parts) == 1
    assert image_parts[0].inline_data.mime_type == "image/jpeg"
    assert image_parts[0].inline_data.data.startswith(b"\xff\xd8\xff")
    assert any(p.text == "Here is the insert I removed." for p in parts)
    assert blackboard.get_state().visual_evidence is None
    assert blackboard.get_state().status == "repairing"


def test_unknown_preset_is_rejected(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    gemini_available: None,
    incident: None,
) -> None:
    fake = FakeStreamingClient([["unused"]])
    _use_client(monkeypatch, fake)
    with client.websocket_connect("/api/gemini-live/ws?session_id=copilot-bad-preset") as ws:
        ws.receive_json()
        ws.send_json({"type": "user_turn", "text": "hi", "preset_id": "no-such-preset"})
        msg = ws.receive_json()
    assert msg["type"] == "error"
    assert "no-such-preset" in msg["error_message"]
    assert fake.calls == []


def test_offline_message_when_gemini_unavailable(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(live_mod, "is_gemini_vision_available", lambda: False)

    def must_not_be_called() -> Any:
        raise AssertionError("no Gemini client may be created while offline")

    monkeypatch.setattr(live_mod, "get_gemini_client", must_not_be_called)

    with client.websocket_connect("/api/gemini-live/ws?session_id=copilot-offline") as ws:
        ws.receive_json()
        ws.send_json({"type": "user_turn", "text": "What is wrong with this machine?"})
        msg = ws.receive_json()
    assert msg["type"] == "offline"
    assert "offline" in msg["error_message"].lower()
    assert "text" not in msg or not msg["text"]


def test_gemini_failure_is_reported_not_papered_over(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    gemini_available: None,
    incident: None,
) -> None:
    class Boom:
        aio = SimpleNamespace(
            models=SimpleNamespace(
                generate_content_stream=lambda **_: (_ for _ in ()).throw(RuntimeError("quota"))
            )
        )

    monkeypatch.setattr(live_mod, "get_gemini_client", lambda: Boom())
    with client.websocket_connect("/api/gemini-live/ws?session_id=copilot-boom") as ws:
        ws.receive_json()
        ws.send_json({"type": "user_turn", "text": "What is wrong with this machine?"})
        msg = ws.receive_json()
    assert msg["type"] == "error"
    assert "quota" not in msg["error_message"]


def test_interrupt_cancels_streaming_reply(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    gemini_available: None,
    incident: None,
) -> None:
    fake = FakeStreamingClient([["Step one: stop the machine. "]], hold_after=True)
    _use_client(monkeypatch, fake)
    with client.websocket_connect("/api/gemini-live/ws?session_id=copilot-int") as ws:
        ws.receive_json()
        ws.send_json({"type": "user_turn", "text": "What do I do first?"})
        assert ws.receive_json()["type"] == "text_delta"
        ws.send_json({"type": "interrupt"})
        done = ws.receive_json()
    assert done["type"] == "turn_complete"
    assert done["interrupted"] is True


def test_invalid_messages_yield_errors(client: TestClient) -> None:
    with client.websocket_connect("/api/gemini-live/ws?session_id=copilot-invalid") as ws:
        ws.receive_json()
        ws.send_text("not json")
        assert ws.receive_json()["type"] == "error"
        ws.send_json({"type": "user_turn"})
        assert ws.receive_json()["type"] == "error"
        ws.send_json({"hello": "world"})
        assert ws.receive_json()["type"] == "error"
        ws.send_bytes(b"\x00\x01\x02\x03")
        assert ws.receive_json()["type"] == "error"


def test_ping_pong(client: TestClient) -> None:
    with client.websocket_connect("/api/gemini-live/ws?session_id=copilot-ping") as ws:
        ws.receive_json()
        ws.send_json({"type": "ping"})
        assert ws.receive_json()["type"] == "pong"


def test_session_resumption_by_handle(client: TestClient) -> None:
    with client.websocket_connect("/api/gemini-live/ws?session_id=copilot-resume") as ws:
        first = ws.receive_json()
    handle = first["resumption_handle"]
    with client.websocket_connect(f"/api/gemini-live/ws?resumption_handle={handle}") as ws2:
        second = ws2.receive_json()
    assert second["session_id"] == "copilot-resume"


def test_no_simulated_or_canned_copilot_paths_remain() -> None:
    """The prod path has no keyword-matched replies, synthetic PCM audio or simulation switch."""
    root = Path(__file__).resolve().parent.parent
    sources = {
        name: (root / name).read_text(encoding="utf-8")
        for name in (
            "backend/api/routes_gemini_live.py",
            "backend/agents/agent_technician_copilot.py",
            "backend/core/config.py",
        )
    }
    for name, text in sources.items():
        for needle in (
            "generate_grounded_response",
            "generate_synthetic_pcm_chunks",
            "stream_simulated_speech",
            "simulation_mode",
            "audio_pcm_base64",
            "440",
        ):
            assert needle not in text, f"{needle!r} still present in {name}"


def test_interrupt_without_active_reply_is_acknowledged(client: TestClient) -> None:
    with client.websocket_connect("/api/gemini-live/ws?session_id=copilot-idle-int") as ws:
        ws.receive_json()
        ws.send_json({"type": "interrupt"})
        done = ws.receive_json()
    assert done["type"] == "turn_complete"
    assert done["interrupted"] is True
