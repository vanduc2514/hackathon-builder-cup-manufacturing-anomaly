"""Integration tests for POST /api/incidents/evidence/preset and evidence submission gatekeeping."""

from __future__ import annotations

import io

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


def test_post_preset_flank_wear_confirms_defect_and_relative_url():
    """Attaching flank wear preset returns defect=True, VB=0.38, and relative web image URL."""
    blackboard.update_status("awaiting_evidence", suspect_machine="CNC-02", suspect_tool="T07")
    client = TestClient(app)

    response = client.post(
        "/api/incidents/evidence/preset",
        json={"preset_id": "preset-flank-wear-vb38", "notes": "Inspected cutting edge"},
    )
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "success"
    assert data["incident_status"] == "awaiting_evidence"

    # Validate evidence payload
    ev = data["evidence"]
    assert ev["preset_id"] == "preset-flank-wear-vb38"
    assert ev["defect_detected"] is True
    assert ev["wear_measurement_mm"] == 0.38
    assert ev["image_url"] == "/presets/evidence/preset_flank_wear_vb38.jpg"
    assert "Users" not in ev["image_url"]
    assert ev["citation"] == "Benchmark preset preset-flank-wear-vb38 (curated ground truth)"

    # Validate finding
    finding = data["finding"]
    assert "confir" in finding["finding"].lower()
    assert "preset-flank-wear-vb38" in finding["finding"]
    assert "Ghi chú: Inspected cutting edge" in finding["evidence"]

    # Verify blackboard state snapshot
    state = blackboard.get_state()
    assert state.status == "awaiting_evidence"
    assert state.visual_evidence is not None
    assert state.visual_evidence.wear_measurement_mm == 0.38
    assert state.visual_evidence.preset_id == "preset-flank-wear-vb38"


def test_post_preset_normal_tool_confirms_nominal_baseline():
    """Attaching normal tool preset returns defect=False, VB=0.04, and nominal finding."""
    blackboard.update_status("awaiting_evidence", suspect_machine="CNC-02", suspect_tool="T07")
    client = TestClient(app)

    response = client.post(
        "/api/incidents/evidence/preset",
        json={"preset_id": "preset-normal-tool-t07"},
    )
    assert response.status_code == 200

    data = response.json()
    ev = data["evidence"]
    assert ev["preset_id"] == "preset-normal-tool-t07"
    assert ev["defect_detected"] is False
    assert ev["wear_measurement_mm"] == 0.04
    assert ev["image_url"] == "/presets/evidence/preset_normal_tool_t07.jpg"

    finding = data["finding"]
    assert "nominal" in finding["finding"].lower()
    assert ev["citation"] == "Benchmark preset preset-normal-tool-t07 (curated ground truth)"


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
        json={"preset_id": "preset-flank-wear-vb38"},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "The AI is not waiting for evidence right now"


@pytest.mark.parametrize("status", ["normal", "closed", "analyzing", "investigating", "repairing"])
def test_post_upload_evidence_outside_awaiting_evidence_returns_409(status: str):
    """POST /api/incidents/evidence returns 409 when AI is not awaiting evidence."""
    blackboard.update_status(status)
    client = TestClient(app)

    fake_file = io.BytesIO(b"\xff\xd8\xff\xe0" + b"dummypixels" * 10)
    response = client.post(
        "/api/incidents/evidence",
        files={"file": ("test_tool.jpg", fake_file, "image/jpeg")},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "The AI is not waiting for evidence right now"


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
        json={"preset_id": "preset-flank-wear-vb38"},
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
        json={"preset_id": "preset-flank-wear-vb38"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert auth_resp.status_code == 200
