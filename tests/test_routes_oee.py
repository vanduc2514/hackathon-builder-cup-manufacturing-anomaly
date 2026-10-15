"""Tests for real-time OEE API endpoints."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.models import LineOeeResponse

client = TestClient(app)


def test_get_line_oee_success():
    """Verify GET /api/oee returns valid LineOeeResponse with all machines and losses."""
    response = client.get("/api/oee")
    assert response.status_code == 200

    data = response.json()
    assert data["line_id"] == "cell-line-1"
    assert data["target"] == 0.85
    assert 0.0 <= data["availability"] <= 1.0
    assert 0.0 <= data["performance"] <= 1.0
    assert 0.0 <= data["quality"] <= 1.0
    assert 0.0 <= data["oee"] <= 1.0

    # Ensure validation by Pydantic model succeeds
    parsed = LineOeeResponse.model_validate(data)
    assert len(parsed.machines) == 3
    machine_ids = {m.machine_id for m in parsed.machines}
    assert machine_ids == {"CNC-01", "CNC-02", "CNC-03"}

    # Losses
    assert len(parsed.losses) == 4
    kinds = {loss.kind for loss in parsed.losses}
    assert kinds == {"planned_stop", "unplanned_downtime", "speed", "quality"}

    # Series
    assert len(parsed.series) > 0


def test_get_line_oee_query_params():
    """Verify window_minutes and line_id query parameters."""
    response = client.get("/api/oee?line_id=cell-line-1&window_minutes=120")
    assert response.status_code == 200
    data = response.json()
    assert data["line_id"] == "cell-line-1"


def test_get_line_oee_validation_error():
    """Verify out-of-range window_minutes triggers validation error."""
    response = client.get("/api/oee?window_minutes=2")
    assert response.status_code == 422


@pytest.mark.real_auth
def test_get_line_oee_requires_auth():
    """Verify /api/oee endpoint requires authentication token."""
    response = client.get("/api/oee")
    assert response.status_code == 401
