"""Unit tests for Copilot OEM manual API routes."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.models import OemRepairManual

client = TestClient(app)


def test_get_manual_cnc02_success() -> None:
    """Verifies GET /api/copilot/manuals/CNC-02 returns valid OEM manual and checkpoints."""
    response = client.get("/api/copilot/manuals/CNC-02")
    assert response.status_code == 200

    data = response.json()
    assert data["machine_id"] == "CNC-02"
    assert "CNC-02" in data["title"]
    assert "CNC-02" in data["citation"]
    assert isinstance(data["checkpoints"], list)
    assert len(data["checkpoints"]) >= 5
    assert len(data["parts"]) > 0

    # Pydantic validation
    parsed = OemRepairManual.model_validate(data)
    assert parsed.machine_id == "CNC-02"
    assert len(parsed.checkpoints) >= 5


def test_get_manual_im05_success() -> None:
    """Verifies GET /api/copilot/manuals/IM-05 returns valid OEM manual and checkpoints."""
    response = client.get("/api/copilot/manuals/IM-05")
    assert response.status_code == 200

    data = response.json()
    assert data["machine_id"] == "IM-05"
    assert "IM-05" in data["title"]
    assert isinstance(data["checkpoints"], list)
    assert len(data["checkpoints"]) >= 5


def test_get_manual_case_insensitive_fuzzy() -> None:
    """Verifies GET /api/copilot/manuals/{machine_id} supports case-insensitive lookups."""
    response = client.get("/api/copilot/manuals/cnc-02")
    assert response.status_code == 200
    assert response.json()["machine_id"] == "CNC-02"


def test_get_manual_unknown_returns_404() -> None:
    """Verifies GET /api/copilot/manuals/{unknown} returns 404 Not Found."""
    response = client.get("/api/copilot/manuals/UNKNOWN-MACHINE-99")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.real_auth
def test_get_manual_requires_auth() -> None:
    """Verifies GET /api/copilot/manuals requires authentication token under real_auth."""
    response = client.get("/api/copilot/manuals/CNC-02")
    assert response.status_code == 401
