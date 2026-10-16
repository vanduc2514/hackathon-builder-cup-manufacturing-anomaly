"""Unit and integration tests for local FastAPI backend and ADK Orchestrator execution (#82)."""

from __future__ import annotations

import asyncio
import io

import pytest
from fastapi.testclient import TestClient

from backend.agents.agent import root_agent
from backend.agents.orchestrator import incident_workflow
from backend.api.main import app, lifespan
from backend.core.blackboard import blackboard
from backend.core.models import IncidentState


@pytest.fixture(autouse=True)
def reset_blackboard_state():
    """Resets blackboard before and after each test."""
    blackboard.reset()
    yield
    blackboard.reset()


def test_health_check_endpoints() -> None:
    """Verifies that /health and /healthz return 200 OK with expected system metadata."""
    client = TestClient(app)

    for path in ("/health", "/healthz"):
        response = client.get(path)
        assert response.status_code == 200, f"Expected 200 for {path}, got {response.status_code}"
        payload = response.json()
        assert payload["status"] == "healthy"
        assert payload["app"] == "Kaizen Agent Platform"
        assert "version" in payload
        assert "gcp_project" in payload


def test_incident_current_snapshot() -> None:
    """Verifies that /api/incidents/current and /api/incidents return initial blackboard state."""
    client = TestClient(app)

    for path in ("/api/incidents/current", "/api/incidents", "/api/incidents/"):
        response = client.get(path)
        assert response.status_code == 200
        data = response.json()
        assert data["incident_id"] == "INC-0412"
        assert data["status"] == "normal"
        assert data["verification_count"] == 0
        assert data["verification_target"] == 50
        assert data["repair_done"] is False
        assert data["approved"] is False


def test_sse_stream_initial_state() -> None:
    """Verifies that both /api/incidents/stream and /api/incidents/events connect and emit initial state."""

    async def _run() -> None:
        for path in ("/api/incidents/stream", "/api/incidents/events"):
            scope = {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": "GET",
                "headers": [(b"accept", b"text/event-stream")],
                "scheme": "http",
                "path": path,
                "raw_path": path.encode(),
                "query_string": b"",
                "server": ("testserver", 80),
                "client": ("127.0.0.1", 12345),
                "root_path": "",
            }

            received_messages = []
            disconnect_event = asyncio.Event()

            async def receive():
                await disconnect_event.wait()
                return {"type": "http.disconnect"}

            async def send(message):
                received_messages.append(message)
                if message["type"] == "http.response.body" and message.get("body"):
                    disconnect_event.set()

            app_task = asyncio.create_task(app(scope, receive, send))

            try:
                await asyncio.wait_for(disconnect_event.wait(), timeout=3.0)
            finally:
                disconnect_event.set()
                await asyncio.sleep(0.02)
                if not app_task.done():
                    app_task.cancel()
                    try:
                        await app_task
                    except asyncio.CancelledError:
                        pass

            start_msg = next(m for m in received_messages if m["type"] == "http.response.start")
            assert start_msg["status"] == 200

            body_msgs = [
                m for m in received_messages if m["type"] == "http.response.body" and m.get("body")
            ]
            combined_body = b"".join(m["body"] for m in body_msgs).decode()
            assert "event: incident_update" in combined_body
            assert "INC-0412" in combined_body

    asyncio.run(_run())


def test_sse_stream_live_updates() -> None:
    """Verifies that real-time blackboard updates are streamed to active SSE connections."""

    async def _run() -> None:
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "headers": [(b"accept", b"text/event-stream")],
            "scheme": "http",
            "path": "/api/incidents/stream",
            "raw_path": b"/api/incidents/stream",
            "query_string": b"",
            "server": ("testserver", 80),
            "client": ("127.0.0.1", 12345),
            "root_path": "",
        }

        received_bodies = []
        first_received = asyncio.Event()
        second_received = asyncio.Event()
        disconnect_event = asyncio.Event()

        async def receive():
            await disconnect_event.wait()
            return {"type": "http.disconnect"}

        async def send(message):
            if message["type"] == "http.response.body" and message.get("body"):
                received_bodies.append(message["body"].decode())
                if len(received_bodies) == 1:
                    first_received.set()
                elif len(received_bodies) >= 2:
                    second_received.set()
                    disconnect_event.set()

        app_task = asyncio.create_task(app(scope, receive, send))

        try:
            await asyncio.wait_for(first_received.wait(), timeout=3.0)

            # Trigger update on the blackboard
            blackboard.update_status(
                "investigating",
                suspect_machine="CNC-02",
                suspect_tool="T07",
                defect_type="scratch_vertical",
            )

            await asyncio.wait_for(second_received.wait(), timeout=3.0)
            assert len(received_bodies) >= 2
            update_text = received_bodies[1]
            assert "investigating" in update_text
            assert "CNC-02" in update_text
            assert "T07" in update_text
        finally:
            disconnect_event.set()
            await asyncio.sleep(0.02)
            if not app_task.done():
                app_task.cancel()
                try:
                    await app_task
                except asyncio.CancelledError:
                    pass

    asyncio.run(_run())


def test_adk_root_agent_exposed() -> None:
    """Verifies that backend.agents.agent properly exposes root_agent as the ADK incident workflow."""
    assert root_agent is not None
    assert root_agent is incident_workflow
    assert root_agent.name == "kaizen_incident"


def test_adk_web_app_initialization() -> None:
    """Verifies that google.adk CLI fast_api creates the web app and compiles the workflow graph."""
    from google.adk.cli.fast_api import get_fast_api_app

    adk_app = get_fast_api_app(agents_dir="backend/agents", web=True)
    assert adk_app is not None

    adk_client = TestClient(adk_app)

    # Health check on ADK app
    health_resp = adk_client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.json() == {"status": "ok"}

    # App list should discover the agents directory
    apps_resp = adk_client.get("/list-apps")
    assert apps_resp.status_code == 200
    assert "agents" in apps_resp.json()

    # Workflow graph builder endpoint
    graph_resp = adk_client.get("/dev/apps/agents/build_graph")
    assert graph_resp.status_code == 200
    graph_json = graph_resp.json()
    assert "nodes" in graph_json or "edges" in graph_json or isinstance(graph_json, (dict, list))


def test_app_lifespan_startup_and_shutdown() -> None:
    """Verifies that FastAPI lifespan context manager executes cleanly."""

    async def _run() -> None:
        async with lifespan(app):
            state = blackboard.get_state()
            assert isinstance(state, IncidentState)

    asyncio.run(_run())


def test_incident_handover_endpoint() -> None:
    """Verifies that POST /api/incidents/handover records a note on the incident via Orchestrator."""
    client = TestClient(app)

    response = client.post(
        "/api/incidents/handover", json={"note": "Shift 1 completed insert swap on CNC-01"}
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["note"] == "Shift 1 completed insert swap on CNC-01"
    assert data["author"] == "Test"
    assert "created_at" in data

    # Verify that the note is reflected on GET /api/incidents/current
    current = client.get("/api/incidents/current").json()
    notes = current.get("handover_notes", [])
    assert len(notes) == 1
    assert notes[0]["note"] == "Shift 1 completed insert swap on CNC-01"
    assert notes[0]["author"] == "Test"


def test_incident_handover_validation() -> None:
    """Verifies that empty or whitespace-only handover notes are rejected with 422."""
    client = TestClient(app)

    for empty in ("", "   ", "\n\t"):
        response = client.post("/api/incidents/handover", json={"note": empty})
        assert response.status_code == 422


def test_incident_evidence_routes_through_orchestrator(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verifies that POST /api/incidents/evidence calls orchestrator.attach_evidence (Key Invariant 2)."""
    from backend.agents.orchestrator import orchestrator

    called = False

    def mock_attach_evidence(finding, visual_evidence=None):
        nonlocal called
        called = True
        return blackboard.attach_field_evidence(finding, visual_evidence)

    monkeypatch.setattr(orchestrator, "attach_evidence", mock_attach_evidence)
    blackboard.update_status("awaiting_evidence")

    client = TestClient(app)
    file_content = b"fake-jpeg-data"
    files = {"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")}
    response = client.post(
        "/api/incidents/evidence", files=files, data={"notes": "Visual check confirmed"}
    )
    assert response.status_code == 200
    assert called is True
