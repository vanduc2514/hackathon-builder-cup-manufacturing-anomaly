"""ADK CLI entry: exposes the incident workflow as root_agent for `adk run` / `adk web`."""

from __future__ import annotations

from backend.agents.agent_orchestrator import incident_workflow
from backend.core.llm import configure_default_model

configure_default_model()
root_agent = incident_workflow
