"""Core Blackboard: Shared incident state reader/writer implementing the blackboard pattern."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator, Callable

from backend.core.config import settings
from backend.core.firestore_adapter import FirestoreAdapter, get_firestore_adapter
from backend.core.models import (
    AgentFinding,
    HandoverNote,
    IncidentState,
    MachineTelemetryPayload,
    TelemetryAlert,
    VisualEvidencePayload,
)

logger = logging.getLogger(__name__)

# Rows scanned when filtering history on `archived`: legacy Firestore docs lack the field, so
# the filter runs in Python over a wider window instead of as a Firestore query.
HISTORY_SCAN_LIMIT = 200

# Statuses that mean a workflow is (or was) mid-flight. If the workflow ends or the process
# restarts while the board is in one of these, the incident can never finish: mark it `error`.
# External waits (awaiting_evidence, repairing, pending_approval) are excluded on purpose: a
# technician or shift leader can still act on those.
UNFINISHED_STATUSES: frozenset[str] = frozenset(
    {"detecting", "tracing", "investigating", "analyzing", "verifying"}
)
WORKFLOW_LOST_MESSAGE = (
    "Workflow was interrupted before analysis finished. Re-inject the scenario to re-run it."
)


class Blackboard:
    """Reactive blackboard representing Firestore shared incident state."""

    def __init__(self, storage: FirestoreAdapter | None = None) -> None:
        self._state = IncidentState()
        self._history: list[IncidentState] = []
        self._listeners: list[asyncio.Queue] = []
        self._storage = storage if storage is not None else get_firestore_adapter()
        self._listener_unsubscribe: Callable[[], None] | None = None
        self._current_listening_incident_id: str | None = None

    def get_state(self) -> IncidentState:
        return self._state

    def reset(self) -> IncidentState:
        if self._state.incident_id and self._state.status != "normal":
            self._record_in_history(self._state)
        self._detach_listener()
        self._state = IncidentState()
        self._notify()
        return self._state

    def _record_in_history(self, incident: IncidentState) -> None:
        """Stores incident snapshot into the in-memory fallback ring buffer."""
        if not incident.incident_id or incident.status == "normal":
            return
        for i, existing in enumerate(self._history):
            if existing.incident_id == incident.incident_id:
                self._history[i] = incident
                return
        self._history.insert(0, incident)
        if len(self._history) > 50:
            self._history = self._history[:50]

    def list_incidents(
        self, limit: int = 20, status: str | None = None, archived: bool | None = None
    ) -> list[IncidentState]:
        """Lists incidents from Firestore if enabled, or falls back to in-memory history buffer."""
        if self.is_firestore_enabled and self._storage:
            fetch_limit = limit if archived is None else HISTORY_SCAN_LIMIT
            results = self._storage.list_incidents(limit=fetch_limit, status=status)
            if results:
                matches = [inc for inc in results if archived is None or inc.archived == archived]
                return matches[:limit]

        # In-memory fallback: sync current active/closed incident if present
        if self._state.incident_id and self._state.status != "normal":
            self._record_in_history(self._state)

        filtered = [
            inc
            for inc in self._history
            if (not status or inc.status == status)
            and (archived is None or inc.archived == archived)
        ]
        return filtered[:limit]

    def set_archived(
        self, incident_id: str, archived: bool, archived_by: str | None = None
    ) -> IncidentState | None:
        """Sets or clears an incident's archive flag (archived ones are hidden from the technician app); idempotent, None if unknown."""
        if archived:
            stamp = {
                "archived": True,
                "archived_by": archived_by,
                "archived_at": datetime.now(timezone.utc).isoformat(),
            }
        else:
            stamp = {"archived": False, "archived_by": None, "archived_at": None}
        if incident_id == self._state.incident_id and self._state.status != "normal":
            if self._state.archived == archived:
                return self._state
            update_dict = self._state.model_dump()
            update_dict.update(stamp)
            self._state = IncidentState(**update_dict)
            self._record_in_history(self._state)
            self._notify()
            self._persist()
            return self._state

        found: IncidentState | None = None
        if self.is_firestore_enabled:
            found = self._storage.get_incident(incident_id)
        if found is None:
            found = next((inc for inc in self._history if inc.incident_id == incident_id), None)
        if found is None:
            return None
        if found.archived == archived:
            return found

        archived_inc = found.model_copy(update={**stamp, "revision": found.revision + 1})
        self._record_in_history(archived_inc)
        if self.is_firestore_enabled and not self._storage.save_incident(archived_inc):
            raise RuntimeError(f"Failed to persist archive flag for {incident_id}")
        return archived_inc

    def update_status(self, status: str, **kwargs) -> IncidentState:
        update_dict = self._state.model_dump()
        update_dict["status"] = status
        if status != "normal" and not update_dict.get("opened_at") and not kwargs.get("opened_at"):
            update_dict["opened_at"] = datetime.now(timezone.utc).isoformat()
        if (
            status in ("closed", "dismissed")
            and not update_dict.get("closed_at")
            and not kwargs.get("closed_at")
        ):
            update_dict["closed_at"] = datetime.now(timezone.utc).isoformat()
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        update_dict.update(kwargs)
        self._state = IncidentState(**update_dict)
        self._record_in_history(self._state)
        self._notify()
        self._persist()
        return self._state

    def set_repair_done(self, repair_done: bool = True) -> IncidentState:
        update_dict = self._state.model_dump()
        update_dict["repair_done"] = repair_done
        self._state = IncidentState(**update_dict)
        self._notify()
        self._persist()
        return self._state

    def add_finding(self, finding: AgentFinding) -> IncidentState:
        self._state.findings.append(finding)
        self._notify()
        self._persist()
        return self._state

    def add_handover_note(self, note: HandoverNote) -> IncidentState:
        """Appends a technician shift handover note to the incident and persists/notifies."""
        self._state.handover_notes.append(note)
        self._record_in_history(self._state)
        self._notify()
        self._persist()
        return self._state

    def attach_field_evidence(
        self,
        finding: AgentFinding,
        visual_evidence: VisualEvidencePayload | None = None,
    ) -> IncidentState:
        """Attaches technician diagnostic field evidence and optional visual payload without clobbering status."""
        update_dict = self._state.model_dump()
        if visual_evidence:
            update_dict["visual_evidence"] = visual_evidence.model_dump()
        update_dict["diagnostic_request"] = None
        self._state = IncidentState(**update_dict)
        self._state.findings.append(finding)
        self._record_in_history(self._state)
        self._notify()
        self._persist()
        return self._state

    def record_telemetry(self, telemetry: MachineTelemetryPayload) -> IncidentState:
        """Records latest telemetry and creates alert if anomaly threshold is breached."""
        self._state.latest_telemetry = telemetry

        is_anomalous = (
            telemetry.anomaly_score >= settings.mqtt_anomaly_threshold
            or telemetry.operating_status in ("WARNING", "ALARM")
        )

        if is_anomalous:
            metric_name = "anomaly_score"
            metric_value = telemetry.anomaly_score
            threshold = settings.mqtt_anomaly_threshold

            if telemetry.spindle_vibration >= 2.5:
                metric_name = "spindle_vibration"
                metric_value = telemetry.spindle_vibration
                threshold = 2.5
            elif telemetry.motor_current >= 13.0:
                metric_name = "motor_current"
                metric_value = telemetry.motor_current
                threshold = 13.0

            alert = TelemetryAlert(
                machine_id=telemetry.machine_id,
                timestamp=telemetry.timestamp,
                anomaly_score=telemetry.anomaly_score,
                operating_status=telemetry.operating_status,
                metric_name=metric_name,
                metric_value=metric_value,
                threshold=threshold,
                message=(
                    f"Anomalous telemetry on {telemetry.machine_id}: "
                    f"{metric_name}={metric_value:.2f} (threshold={threshold})"
                ),
            )
            self._state.telemetry_alerts.append(alert)
            if len(self._state.telemetry_alerts) > 50:
                self._state.telemetry_alerts = self._state.telemetry_alerts[-50:]

            if self._state.status == "normal":
                self._state.status = "detecting"
                self._state.suspect_machine = telemetry.machine_id
                if telemetry.tool_id:
                    self._state.suspect_tool = telemetry.tool_id

        self._notify()
        self._persist()
        return self._state

    def load_open_incident(self, incident_id: str | None = None) -> IncidentState | None:
        """Reloads the open incident from Firestore into this Blackboard (restart recovery)."""
        if not self._storage or not self._storage.is_enabled:
            return None

        loaded = (
            self._storage.get_incident(incident_id)
            if incident_id
            else self._storage.get_open_incident()
        )
        if loaded:
            self._state = loaded
            self._notify()
            self._attach_listener(loaded.incident_id)
            logger.info(
                "Recovered incident %s (status: %s) from Firestore",
                loaded.incident_id,
                loaded.status,
            )
            if loaded.status in UNFINISHED_STATUSES:
                self.update_status("error", status_reason=WORKFLOW_LOST_MESSAGE)
                logger.warning(
                    "Recovered incident %s was in-flight (%s) and cannot resume: marked error",
                    loaded.incident_id,
                    loaded.status,
                )
            return self._state
        return None

    def reload_from_storage(self) -> IncidentState | None:
        """Alias for load_open_incident()."""
        return self.load_open_incident()

    def set_storage(self, storage: FirestoreAdapter | None) -> None:
        """Configures or swaps the backing FirestoreAdapter (testing utility)."""
        self._detach_listener()
        self._storage = storage

    @property
    def is_firestore_enabled(self) -> bool:
        return bool(self._storage and self._storage.is_enabled)

    def _persist(self) -> None:
        """Saves current state to Firestore and attaches live listener if enabled."""
        if not self.is_firestore_enabled:
            return
        # Each local write gets a higher revision, so the listener can tell this process's own
        # (possibly out-of-order) snapshot echoes from genuinely newer remote writes.
        self._state.revision += 1
        try:
            self._storage.save_incident(self._state)
            self._attach_listener(self._state.incident_id)
        except Exception as exc:
            logger.warning(
                "Blackboard persistence failed for incident %s: %s",
                self._state.incident_id,
                exc,
            )

    def _attach_listener(self, incident_id: str) -> None:
        if not self.is_firestore_enabled:
            return
        if self._current_listening_incident_id == incident_id:
            return
        self._detach_listener()
        self._current_listening_incident_id = incident_id
        self._listener_unsubscribe = self._storage.attach_listener(
            incident_id, self._on_remote_update
        )

    def _detach_listener(self) -> None:
        if self._listener_unsubscribe:
            try:
                self._listener_unsubscribe()
            except Exception:
                pass
            self._listener_unsubscribe = None
        self._current_listening_incident_id = None

    def _on_remote_update(self, new_state: IncidentState) -> None:
        stale = (
            new_state.incident_id == self._state.incident_id
            and new_state.revision <= self._state.revision
        )
        if stale or new_state.model_dump() == self._state.model_dump():
            return
        self._state = new_state
        self._notify()

    def _notify(self) -> None:
        data = self._state.model_dump_json()
        for q in list(self._listeners):
            try:
                loop = getattr(q, "_loop", None)
                if loop and loop.is_running():
                    loop.call_soon_threadsafe(self._safe_enqueue, q, data)
                else:
                    q.put_nowait(data)
            except (asyncio.QueueFull, RuntimeError):
                pass

    @staticmethod
    def _safe_enqueue(q: asyncio.Queue, data: str) -> None:
        try:
            q.put_nowait(data)
        except asyncio.QueueFull:
            pass

    async def subscribe(self) -> AsyncGenerator[str, None]:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        q._loop = asyncio.get_running_loop()
        self._listeners.append(q)
        try:
            # Yield initial state
            yield self._state.model_dump_json()
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield data
                except asyncio.TimeoutError:
                    pass
        finally:
            if q in self._listeners:
                self._listeners.remove(q)


# Global singleton blackboard instance
blackboard = Blackboard()
