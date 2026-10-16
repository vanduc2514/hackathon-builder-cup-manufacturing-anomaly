"""Integration tests for POST /api/incidents/evidence/preset and evidence submission gatekeeping."""

from __future__ import annotations

import io
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import AuthAccount, AuthRole

SECRET = "test-auth-secret-preset-evidence-endpoints"
TECH = AuthAccount(
    username="technician",
    password="pw-tech",
    role=AuthRole.TECHNICIAN,
    display_name="Frontline Tech",
)


@pytest.fixture(autouse=True)
def setup_blackboard():
    blackboard.reset()
    yield
    blackboard.reset()


def test_post_preset_crack_confirms_defect_and_relative_url():
    """Attaching crack preset returns defect=True, wear=None, and relative web image URL."""
    blackboard.update_status("awaiting_evidence", suspect_machine="IM-05", suspect_tool="MOLD-03")
    client = TestClient(app)

    response = client.post(
        "/api/incidents/evidence/preset",
        json={"preset_id": "preset-im05-crack", "notes": "Inspected housing sidewall"},
    )
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "success"
    assert data["incident_status"] == "awaiting_evidence"

    # Validate evidence payload
    ev = data["evidence"]
    assert ev["preset_id"] == "preset-im05-crack"
    assert ev["defect_detected"] is True
    assert ev["wear_measurement_mm"] is None
    assert ev["image_url"] == "/presets/evidence/preset_im05_crack.jpg"
    assert "Users" not in ev["image_url"]
    assert ev["citation"] == "Benchmark preset preset-im05-crack (curated ground truth)"

    # Validate finding
    finding = data["finding"]
    assert "confir" in finding["finding"].lower()
    assert "preset-im05-crack" in finding["finding"]
    assert "Ghi chú: Inspected housing sidewall" in finding["evidence"]

    # Verify blackboard state snapshot
    state = blackboard.get_state()
    assert state.status == "awaiting_evidence"
    assert state.visual_evidence is not None
    assert state.visual_evidence.wear_measurement_mm is None
    assert state.visual_evidence.preset_id == "preset-im05-crack"


def test_post_preset_normal_tool_confirms_nominal_baseline():
    """Attaching normal tool preset returns defect=False, wear=None, and nominal finding."""
    blackboard.update_status("awaiting_evidence", suspect_machine="IM-05", suspect_tool="MOLD-03")
    client = TestClient(app)

    response = client.post(
        "/api/incidents/evidence/preset",
        json={"preset_id": "preset-im05-normal"},
    )
    assert response.status_code == 200

    data = response.json()
    ev = data["evidence"]
    assert ev["preset_id"] == "preset-im05-normal"
    assert ev["defect_detected"] is False
    assert ev["wear_measurement_mm"] is None
    assert ev["image_url"] == "/presets/evidence/preset_im05_normal.jpg"

    finding = data["finding"]
    assert "nominal" in finding["finding"].lower()
    assert ev["citation"] == "Benchmark preset preset-im05-normal (curated ground truth)"


def test_post_preset_unknown_returns_404():
    """Attempting to attach a nonexistent preset ID returns 404."""
    blackboard.update_status("awaiting_evidence")
    client = TestClient(app)

    response = client.post(
        "/api/incidents/evidence/preset",
        json={"preset_id": "nonexistent-preset-id"},
    )
    assert response.status_code == 404
    assert "Preset evidence not found" in response.json()["detail"]


@pytest.mark.parametrize("status", ["normal", "closed", "analyzing", "investigating", "repairing"])
def test_post_preset_outside_awaiting_evidence_returns_409(status: str):
    """POST /api/incidents/evidence/preset returns 409 when AI is not awaiting evidence."""
    blackboard.update_status(status)
    client = TestClient(app)

    response = client.post(
        "/api/incidents/evidence/preset",
        json={"preset_id": "preset-im05-crack"},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "The AI is not waiting for evidence right now"


@pytest.mark.parametrize("status", ["normal", "closed", "analyzing", "investigating", "repairing"])
def test_post_upload_evidence_outside_awaiting_evidence_returns_409(status: str):
    """POST /api/incidents/evidence returns 409 when AI is not awaiting evidence."""
    blackboard.update_status(status)
    client = TestClient(app)

    fake_file = io.BytesIO(bytes([0xFF, 0xD8, 0xFF, 0xE0]) + b"dummypixels" * 10)
    response = client.post(
        "/api/incidents/evidence",
        files={"file": ("test_tool.jpg", fake_file, "image/jpeg")},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "The AI is not waiting for evidence right now"


def test_domain_error_mapped_to_409():
    """When orchestrator.attach_evidence raises EvidenceNotAwaitedError, route maps it to 409."""
    import backend.api.routes_incidents as routes_incidents
    blackboard.update_status("awaiting_evidence")
    client = TestClient(app)

    err = routes_incidents.EvidenceNotAwaitedError("Simulated domain rejection")
    with patch.object(routes_incidents.orchestrator, "attach_evidence", side_effect=err):
        response = client.post(
            "/api/incidents/evidence/preset",
            json={"preset_id": "preset-im05-crack"},
        )
        assert response.status_code == 409
        assert response.json()["detail"] == "Simulated domain rejection"


@pytest.mark.real_auth
def test_post_preset_evidence_real_auth_gate(monkeypatch: pytest.MonkeyPatch):
    """POST /api/incidents/evidence/preset enforces authentication under real_auth."""
    monkeypatch.setattr(settings, "auth_secret", SECRET)
    monkeypatch.setattr(settings, "auth_users", [TECH])
    blackboard.update_status("awaiting_evidence")

    client = TestClient(app)

    # 1. Anonymous rejected
    anon_resp = client.post(
        "/api/incidents/evidence/preset",
        json={"preset_id": "preset-im05-crack"},
    )
    assert anon_resp.status_code == 401

    # 2. Login
    login_resp = client.post(
        "/api/auth/login",
        json={"username": "technician", "password": "pw-tech"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["token"]

    # 3. Authenticated accepted
    auth_resp = client.post(
        "/api/incidents/evidence/preset",
        json={"preset_id": "preset-im05-crack"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert auth_resp.status_code == 200
