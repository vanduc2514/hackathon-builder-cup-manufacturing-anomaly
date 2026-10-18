"""Integration tests for POST /api/incidents/evidence/preset and evidence submission gatekeeping."""

from __future__ import annotations

import io
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import (
    AuthAccount,
    AuthRole,
    InsertInspectionResult,
    PartInspectionResult,
    VisualInspectionResult,
)
from backend.tools import gemini_vision_tool as vision_tool
from backend.tools import preset_catalog

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


def _fake_gemini(monkeypatch: pytest.MonkeyPatch, *results) -> MagicMock:
    """Routes Gemini Vision through a fake client returning the given parsed results in order."""
    items = list(results)
    client = MagicMock()
    client.models.generate_content.side_effect = lambda **_kw: SimpleNamespace(
        parsed=items.pop(0), text=None
    )
    monkeypatch.setattr(vision_tool, "is_gemini_vision_available", lambda: True)
    monkeypatch.setattr(vision_tool, "get_gemini_client", lambda: client)
    return client


def _scratch(confidence: float = 0.77) -> PartInspectionResult:
    return PartInspectionResult(
        defect_class="scratch_vertical", severity=4, region="left edge", confidence=confidence
    )


QA_PRESET = "preset-cnc02-defect-scratch-vertical-flickr-ansik"


def test_post_preset_qa_defect_uses_gemini_result(monkeypatch: pytest.MonkeyPatch):
    """A matching model result is reported with source gemini and the model's own confidence."""
    monkeypatch.setattr(settings, "demo_scripted", True)
    client = _fake_gemini(monkeypatch, _scratch())
    blackboard.update_status("awaiting_evidence", suspect_machine="CNC-02", suspect_tool="T07")

    response = TestClient(app).post(
        "/api/incidents/evidence/preset", json={"preset_id": QA_PRESET, "notes": "close-up"}
    )
    assert response.status_code == 200
    data = response.json()
    ev = data["evidence"]
    assert ev["source"] == "gemini"
    assert ev["defect_detected"] is True
    assert ev["preset_id"] == QA_PRESET
    assert ev["image_url"] == "/presets/evidence/cnc02/defect_scratch_vertical_flickr_ansik.jpg"
    assert "scratch vertical detected, severity 4/5, region left edge" in ev["analysis"]
    assert data["finding"]["confidence"] == 0.77
    assert "scripted expectation" not in data["finding"]["evidence"]
    assert "Ghi chú: close-up" in data["finding"]["evidence"]
    assert preset_catalog.get_preset(QA_PRESET).analysis not in str(data)
    assert client.models.generate_content.call_count == 1
    assert blackboard.get_state().visual_evidence.source == "gemini"


def test_post_preset_scripted_mismatch_falls_back(monkeypatch: pytest.MonkeyPatch):
    """DEMO_SCRIPTED: two wrong model answers yield the expected class with source fallback."""
    monkeypatch.setattr(settings, "demo_scripted", True)
    none = PartInspectionResult(
        defect_class="none", severity=1, region="center", confidence=0.99
    )
    _fake_gemini(monkeypatch, none, none)
    blackboard.update_status("awaiting_evidence", suspect_machine="CNC-02", suspect_tool="T07")

    response = TestClient(app).post("/api/incidents/evidence/preset", json={"preset_id": QA_PRESET})
    assert response.status_code == 200
    data = response.json()
    assert data["evidence"]["source"] == "fallback"
    assert data["evidence"]["defect_detected"] is True
    assert data["finding"]["confidence"] == 0.9
    assert "scripted expectation" in data["finding"]["evidence"]
    assert preset_catalog.get_preset(QA_PRESET).analysis not in str(data)


def test_post_preset_worn_insert_runs_insert_inspection(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "demo_scripted", False)
    _fake_gemini(
        monkeypatch,
        InsertInspectionResult(
            flank_wear="severe", edge_chipping=True, replace_insert=True, confidence=0.88
        ),
    )
    blackboard.update_status("awaiting_evidence", suspect_machine="CNC-02", suspect_tool="T07")

    response = TestClient(app).post(
        "/api/incidents/evidence/preset",
        json={"preset_id": "preset-cnc02-tool-worn-insert-commons-bautsch-cc0"},
    )
    data = response.json()
    assert response.status_code == 200
    assert data["evidence"]["source"] == "gemini"
    assert data["evidence"]["defect_detected"] is True
    assert "flank wear severe" in data["evidence"]["analysis"]
    assert data["finding"]["confidence"] == 0.88


def test_post_preset_im05_uses_free_form_analysis(monkeypatch: pytest.MonkeyPatch):
    """IM-05 presets run the free-form analysis; DEMO_SCRIPTED pins defect_detected."""
    monkeypatch.setattr(settings, "demo_scripted", True)
    _fake_gemini(
        monkeypatch,
        VisualInspectionResult(
            analysis="Model says the housing looks fine.", defect_detected=False, confidence=0.6
        ),
    )
    blackboard.update_status("awaiting_evidence", suspect_machine="IM-05", suspect_tool="MOLD-03")

    response = TestClient(app).post(
        "/api/incidents/evidence/preset", json={"preset_id": "preset-im05-crack"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["evidence"]["source"] == "fallback"
    assert data["evidence"]["defect_detected"] is True
    assert data["evidence"]["image_url"] == "/presets/evidence/preset_im05_crack.jpg"
    assert data["finding"]["confidence"] == 0.9


def test_post_preset_im05_unscripted_keeps_model_output(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "demo_scripted", False)
    _fake_gemini(
        monkeypatch,
        VisualInspectionResult(
            analysis="Hairline crack along the sidewall.", defect_detected=True, confidence=0.71
        ),
    )
    blackboard.update_status("awaiting_evidence", suspect_machine="IM-05", suspect_tool="MOLD-03")

    data = TestClient(app).post(
        "/api/incidents/evidence/preset", json={"preset_id": "preset-im05-crack"}
    ).json()
    assert data["evidence"]["source"] == "gemini"
    assert data["evidence"]["analysis"] == "Hairline crack along the sidewall."
    assert data["finding"]["confidence"] == 0.71


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
