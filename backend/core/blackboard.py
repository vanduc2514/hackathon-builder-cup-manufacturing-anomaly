"""Core Blackboard: Shared incident state reader/writer implementing the blackboard pattern."""

import asyncio
from typing import AsyncGenerator
from backend.core.models import IncidentState, AgentFinding, ImpactMetrics


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

    def add_finding(self, finding: AgentFinding) -> IncidentState:
        self._state.findings.append(finding)
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
