"""Unit tests for Firestore persistence adapter, restart recovery, and fallback in Blackboard."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.core.blackboard import WORKFLOW_LOST_MESSAGE, Blackboard, blackboard
from backend.core.firestore_adapter import FirestoreAdapter
from backend.core.models import AgentFinding, IncidentState, MachineTelemetryPayload


class FakeDocumentSnapshot:
    """Emulates a Firestore DocumentSnapshot."""

    def __init__(self, doc_id: str, data: dict | None, exists: bool = True) -> None:
        self.id = doc_id
        self._data = data
        self.exists = exists

    def to_dict(self) -> dict | None:
        return self._data


class FakeDocumentReference:
    """Emulates a Firestore DocumentReference."""

    def __init__(self, collection: FakeCollectionReference, doc_id: str) -> None:
        self.collection = collection
        self.id = doc_id

    def set(self, data: dict) -> None:
        self.collection._store[self.id] = data

    def get(self) -> FakeDocumentSnapshot:
        if self.id in self.collection._store:
            return FakeDocumentSnapshot(self.id, self.collection._store[self.id], exists=True)
        return FakeDocumentSnapshot(self.id, None, exists=False)

    def delete(self) -> None:
        self.collection._store.pop(self.id, None)

    def on_snapshot(self, callback) -> MagicMock:
        self.collection._listeners[self.id] = callback
        watch = MagicMock()
        watch.unsubscribe = lambda: self.collection._listeners.pop(self.id, None)
        return watch


class FakeCollectionReference:
    """Emulates a Firestore CollectionReference."""

    def __init__(self) -> None:
        self._store: dict[str, dict] = {}
        self._listeners: dict[str, Any] = {}

    def document(self, doc_id: str) -> FakeDocumentReference:
        return FakeDocumentReference(self, doc_id)

    def where(self, field: str, op: str, value: Any):
        filtered = FakeCollectionReference()
        for doc_id, data in self._store.items():
            if op == "==" and data.get(field) == value:
                filtered._store[doc_id] = data
        return filtered

    def order_by(self, field: str, direction=None):
        return self

    def limit(self, count: int):
        limited = FakeCollectionReference()
        items = list(self._store.items())[:count]
        limited._store = dict(items)
        return limited

    def stream(self):
        for doc_id, data in self._store.items():
            yield FakeDocumentSnapshot(doc_id, data, exists=True)


class FakeFirestoreClient:
    """Emulates google.cloud.firestore.Client in memory."""

    def __init__(self) -> None:
        self._collections: dict[str, FakeCollectionReference] = {}

    def collection(self, name: str) -> FakeCollectionReference:
        if name not in self._collections:
            self._collections[name] = FakeCollectionReference()
        return self._collections[name]


@pytest.fixture
def fake_client() -> FakeFirestoreClient:
    return FakeFirestoreClient()


@pytest.fixture
def fake_adapter(fake_client: FakeFirestoreClient) -> FirestoreAdapter:
    return FirestoreAdapter(client=fake_client, collection="incidents")


def test_firestore_adapter_fallback_when_credentials_missing() -> None:
    """Verifies that FirestoreAdapter falls back to in-memory mode when credentials are absent."""
    with patch("google.cloud.firestore.Client", side_effect=Exception("No ADC")):
        adapter = FirestoreAdapter(client=None, emulator_host=None, fallback_to_memory=True)
        assert adapter.is_enabled is False
        assert adapter.client is None

        # Public methods return gracefully without errors
        assert adapter.save_incident(IncidentState()) is False
        assert adapter.get_incident("INC-NONEXISTENT") is None
        assert adapter.get_open_incident() is None
        assert adapter.delete_incident("INC-NONEXISTENT") is False
        assert adapter.attach_listener("INC-NONEXISTENT", lambda s: None) is None


def test_firestore_adapter_crud(fake_adapter: FirestoreAdapter) -> None:
    """Verifies save, retrieve, open-query, and delete with FirestoreAdapter."""
    state = IncidentState(
        incident_id="INC-UNIT-01",
        status="investigating",
        suspect_machine="CNC-02",
        suspect_tool="T07",
    )
    state.findings.append(
        AgentFinding(
            agent_id="TRACE",
            agent_name="Traceability Agent",
            phase="Phase B - Root Cause",
            finding="Defect cluster at CNC-02",
            evidence="18/20 parts produced by CNC-02",
            confidence=0.92,
            citation="Discrete Traceability BQ",
        )
    )

    # Save
    assert fake_adapter.save_incident(state) is True

    # Retrieve by ID
    loaded = fake_adapter.get_incident("INC-UNIT-01")
    assert loaded is not None
    assert loaded.incident_id == "INC-UNIT-01"
    assert loaded.status == "investigating"
    assert loaded.suspect_machine == "CNC-02"
    assert len(loaded.findings) == 1
    assert loaded.findings[0].confidence == 0.92

    # Query open incident
    open_inc = fake_adapter.get_open_incident()
    assert open_inc is not None
    assert open_inc.incident_id == "INC-UNIT-01"

    # Delete
    assert fake_adapter.delete_incident("INC-UNIT-01") is True
    assert fake_adapter.get_incident("INC-UNIT-01") is None
    assert fake_adapter.get_open_incident() is None


def test_firestore_adapter_skips_closed_and_normal_in_open_query(
    fake_adapter: FirestoreAdapter,
) -> None:
    """Verifies get_open_incident ignores closed, dismissed, and normal baseline incidents."""
    # 1. Normal baseline
    normal_state = IncidentState(incident_id="INC-NORM", status="normal")
    fake_adapter.save_incident(normal_state)
    assert fake_adapter.get_open_incident() is None

    # 2. Closed incident
    closed_state = IncidentState(incident_id="INC-CLOSED", status="closed")
    fake_adapter.save_incident(closed_state)
    assert fake_adapter.get_open_incident() is None

    # 3. Dismissed incident
    dismissed_state = IncidentState(incident_id="INC-DISM", status="dismissed")
    fake_adapter.save_incident(dismissed_state)
    assert fake_adapter.get_open_incident() is None

    # 4. Active open incident
    active_state = IncidentState(incident_id="INC-ACTIVE", status="repairing")
    fake_adapter.save_incident(active_state)
    open_inc = fake_adapter.get_open_incident()
    assert open_inc is not None
    assert open_inc.incident_id == "INC-ACTIVE"
    assert open_inc.status == "repairing"


def test_blackboard_persistence_on_mutations(fake_adapter: FirestoreAdapter) -> None:
    """Verifies that Blackboard state mutations automatically persist to Firestore."""
    bb = Blackboard(storage=fake_adapter)

    # 1. Update status
    bb.update_status(
        "tracing",
        incident_id="INC-MUTATION-01",
        suspect_machine="CNC-02",
    )
    persisted = fake_adapter.get_incident("INC-MUTATION-01")
    assert persisted is not None
    assert persisted.status == "tracing"
    assert persisted.suspect_machine == "CNC-02"

    # 2. Add finding
    finding = AgentFinding(
        agent_id="PROCESS",
        agent_name="Process Analyst",
        phase="Phase B - Root Cause",
        finding="Vibration spike +35%",
        evidence="Spindle vibration = 2.8 mm/s",
        confidence=0.96,
        citation="Sensors buffer",
    )
    bb.add_finding(finding)
    persisted = fake_adapter.get_incident("INC-MUTATION-01")
    assert persisted is not None
    assert len(persisted.findings) == 1
    assert persisted.findings[0].agent_id == "PROCESS"

    # 3. Set repair done
    bb.set_repair_done(True)
    persisted = fake_adapter.get_incident("INC-MUTATION-01")
    assert persisted is not None
    assert persisted.repair_done is True

    # 4. Record telemetry alert
    telemetry = MachineTelemetryPayload(
        machine_id="CNC-02",
        timestamp="2026-10-10T10:00:00Z",
        spindle_speed_rpm=2400.0,
        feed_rate_mm_min=450.0,
        spindle_vibration=2.9,
        motor_current=14.2,
        ambient_temp_c=24.0,
        tool_id="T07",
        tool_age_parts=1200,
        operating_status="ALARM",
        anomaly_score=0.88,
    )
    bb.record_telemetry(telemetry)
    persisted = fake_adapter.get_incident("INC-MUTATION-01")
    assert persisted is not None
    assert persisted.latest_telemetry is not None
    assert persisted.latest_telemetry.machine_id == "CNC-02"
    assert len(persisted.telemetry_alerts) >= 1


def test_blackboard_restart_recovery(fake_adapter: FirestoreAdapter) -> None:
    """Verifies that on backend restart, Blackboard recovers the open incident from Firestore."""
    # Process 1: Running backend creates an incident
    bb1 = Blackboard(storage=fake_adapter)
    bb1.update_status(
        "repairing",
        incident_id="INC-RECOVERY-99",
        suspect_machine="IM-05",
        suspect_tool="MOLD-03",
        defect_type="short_fill",
        defect_rate=0.082,
    )
    bb1.add_finding(
        AgentFinding(
            agent_id="RCA",
            agent_name="Root Cause Agent",
            phase="Phase B - Root Cause",
            finding="Desiccant saturation in resin hopper",
            evidence="Dew point rose to -18C",
            confidence=0.89,
            citation="Dryer telemetry & manual",
        )
    )

    # Process 2: Backend restarts (fresh Blackboard instance pointing to same storage)
    bb2 = Blackboard(storage=fake_adapter)
    # Starts at initial baseline before recovery
    assert bb2.get_state().status == "normal"

    # Reload open incident on startup
    reloaded = bb2.load_open_incident()
    assert reloaded is not None
    assert reloaded.incident_id == "INC-RECOVERY-99"
    assert reloaded.status == "repairing"
    assert reloaded.suspect_machine == "IM-05"
    assert reloaded.suspect_tool == "MOLD-03"
    assert reloaded.defect_type == "short_fill"
    assert len(reloaded.findings) == 1
    assert reloaded.findings[0].agent_id == "RCA"

    # Subsequent get_state reflects restored state
    state = bb2.get_state()
    assert state.incident_id == "INC-RECOVERY-99"
    assert state.status == "repairing"


def test_blackboard_graceful_on_persistence_error() -> None:
    """Verifies Blackboard does not crash callers when Firestore writes fail."""
    faulty_adapter = MagicMock(spec=FirestoreAdapter)
    faulty_adapter.is_enabled = True
    faulty_adapter.save_incident.side_effect = RuntimeError("Firestore connection lost")

    bb = Blackboard(storage=faulty_adapter)
    # Mutation must succeed in memory without raising
    state = bb.update_status("investigating", suspect_machine="CNC-01")
    assert state.status == "investigating"
    assert state.suspect_machine == "CNC-01"


def test_blackboard_live_snapshot_update(fake_adapter: FirestoreAdapter) -> None:
    """Verifies remote Firestore updates trigger local Blackboard state updates."""
    bb = Blackboard(storage=fake_adapter)
    bb.update_status("detecting", incident_id="INC-SNAPSHOT-01")

    # Simulate remote update arriving via Firestore watch listener
    remote_state = IncidentState(
        incident_id="INC-SNAPSHOT-01",
        status="repairing",
        suspect_machine="CNC-02",
        repair_done=False,
        revision=bb.get_state().revision + 1,
    )
    # Trigger snapshot listener
    listener = fake_adapter._client.collection("incidents")._listeners.get("INC-SNAPSHOT-01")
    assert listener is not None

    fake_doc = FakeDocumentSnapshot("INC-SNAPSHOT-01", remote_state.model_dump(mode="json"))
    listener([fake_doc], changes=None, read_time=None)

    # Local state updated
    assert bb.get_state().status == "repairing"
    assert bb.get_state().suspect_machine == "CNC-02"


def test_blackboard_ignores_stale_snapshot_echo(fake_adapter: FirestoreAdapter) -> None:
    """An out-of-order echo of this process's own earlier write must not clobber newer state."""
    bb = Blackboard(storage=fake_adapter)
    bb.update_status("detecting", incident_id="INC-ECHO-01")
    earlier = bb.get_state().model_dump(mode="json")
    bb.add_finding(
        AgentFinding(
            agent_id="doc",
            agent_name="Incident Scribe",
            phase="Phase C",
            finding="8D drafted",
            evidence="e",
            confidence=0.9,
            citation="c",
        )
    )

    listener = fake_adapter._client.collection("incidents")._listeners["INC-ECHO-01"]
    listener([FakeDocumentSnapshot("INC-ECHO-01", earlier)], changes=None, read_time=None)

    assert [f.agent_name for f in bb.get_state().findings] == ["Incident Scribe"]


@pytest.mark.asyncio
async def test_blackboard_subscribe_yields_persisted_state(fake_adapter: FirestoreAdapter) -> None:
    """Verifies SSE subscribe stream emits initial state and subsequent mutations."""
    bb = Blackboard(storage=fake_adapter)
    bb.update_status("detecting", incident_id="INC-SSE-01")

    gen = bb.subscribe()
    initial_event = await anext(gen)
    assert "INC-SSE-01" in initial_event
    assert "detecting" in initial_event

    # Update blackboard
    bb.update_status("investigating", incident_id="INC-SSE-01")
    next_event = await anext(gen)
    assert "investigating" in next_event

    # Clean up generator
    await gen.aclose()


def test_api_current_incident_recovers_state_on_restart(fake_adapter: FirestoreAdapter) -> None:
    """Verifies GET /api/incidents/current recovers persisted open incident after backend restart."""
    # Pre-populate Firestore with open incident
    fake_adapter.save_incident(
        IncidentState(
            incident_id="INC-API-RESTART",
            status="repairing",
            suspect_machine="CNC-02",
            suspect_tool="T07",
            verification_count=0,
            verification_target=50,
        )
    )

    # Inject fake adapter into global singleton blackboard
    blackboard.set_storage(fake_adapter)
    blackboard.reset()

    # Use TestClient with lifespan which triggers load_open_incident() on startup
    with TestClient(app) as client:
        response = client.get("/api/incidents/current")
        assert response.status_code == 200
        data = response.json()
        assert data["incident_id"] == "INC-API-RESTART"
        assert data["status"] == "repairing"
        assert data["suspect_machine"] == "CNC-02"
        assert data["suspect_tool"] == "T07"

    # Reset blackboard back to baseline
    blackboard.reset()
    blackboard.set_storage(None)


@pytest.mark.parametrize(
    ("persisted", "expected"),
    [("investigating", "error"), ("analyzing", "error"), ("repairing", "repairing")],
)
def test_recovered_in_flight_incident_is_marked_error(
    fake_adapter: FirestoreAdapter, persisted: str, expected: str
) -> None:
    """A workflow lost to a restart cannot resume: its incident lands as `error`, persisted."""
    fake_adapter.save_incident(IncidentState(incident_id="INC-LOST", status=persisted))
    board = Blackboard(storage=fake_adapter)

    state = board.load_open_incident()

    assert state is not None
    assert state.status == expected
    stored = fake_adapter.get_incident("INC-LOST")
    assert stored is not None and stored.status == expected
    if expected == "error":
        assert state.status_reason == WORKFLOW_LOST_MESSAGE
        assert stored.status_reason == WORKFLOW_LOST_MESSAGE
    board.set_storage(None)


def test_firestore_adapter_list_incidents(fake_adapter: FirestoreAdapter) -> None:
    """Verifies that FirestoreAdapter lists incidents with filtering."""
    fake_adapter.save_incident(
        IncidentState(
            incident_id="INC-HIST-1",
            status="closed",
            suspect_machine="CNC-02",
            verification_count=50,
        )
    )
    fake_adapter.save_incident(
        IncidentState(
            incident_id="INC-HIST-2",
            status="investigating",
            suspect_machine="IM-05",
        )
    )

    all_incs = fake_adapter.list_incidents(limit=10)
    assert len(all_incs) == 2
    ids = {i.incident_id for i in all_incs}
    assert ids == {"INC-HIST-1", "INC-HIST-2"}

    closed_incs = fake_adapter.list_incidents(status="closed")
    assert len(closed_incs) == 1
    assert closed_incs[0].incident_id == "INC-HIST-1"


def test_api_get_incident_history_endpoint(fake_adapter: FirestoreAdapter) -> None:
    """Verifies GET /api/incidents/history returns incident summaries."""
    fake_adapter.save_incident(
        IncidentState(
            incident_id="INC-API-HIST-1",
            status="closed",
            suspect_machine="CNC-02",
            suspect_tool="T07",
            verification_count=50,
            verification_target=50,
            approved=True,
        )
    )
    blackboard.set_storage(fake_adapter)

    with TestClient(app) as client:
        response = client.get("/api/incidents/history")
        assert response.status_code == 200
        items = response.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        found = next((x for x in items if x["incident_id"] == "INC-API-HIST-1"), None)
        assert found is not None
        assert found["status"] == "closed"
        assert found["approved"] is True
        assert found["suspect_machine"] == "CNC-02"

        # Filter by status
        resp_filtered = client.get("/api/incidents/history?status=closed")
        assert resp_filtered.status_code == 200
        assert all(x["status"] == "closed" for x in resp_filtered.json())

    blackboard.reset()
    blackboard.set_storage(None)

