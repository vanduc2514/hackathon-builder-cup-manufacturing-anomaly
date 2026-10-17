"""API route tests for GET /api/presets/evidence."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.core.config import settings
from backend.core.models import AuthAccount, AuthRole

SECRET = "test-auth-secret-presets-gallery-012345"
TECH = AuthAccount(
    username="technician",
    password="pw-tech",
    role=AuthRole.TECHNICIAN,
    display_name="Frontline Tech",
)


def test_get_preset_evidence_gallery_success():
    """GET /api/presets/evidence returns the benchmark presets + competition extras."""
    client = TestClient(app)
    response = client.get("/api/presets/evidence")
    assert response.status_code == 200

    data = response.json()
    assert "presets" in data
    assert len(data["presets"]) >= 5

    preset_ids = [p["id"] for p in data["presets"]]
    assert "preset-im05-normal" in preset_ids
    assert "preset-im05-surface-scratch" in preset_ids
    assert "preset-im05-crack" in preset_ids
    assert "preset-im05-fracture" in preset_ids
    assert "preset-im05-assembly-gap" in preset_ids

    # Verify no absolute filesystem paths or localhost addresses
    for p in data["presets"]:
        assert p["image_url"].startswith("/presets/evidence/")
        assert p["thumbnail_url"].startswith("/presets/evidence/")
        assert "http" not in p["image_url"]
        assert "Users" not in p["image_url"]


@pytest.mark.real_auth
def test_get_preset_evidence_gallery_real_auth_gate(monkeypatch: pytest.MonkeyPatch):
    """Under real_auth, GET /api/presets/evidence requires a valid Bearer token."""
    monkeypatch.setattr(settings, "auth_secret", SECRET)
    monkeypatch.setattr(settings, "auth_users", [TECH])

    client = TestClient(app)

    # 1. Anonymous request rejected
    anon_resp = client.get("/api/presets/evidence")
    assert anon_resp.status_code == 401

    # 2. Login to acquire JWT token
    login_resp = client.post(
        "/api/auth/login",
        json={"username": "technician", "password": "pw-tech"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["token"]

    # 3. Authenticated request accepted
    auth_resp = client.get(
        "/api/presets/evidence",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert auth_resp.status_code == 200
    body = auth_resp.json()
    assert len(body["presets"]) >= 5
