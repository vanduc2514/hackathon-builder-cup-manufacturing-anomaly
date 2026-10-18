"""Tests for archiving incidents: Blackboard flag, Orchestrator gate and the archive API."""

from __future__ import annotations

import asyncio
import json
from typing import Generator
from unittest.mock import MagicMock

import pytest
from starlette.testclient import TestClient

from backend.agents.orchestrator import IncidentInProgressError, orchestrator
from backend.api.main import app
from backend.core.blackboard import Blackboard, blackboard
from backend.core.firestore_adapter import FirestoreAdapter
from backend.core.models import IncidentState


@pytest.fixture(autouse=True)
def clean_global_blackboard() -> Generator[None, None, None]:
    """Starts and ends every test with an empty global board and history."""
    blackboard.reset()
    blackboard._history.clear()
    yield
    blackboard.reset()
    blackboard._history.clear()


def _local_board() -> Blackboard:
    storage = MagicMock(spec=FirestoreAdapter)
    storage.is_enabled = False
    return Blackboard(storage=storage)


def _ids(incidents: list[IncidentState]) -> list[str]:
    return [inc.incident_id for inc in incidents]


def test_archiving_live_incident_stamps_notifies_once_and_is_idempotent() -> None:
    board = _local_board()
    board.update_status("closed", incident_id="INC-A")
    queue: asyncio.Queue = asyncio.Queue()
    board._listeners.append(queue)

    state = board.archive_incident("INC-A", "lead")

    assert state is not None
    assert state.archived is True
    assert state.archived_by == "lead"
    assert state.archived_at is not None
    assert board.get_state().archived is True
    assert queue.qsize() == 1
    assert json.loads(queue.get_nowait())["archived"] is True

    again = board.archive_incident("INC-A", "someone-else")
    assert again is not None
    assert again.archived_by == "lead"
    assert queue.qsize() == 0


def test_archiving_historical_incident_flips_only_that_incident_and_filters_history() -> None:
    board = _local_board()
    board.update_status("closed", incident_id="INC-A")
    board.reset()
    board.update_status("repairing", incident_id="INC-B")

    archived = board.archive_incident("INC-A", "lead")

    assert archived is not None and archived.archived is True
    assert board.get_state().incident_id == "INC-B"
    assert board.get_state().archived is False
    by_id = {inc.incident_id: inc for inc in board.list_incidents()}
    assert by_id["INC-A"].archived is True
    assert by_id["INC-B"].archived is False
    assert _ids(board.list_incidents(archived=False)) == ["INC-B"]
    assert _ids(board.list_incidents(archived=True)) == ["INC-A"]
    assert board.archive_incident("INC-NOPE", "lead") is None


def test_archive_filter_scans_past_the_limit_on_firestore() -> None:
    storage = MagicMock(spec=FirestoreAdapter)
    storage.is_enabled = True
    storage.list_incidents.return_value = [
        IncidentState(incident_id="INC-1", status="closed", archived=True),
        IncidentState(incident_id="INC-2", status="closed"),
        IncidentState(incident_id="INC-3", status="closed"),
    ]
    board = Blackboard(storage=storage)

    assert _ids(board.list_incidents(limit=1, archived=False)) == ["INC-2"]
    assert storage.list_incidents.call_args.kwargs["limit"] > 1
    assert _ids(board.list_incidents(limit=5)) == ["INC-1", "INC-2", "INC-3"]


def test_archiving_historical_firestore_incident_persists_with_bumped_revision() -> None:
    storage = MagicMock(spec=FirestoreAdapter)
    storage.is_enabled = True
    storage.get_incident.return_value = IncidentState(
        incident_id="INC-OLD", status="closed", revision=4
    )
    storage.save_incident.return_value = True
    board = Blackboard(storage=storage)

    archived = board.archive_incident("INC-OLD", "lead")

    assert archived is not None
    storage.save_incident.assert_called_once()
    saved = storage.save_incident.call_args.args[0]
    assert saved.incident_id == "INC-OLD"
    assert saved.archived is True
    assert saved.archived_by == "lead"
    assert saved.revision == 5


def test_archiving_historical_firestore_incident_raises_when_save_fails() -> None:
    storage = MagicMock(spec=FirestoreAdapter)
    storage.is_enabled = True
    storage.get_incident.return_value = IncidentState(incident_id="INC-OLD", status="closed")
    storage.save_incident.return_value = False
    board = Blackboard(storage=storage)

    with pytest.raises(RuntimeError, match="INC-OLD"):
        board.archive_incident("INC-OLD", "lead")


@pytest.mark.parametrize("status", ["repairing", "pending_approval"])
def test_orchestrator_refuses_to_archive_live_incident_in_progress(status: str) -> None:
    blackboard.update_status(status, incident_id="INC-LIVE")

    with pytest.raises(IncidentInProgressError, match="still in progress"):
        orchestrator.archive_incident("INC-LIVE", archived_by="lead")
    assert blackboard.get_state().archived is False


def test_orchestrator_archives_escalated_live_and_in_progress_historical_incidents() -> None:
    blackboard.update_status("repairing", incident_id="INC-OLD")
    blackboard.reset()
    blackboard.update_status("escalated", incident_id="INC-LIVE")

    live = orchestrator.archive_incident("INC-LIVE", archived_by="lead")
    historical = orchestrator.archive_incident("INC-OLD", archived_by="lead")

    assert live is not None and live.archived is True
    assert historical is not None and historical.archived is True
    assert historical.status == "repairing"


def test_archive_api_contract_and_history_filter() -> None:
    client = TestClient(app)
    blackboard.update_status("closed", incident_id="INC-A")
    blackboard.reset()
    blackboard.update_status("verifying", incident_id="INC-B")

    resp = client.post("/api/incidents/INC-A/archive")
    assert resp.status_code == 200
    body = resp.json()
    assert body["incident_id"] == "INC-A"
    assert body["archived"] is True
    assert body["archived_by"] == "test"
    assert body["archived_at"]

    assert client.post("/api/incidents/INC-NOPE/archive").status_code == 404

    conflict = client.post("/api/incidents/INC-B/archive")
    assert conflict.status_code == 409
    assert "still in progress" in conflict.json()["detail"]

    unarchived = client.get("/api/incidents/history", params={"archived": "false"}).json()
    assert [row["incident_id"] for row in unarchived] == ["INC-B"]
    archived = client.get("/api/incidents/history", params={"archived": "true"}).json()
    assert [row["incident_id"] for row in archived] == ["INC-A"]
    everything = client.get("/api/incidents/history").json()
    assert {row["incident_id"] for row in everything} == {"INC-A", "INC-B"}
