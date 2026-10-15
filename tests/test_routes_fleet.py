"""Tests for Fleet Registry API endpoints."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.models import FleetRegistryResponse

client = TestClient(app)


def test_get_fleet_success():
    """Verify GET /api/fleet returns 200 OK and conforms to FleetRegistryResponse schema."""
    response = client.get("/api/fleet")
    assert response.status_code == 200

    data = response.json()
    assert data["line_id"] == "cell-line-1"
    assert data["line_name"] == "Cell Line 1"
    assert 0.0 <= data["planned_availability"] <= 1.0
    assert data["mttr_target_minutes"] > 0
    assert 0.0 <= data["oee_target"] <= 1.0

    parsed = FleetRegistryResponse.model_validate(data)
    assert len(parsed.assets) == 4
    asset_ids = {a.machine_id for a in parsed.assets}
    assert asset_ids == {"CNC-01", "CNC-02", "CNC-03", "IM-05"}

    # Validate IM-05 is on_demand
    im05 = next(a for a in parsed.assets if a.machine_id == "IM-05")
    assert im05.on_demand is True
    assert im05.machine_type == "im"

    # Validate CNC machines are not on_demand
    for cnc_id in ("CNC-01", "CNC-02", "CNC-03"):
        cnc = next(a for a in parsed.assets if a.machine_id == cnc_id)
        assert cnc.on_demand is False
        assert cnc.machine_type == "cnc"


def test_get_fleet_trailing_slash():
    """Verify GET /api/fleet/ also succeeds with 200 OK."""
    response = client.get("/api/fleet/")
    assert response.status_code == 200
    assert response.json()["line_id"] == "cell-line-1"


@pytest.mark.real_auth
def test_get_fleet_requires_auth():
    """Verify /api/fleet endpoint requires authentication under real_auth."""
    response = client.get("/api/fleet")
    assert response.status_code == 401
