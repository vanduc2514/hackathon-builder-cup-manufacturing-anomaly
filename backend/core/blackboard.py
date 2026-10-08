"""Core Blackboard: Shared incident state reader/writer implementing the blackboard pattern."""

from __future__ import annotations

import asyncio
import logging
from typing import AsyncGenerator

from backend.core.config import settings
from backend.core.models import (
    AgentFinding,
    IncidentState,
    MachineTelemetryPayload,
    TelemetryAlert,
)

logger = logging.getLogger(__name__)


class Blackboard:
    """In-memory reactive blackboard representing Firestore shared incident state."""

    def __init__(self):
        self._state = IncidentState()
        self._listeners: list[asyncio.Queue] = []

    def get_state(self) -> IncidentState:
        return self._state

    def reset(self) -> IncidentState:
        self._state = IncidentState()
        self._notify()
        return self._state

    def update_status(self, status: str, **kwargs) -> IncidentState:
        update_dict = self._state.model_dump()
        update_dict["status"] = status
        update_dict.update(kwargs)
        self._state = IncidentState(**update_dict)
        self._notify()
        return self._state

    def set_repair_done(self, repair_done: bool = True) -> IncidentState:
        update_dict = self._state.model_dump()
        update_dict["repair_done"] = repair_done
        self._state = IncidentState(**update_dict)
        self._notify()
        return self._state

    def add_finding(self, finding: AgentFinding) -> IncidentState:
        self._state.findings.append(finding)
        self._notify()
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
        return self._state

    def _notify(self):
        data = self._state.model_dump_json()
        for q in self._listeners:
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                pass

    async def subscribe(self) -> AsyncGenerator[str, None]:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._listeners.append(q)
        try:
            # Yield initial state
            yield self._state.model_dump_json()
            while True:
                data = await q.get()
                yield data
        finally:
            if q in self._listeners:
                self._listeners.remove(q)


# Global singleton blackboard instance
blackboard = Blackboard()
