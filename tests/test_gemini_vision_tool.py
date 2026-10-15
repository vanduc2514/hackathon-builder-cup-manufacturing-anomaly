"""Unit tests for Gemini Vision Tool and visual evidence photo analysis."""

from __future__ import annotations

import io
from unittest.mock import MagicMock

import pytest
from starlette.testclient import TestClient

from backend.api.main import app
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import VisualEvidencePayload, VisualInspectionResult
from backend.tools.gemini_vision_tool import (
    analyze_visual_evidence_frame,
    analyze_visual_evidence_frame_async,
    is_gemini_vision_available,
    mock_visual_evidence_analysis,
)


@pytest.fixture(autouse=True)
def reset_board_and_settings(monkeypatch):
    blackboard.reset()
    monkeypatch.setattr(settings, "ai_provider", "mock")
    monkeypatch.setattr(settings, "gemini_vision_fallback_to_mock", True)


def test_is_gemini_vision_available_mock_mode(monkeypatch):
    monkeypatch.setattr(settings, "ai_provider", "mock")
    assert is_gemini_vision_available() is False


def test_is_gemini_vision_available_with_api_key(monkeypatch):
    monkeypatch.setattr(settings, "ai_provider", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-12345")
    assert is_gemini_vision_available() is True


def test_mock_visual_evidence_analysis_cnc():
    raw_img = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"fake_cnc_insert_image_bytes"
    payload = mock_visual_evidence_analysis(
        image_bytes=raw_img,
        machine_id="CNC-02",
        tool_id="T07",
        filename="cutting_tool.jpg",
    )
    assert isinstance(payload, VisualEvidencePayload)
    assert payload.filename == "cutting_tool.jpg"
    assert payload.defect_detected is True
    assert payload.wear_measurement_mm == 0.35
    assert "VB = 0.35 mm" in payload.analysis
    assert "Gemini Live" in payload.citation
    assert payload.mime_type == "image/jpeg"
    assert payload.size_bytes == len(raw_img)


def test_mock_visual_evidence_analysis_im():
    raw_img = b"\x89PNG\r\n\x1a\n" + b"fake_dryer_image_bytes"
    payload = mock_visual_evidence_analysis(
        image_bytes=raw_img,
        machine_id="IM-05",
        tool_id=None,
        filename="dryer.png",
    )
    assert isinstance(payload, VisualEvidencePayload)
    assert payload.filename == "dryer.png"
    assert payload.defect_detected is True
    assert payload.wear_measurement_mm is None
    assert "Dryer-03 desiccant canister" in payload.analysis
    assert payload.mime_type == "image/png"


def test_real_gemini_vision_call_with_client():
    raw_img = b"\xff\xd8\xff\xe0" + b"sample_jpg"
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.parsed = VisualInspectionResult(
        analysis="Optical metrology inspection confirms excessive abrasive flank wear on cutting edge.",
        defect_detected=True,
        wear_measurement_mm=0.38,
        confidence=0.96,
    )
    mock_client.models.generate_content.return_value = mock_response

    payload = analyze_visual_evidence_frame(
        image_bytes=raw_img,
        machine_id="CNC-02",
        tool_id="T07",
        filename="insert_macro.jpg",
        defect_type="scratch_vertical",
        client=mock_client,
    )

    assert isinstance(payload, VisualEvidencePayload)
    assert payload.filename == "insert_macro.jpg"
    assert payload.defect_detected is True
    assert payload.wear_measurement_mm == 0.38
    assert "excessive abrasive flank wear" in payload.analysis
    assert "Gemini Vision" in payload.citation
    assert settings.gemini_vision_model in payload.citation

    # Verify generate_content call arguments
    assert mock_client.models.generate_content.called
    kwargs = mock_client.models.generate_content.call_args.kwargs
    assert kwargs["model"] == settings.gemini_vision_model
    assert len(kwargs["contents"]) == 2
    assert "CNC-02" in kwargs["contents"][0]
    assert "T07" in kwargs["contents"][0]


def test_real_gemini_vision_call_via_json_text_parsing():
    raw_img = b"\xff\xd8\xff\xe0" + b"sample_jpg"
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.parsed = None
    mock_response.text = (
        '{"analysis": "Parsed from JSON text: flank wear detected.", '
        '"defect_detected": true, "wear_measurement_mm": 0.42, "confidence": 0.91}'
    )
    mock_client.models.generate_content.return_value = mock_response

    payload = analyze_visual_evidence_frame(
        image_bytes=raw_img,
        machine_id="CNC-02",
        tool_id="T07",
        client=mock_client,
    )

    assert payload.wear_measurement_mm == 0.42
    assert "Parsed from JSON text" in payload.analysis


def test_gemini_vision_failure_fallback_to_mock(monkeypatch):
    raw_img = b"\xff\xd8\xff\xe0" + b"sample_jpg"
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = RuntimeError("Quota limit reached: 429")

    monkeypatch.setattr(settings, "gemini_vision_fallback_to_mock", True)

    payload = analyze_visual_evidence_frame(
        image_bytes=raw_img,
        machine_id="CNC-02",
        tool_id="T07",
        filename="fallback.jpg",
        client=mock_client,
    )

    # Must gracefully fall back to mock
    assert isinstance(payload, VisualEvidencePayload)
    assert payload.wear_measurement_mm == 0.35
    assert "VB = 0.35 mm" in payload.analysis
    assert "Gemini Live" in payload.citation


def test_gemini_vision_failure_raises_when_fallback_disabled(monkeypatch):
    raw_img = b"\xff\xd8\xff\xe0" + b"sample_jpg"
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = RuntimeError("Quota limit reached: 429")

    monkeypatch.setattr(settings, "gemini_vision_fallback_to_mock", False)

    with pytest.raises(RuntimeError, match="Quota limit reached"):
        analyze_visual_evidence_frame(
            image_bytes=raw_img,
            machine_id="CNC-02",
            tool_id="T07",
            client=mock_client,
        )


@pytest.mark.asyncio
async def test_analyze_visual_evidence_frame_async():
    raw_img = b"\xff\xd8\xff\xe0" + b"async_sample"
    payload = await analyze_visual_evidence_frame_async(
        image_bytes=raw_img,
        machine_id="CNC-02",
        tool_id="T07",
        filename="async_photo.jpg",
    )
    assert isinstance(payload, VisualEvidencePayload)
    assert payload.filename == "async_photo.jpg"
    assert payload.wear_measurement_mm == 0.35


def test_upload_incident_evidence_endpoint():
    client = TestClient(app)
    fake_img = io.BytesIO(b"\xff\xd8\xff\xe0" + b"test_image_bytes")
    resp = client.post(
        "/api/incidents/evidence",
        files={"file": ("evidence_upload.jpg", fake_img, "image/jpeg")},
        data={"notes": "Technician inspected tool T07."},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "evidence" in data
    assert "finding" in data
    assert data["evidence"]["filename"] == "evidence_upload.jpg"
    assert data["evidence"]["wear_measurement_mm"] == 0.35

    # Confirm blackboard updated
    state = blackboard.get_state()
    assert state.visual_evidence is not None
    assert state.visual_evidence.filename == "evidence_upload.jpg"
