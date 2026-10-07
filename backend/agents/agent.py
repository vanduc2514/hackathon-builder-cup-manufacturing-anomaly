"""ADK CLI entry: exposes the incident workflow as root_agent for `adk run` / `adk web`."""

from __future__ import annotations

from backend.agents.orchestrator import incident_workflow

root_agent = incident_workflow
