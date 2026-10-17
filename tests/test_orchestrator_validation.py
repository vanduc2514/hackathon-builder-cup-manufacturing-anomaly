"""Orchestrator FindingDraft validation: retry-on-truncated-JSON, safe-default-on-failure.

Drives ``_safe_validate_finding_draft`` directly to cover the three failure modes
called out in TKT-263 (issue #263): missing required field, wrong type for
confidence, truncated JSON. Also verifies the per-agent citation attribute and
that the orchestrator's ``run_incident`` path catches ``ValidationError`` and
sets a stable ``status_reason``.
"""

from __future__ import annotations

import json
import logging
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from backend.agents.orchestrator import Orchestrator, _safe_validate_finding_draft
from backend.core.models import (
    FINDING_SAFE_DEFAULT_CONFIDENCE,
    FINDING_SAFE_DEFAULT_EVIDENCE,
    FINDING_SAFE_DEFAULT_TEXT,
    FindingDraft,
)

VALID_FINDING = json.dumps(
    {
        "finding": "Vibration jumped 30% above baseline in the last 60s window.",
        "evidence": "vibration_rms mean 0.41 vs baseline 0.31",
        "confidence": 0.88,
        "citation": "bigquery:cnc_02",
    }
)


def test_safe_validate_happy_path() -> None:
    """Valid JSON deserialises into a FindingDraft unchanged."""
    draft = _safe_validate_finding_draft(VALID_FINDING, agent_name="quality_inspector")
    assert isinstance(draft, FindingDraft)
    assert draft.confidence == 0.88
    assert draft.citation == "bigquery:cnc_02"


def test_safe_validate_missing_field_returns_safe_default(caplog) -> None:
    """Missing required field -> skip retry, return safe default with citation=agent_name."""
    bad = json.dumps(
        {
            "finding": "Something happened.",
            "evidence": "raw telemetry spike",
            # 'confidence' missing -> ValidationError
        }
    )
    with caplog.at_level(logging.WARNING, logger="backend.agents.orchestrator"):
        draft = _safe_validate_finding_draft(bad, agent_name="process_analyst")
    assert draft.finding == FINDING_SAFE_DEFAULT_TEXT
    assert draft.evidence == FINDING_SAFE_DEFAULT_EVIDENCE
    assert draft.confidence == FINDING_SAFE_DEFAULT_CONFIDENCE
    assert draft.citation == "process_analyst"
    # The warning must reference the producing agent name so operators can locate it.
    assert any("process_analyst" in rec.message for rec in caplog.records)
    # We never retry for missing/wrong-type errors — only one log line per call.
    validation_records = [
        r
        for r in caplog.records
        if "FindingDraft" in r.message and "safe default" in r.message
    ]
    assert len(validation_records) == 1


def test_safe_validate_wrong_type_confidence_returns_safe_default(caplog) -> None:
    """Wrong type for confidence (string instead of float) -> ValidationError -> safe default."""
    bad = json.dumps(
        {
            "finding": "Type mismatch on confidence.",
            "evidence": "model emitted confidence='high'",
            "confidence": "high",  # wrong type
            "citation": "bigquery",
        }
    )
    with caplog.at_level(logging.WARNING, logger="backend.agents.orchestrator"):
        draft = _safe_validate_finding_draft(bad, agent_name="root_cause")
    assert draft.finding == FINDING_SAFE_DEFAULT_TEXT
    assert draft.confidence == FINDING_SAFE_DEFAULT_CONFIDENCE
    assert draft.citation == "root_cause"


def test_safe_validate_truncated_json_attempts_one_retry_then_safe_default(
    caplog, monkeypatch
) -> None:
    """Truncated JSON triggers a single retry; persistent failure -> safe default.

    We monkeypatch the retry path to assert that we call ``model_validate_json``
    exactly twice: first attempt on the truncated input, second attempt on the
    same input (retry is best-effort and runs against the same payload — the
    retry's only purpose is to let the LlmAgent driver re-fetch from upstream).
    The orchestrator never tries more than once.
    """
    truncated = '{"finding": "Spike", "evidence": "vibration j'  # cut mid-value
    call_count = {"n": 0}

    real_validate = FindingDraft.model_validate_json

    def counting_validate(raw: str, *args, **kwargs):  # type: ignore[no-untyped-def]
        call_count["n"] += 1
        return real_validate(raw, *args, **kwargs)

    monkeypatch.setattr(FindingDraft, "model_validate_json", counting_validate)

    with caplog.at_level(logging.ERROR, logger="backend.agents.orchestrator"):
        draft = _safe_validate_finding_draft(truncated, agent_name="traceability")

    # First attempt raises JSONDecodeError -> second attempt raises again -> safe default.
    assert call_count["n"] == 2
    assert draft.finding == FINDING_SAFE_DEFAULT_TEXT
    assert draft.confidence == FINDING_SAFE_DEFAULT_CONFIDENCE
    assert draft.citation == "traceability"
    # The error log must reference the truncated-JSON retry exhaustion.
    assert any(
        "after retry" in rec.message and "traceability" in rec.message
        for rec in caplog.records
    )


def test_safe_validate_citation_is_agent_name() -> None:
    """The citation on the safe default is always the calling agent's name."""
    payload = "not-json-at-all"
    draft = _safe_validate_finding_draft(payload, agent_name="incident_scribe")
    assert draft.citation == "incident_scribe"


@pytest.mark.asyncio
async def test_run_incident_validation_error_sets_stable_status(
    monkeypatch, caplog
) -> None:
    """``run_incident`` must catch ``ValidationError`` from the ADK runner and surface a
    Blackboard ``error`` with the stable ``status_reason`` string from the brief.

    The orchestrator instance is built with a MockLlm (already registered as the
    default model by the test conftest) and we monkeypatch ``InMemoryRunner.run_async``
    to raise ``ValidationError`` so we can assert the blackboard state without driving
    a full LLM round-trip.
    """
    from backend.core.blackboard import blackboard
    from backend.core.models import DefectInjectionRequest

    def fake_run_async(*_args, **_kwargs):  # type: ignore[no-untyped-def]
        # InMemoryRunner.run_async is consumed via ``async for`` in run_incident;
        # raising here (before yield) surfaces as if the runner had failed to
        # deserialise an LLM payload into FindingDraft.
        raise ValidationError.from_exception_data(
            "FindingDraft",
            [
                {
                    "type": "missing",
                    "loc": ("confidence",),
                    "input": {},
                    "msg": "field required",
                }
            ],
        )

    orchestrator = Orchestrator()
    # Reset blackboard so the assertion is hermetic.
    blackboard.reset()
    with patch(
        "backend.agents.orchestrator.InMemoryRunner.run_async",
        side_effect=fake_run_async,
    ):
        with caplog.at_level(
            logging.ERROR, logger="backend.agents.orchestrator"
        ):
            await orchestrator.run_incident(
                trigger=DefectInjectionRequest(mode="demo"),
            )

    state = blackboard.get_state()
    assert state.status == "error"
    assert state.status_reason == "LLM schema validation failed; safe default applied"
