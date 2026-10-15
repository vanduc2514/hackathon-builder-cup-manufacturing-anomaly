"""Tests for ESG impact ledger endpoint and aggregation logic."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.models import (
    EsgLedgerResponse,
    ImpactMetrics,
    IncidentState,
)
from backend.tools.impact_calculator import build_esg_ledger

client = TestClient(app)


def _make_incident(
    incident_id: str,
    status: str = "closed",
    approved: bool = True,
    scrap_avoided: int = 100,
    downtime_minutes: int = 30,
    energy_kwh: float = 15.123,
    co2_kg: float = 10.456,
    energy_co2_kg: float = 6.234,
    material_co2_kg: float = 4.222,
    cost_savings_usd: float = 1500.555,
    factory_type: str = "aluminum_cnc",
    closed_at: str | None = "2026-10-15T10:00:00Z",
    updated_at: str = "2026-10-15T10:05:00Z",
    has_impact: bool = True,
) -> IncidentState:
    impact = (
        ImpactMetrics(
            scrap_avoided=scrap_avoided,
            downtime_minutes=downtime_minutes,
            energy_kwh=energy_kwh,
            co2_kg=co2_kg,
            energy_co2_kg=energy_co2_kg,
            material_co2_kg=material_co2_kg,
            cost_savings_usd=cost_savings_usd,
            factory_type=factory_type,
        )
        if has_impact
        else None
    )
    return IncidentState(
        incident_id=incident_id,
        status=status,
        approved=approved,
        impact=impact,
        closed_at=closed_at,
        updated_at=updated_at,
    )


# ---------------------------------------------------------------------------
# Unit tests for build_esg_ledger
# ---------------------------------------------------------------------------


def test_build_esg_ledger_empty():
    """Empty list returns zero totals, empty entries, default factory_type."""
    res = build_esg_ledger([])
    assert isinstance(res, EsgLedgerResponse)
    assert res.entries == []
    assert res.factory_type == "aluminum_cnc"
    assert res.totals.incidents == 0
    assert res.totals.scrap_avoided == 0
    assert res.totals.downtime_minutes == 0
    assert res.totals.energy_kwh == 0.0
    assert res.totals.co2_kg == 0.0
    assert res.totals.energy_co2_kg == 0.0
    assert res.totals.material_co2_kg == 0.0
    assert res.totals.cost_savings_usd == 0.0


def test_build_esg_ledger_filtering():
    """Only closed, approved incidents with non-None impact are retained."""
    incidents = [
        # Kept
        _make_incident("INC-KEPT", status="closed", approved=True, has_impact=True),
        # Excluded: not closed
        _make_incident("INC-OPEN", status="repairing", approved=True, has_impact=True),
        _make_incident("INC-INVESTIGATING", status="investigating", approved=True, has_impact=True),
        # Excluded: not approved
        _make_incident("INC-UNAPPROVED", status="closed", approved=False, has_impact=True),
        # Excluded: no impact
        _make_incident("INC-NO-IMPACT", status="closed", approved=True, has_impact=False),
    ]

    res = build_esg_ledger(incidents)
    assert len(res.entries) == 1
    assert res.entries[0].incident_id == "INC-KEPT"
    assert res.totals.incidents == 1


def test_build_esg_ledger_ordering_and_factory_type():
    """Entries are ordered newest-first by closed_at (fallback updated_at), factory_type from newest."""
    incidents = [
        _make_incident(
            "INC-OLD",
            closed_at="2026-10-14T08:00:00Z",
            factory_type="pcb_electronics_assembly",
        ),
        _make_incident(
            "INC-NEWEST",
            closed_at="2026-10-15T12:00:00Z",
            factory_type="abs_injection_molding",
        ),
        _make_incident(
            "INC-FALLBACK-UPDATE",
            closed_at=None,
            updated_at="2026-10-15T09:00:00Z",
            factory_type="aluminum_cnc",
        ),
    ]

    res = build_esg_ledger(incidents)
    assert len(res.entries) == 3
    # Order: INC-NEWEST (12:00), INC-FALLBACK-UPDATE (09:00), INC-OLD (14th)
    assert [e.incident_id for e in res.entries] == [
        "INC-NEWEST",
        "INC-FALLBACK-UPDATE",
        "INC-OLD",
    ]
    # Factory type resolved from newest entry
    assert res.factory_type == "abs_injection_molding"


def test_build_esg_ledger_deduplication():
    """Duplicate incident IDs are deduplicated, keeping newest entry."""
    incidents = [
        _make_incident(
            "INC-001",
            closed_at="2026-10-15T12:00:00Z",
            scrap_avoided=500,
        ),
        _make_incident(
            "INC-001",
            closed_at="2026-10-15T10:00:00Z",
            scrap_avoided=200,
        ),
    ]

    res = build_esg_ledger(incidents)
    assert len(res.entries) == 1
    assert res.entries[0].incident_id == "INC-001"
    assert res.entries[0].impact.scrap_avoided == 500
    assert res.totals.scrap_avoided == 500


def test_build_esg_ledger_sum_and_rounding():
    """Validates summation of all 7 numeric fields with floats rounded to 2 decimal places."""
    inc1 = _make_incident(
        "INC-1",
        closed_at="2026-10-15T10:00:00Z",
        scrap_avoided=120,
        downtime_minutes=45,
        energy_kwh=19.1234,
        co2_kg=12.5678,
        energy_co2_kg=7.6543,
        material_co2_kg=4.9135,
        cost_savings_usd=1800.256,
    )
    inc2 = _make_incident(
        "INC-2",
        closed_at="2026-10-15T11:00:00Z",
        scrap_avoided=80,
        downtime_minutes=15,
        energy_kwh=10.4561,
        co2_kg=6.4321,
        energy_co2_kg=4.1234,
        material_co2_kg=2.3087,
        cost_savings_usd=1200.751,
    )

    res = build_esg_ledger([inc1, inc2])
    assert res.totals.incidents == 2
    assert res.totals.scrap_avoided == 200
    assert res.totals.downtime_minutes == 60
    assert res.totals.energy_kwh == round(19.1234 + 10.4561, 2)
    assert res.totals.co2_kg == round(12.5678 + 6.4321, 2)
    assert res.totals.energy_co2_kg == round(7.6543 + 4.1234, 2)
    assert res.totals.material_co2_kg == round(4.9135 + 2.3087, 2)
    assert res.totals.cost_savings_usd == round(1800.256 + 1200.751, 2)


# ---------------------------------------------------------------------------
# Route tests for GET /api/impact/ledger
# ---------------------------------------------------------------------------


def test_get_esg_ledger_success(monkeypatch):
    """GET /api/impact/ledger returns 200 and matches EsgLedgerResponse schema."""
    seeded = [
        _make_incident("INC-01", status="closed", approved=True, scrap_avoided=100),
        _make_incident("INC-02", status="closed", approved=False, scrap_avoided=50),
        _make_incident("INC-03", status="closed", approved=True, scrap_avoided=200),
    ]

    monkeypatch.setattr(
        blackboard,
        "list_incidents",
        lambda limit=100, status=None: seeded[:limit],
    )

    response = client.get("/api/impact/ledger")
    assert response.status_code == 200

    data = response.json()
    parsed = EsgLedgerResponse.model_validate(data)
    assert parsed.totals.incidents == 2
    assert parsed.totals.scrap_avoided == 300
    assert len(parsed.entries) == 2
    # Ensure unapproved INC-02 is excluded
    entry_ids = [e.incident_id for e in parsed.entries]
    assert "INC-02" not in entry_ids
    assert "INC-01" in entry_ids
    assert "INC-03" in entry_ids


def test_get_esg_ledger_limit_query_param(monkeypatch):
    """Query parameter limit is forwarded and bounded."""
    recorded_limit = {}

    def mock_list(limit=100, status=None):
        recorded_limit["limit"] = limit
        return []

    monkeypatch.setattr(blackboard, "list_incidents", mock_list)

    # Valid limit
    response = client.get("/api/impact/ledger?limit=50")
    assert response.status_code == 200
    assert recorded_limit["limit"] == 50

    # Bounds: 0 is invalid (ge=1)
    response_invalid = client.get("/api/impact/ledger?limit=0")
    assert response_invalid.status_code == 422

    # Bounds: 201 is invalid (le=200)
    response_over = client.get("/api/impact/ledger?limit=201")
    assert response_over.status_code == 422


def test_get_esg_ledger_read_only(monkeypatch):
    """GET /api/impact/ledger is read-only and leaves Blackboard state untouched."""
    initial_findings_count = len(blackboard.get_state().findings)
    initial_status = blackboard.get_state().status

    response = client.get("/api/impact/ledger")
    assert response.status_code == 200

    current_state = blackboard.get_state()
    assert len(current_state.findings) == initial_findings_count
    assert current_state.status == initial_status


@pytest.mark.real_auth
def test_get_esg_ledger_requires_auth():
    """Verify /api/impact/ledger endpoint requires authentication under real_auth."""
    response = client.get("/api/impact/ledger")
    assert response.status_code == 401
