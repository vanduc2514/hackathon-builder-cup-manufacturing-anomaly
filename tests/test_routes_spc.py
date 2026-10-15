"""Tests for Statistical Process Control (SPC) series API routes."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.models import SpcSeriesResponse

client = TestClient(app)


def test_get_spc_series_success():
    """Verify GET /api/spc/series returns 200, valid SpcSeriesResponse, and matches blackboard UCL."""
    current_ucl = blackboard.get_state().spc_ucl

    response = client.get("/api/spc/series")
    assert response.status_code == 200

    data = response.json()
    assert data["ucl"] == current_ucl
    assert data["window"] == 60
    assert data["subgroup"] == 20
    assert data["centerline"] == 0.005
    assert data["source"] in ("bigquery", "mock_buffer", "seed")
    assert 0.0 <= data["peak_rate"] <= 1.0

    # Ensure validation by Pydantic model succeeds
    parsed = SpcSeriesResponse.model_validate(data)
    assert parsed.ucl == current_ucl
    assert len(parsed.points) > 0
    for p in parsed.points:
        assert 0.0 <= p.defect_rate <= 1.0
        assert p.subgroup_n > 0


def test_get_spc_series_machine_filter():
    """Verify machine_id filter is passed through and restricts records."""
    response = client.get("/api/spc/series?machine_id=CNC-02")
    assert response.status_code == 200
    data = response.json()
    assert data["machine_id"] == "CNC-02"
    for p in data["points"]:
        assert p["machine_id"] == "CNC-02"


def test_get_spc_series_window_bounds_validation():
    """Verify window parameter bounds ge=10, le=500 return 422 on violations."""
    resp_under = client.get("/api/spc/series?window=9")
    assert resp_under.status_code == 422

    resp_over = client.get("/api/spc/series?window=501")
    assert resp_over.status_code == 422

    resp_valid = client.get("/api/spc/series?window=10")
    assert resp_valid.status_code == 200
    assert resp_valid.json()["window"] == 10


def test_get_spc_series_subgroup_bounds_validation():
    """Verify subgroup parameter bounds ge=5, le=100 return 422 on violations."""
    resp_under = client.get("/api/spc/series?subgroup=4")
    assert resp_under.status_code == 422

    resp_over = client.get("/api/spc/series?subgroup=101")
    assert resp_over.status_code == 422

    resp_valid = client.get("/api/spc/series?subgroup=5")
    assert resp_valid.status_code == 200
    assert resp_valid.json()["subgroup"] == 5


@pytest.mark.real_auth
def test_get_spc_series_requires_auth():
    """Verify /api/spc/series requires authentication token under real_auth."""
    response = client.get("/api/spc/series")
    assert response.status_code == 401
