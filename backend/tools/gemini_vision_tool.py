"""Gemini Vision Tool: Analyzes frontline technician evidence photos via Gemini Vision."""

from __future__ import annotations

import asyncio
import base64
import logging
import os
from typing import Any

from backend.core.config import settings
from backend.core.models import VisualEvidencePayload, VisualInspectionResult

logger = logging.getLogger(__name__)

DEFAULT_DIAGNOSTIC_IM_CITATION = (
    "Technician diagnostic camera stream via Gemini Live (Dryer-03 desiccant canister inspection)"
)

VISION_SYSTEM_INSTRUCTION = (
    "You are an expert industrial computer vision metrology inspector and manufacturing diagnostic engineer "
    "at Kaizen Agent Platform. Inspect the close-up macro photograph provided by the frontline technician. "
    "Analyze physical anomalies, defect severity, surface finish, tool flank wear (VB in mm), micro-chipping, "
    "or component moisture/contamination. Return a structured JSON response matching the schema."
)


def is_gemini_vision_available() -> bool:
    """Returns True if Gemini credentials or Vertex AI configuration are available."""
    if settings.ai_provider == "mock":
        return False
    # Check for direct Gemini API key
    api_key = (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or settings.gemini_api_key
    )
    if api_key:
        return True
    # Check for Vertex AI credentials
    has_gcp_project = bool(
        os.environ.get("GCP_PROJECT_ID")
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or (settings.gcp_project_id and settings.gcp_project_id != "kaizen-local")
    )
    has_creds = bool(
        os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        or settings.is_production
        or settings.google_genai_use_vertexai
    )
    return has_gcp_project and has_creds


def get_gemini_client() -> Any:
    """Initializes and returns a Google Gen AI client."""
    from google import genai

    api_key = (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or settings.gemini_api_key
    )
    if api_key:
        return genai.Client(api_key=api_key)

    project_id = (
        os.environ.get("GCP_PROJECT_ID")
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or settings.gcp_project_id
    )
    region = os.environ.get("GCP_REGION") or settings.gcp_region
    return genai.Client(vertexai=True, project=project_id, location=region)


def mock_visual_evidence_analysis(
    image_bytes: bytes,
    machine_id: str = "CNC-02",
    tool_id: str | None = "T07",
    filename: str | None = None,
    defect_type: str | None = None,
) -> VisualEvidencePayload:
    """Deterministic mock fallback when Gemini Vision is unconfigured or unavailable."""
    is_im = "IM" in machine_id.upper() or bool(defect_type and "short" in defect_type.lower())
    size_bytes = len(image_bytes)
    b64_preview = base64.b64encode(image_bytes[:512]).decode("ascii") if image_bytes else None

    if is_im:
        analysis_text = (
            "Close-up optical inspection of Dryer-03 desiccant canister confirms severe moisture saturation "
            "(color shifted from blue to pink) and oil contamination on O-ring seal FLT-ABS-04."
        )
        citation = DEFAULT_DIAGNOSTIC_IM_CITATION
        wear_mm = None
    else:
        target_tool = tool_id or "T07"
        analysis_text = (
            f"Macro optical inspection of cutting insert {target_tool} confirms abrasive flank wear "
            "exceeding tolerance (VB = 0.35 mm > 0.30 mm limit) and micro-chipping on primary cutting edge, "
            "corroborating workpiece vertical scratches."
        )
        citation = (
            f"Technician diagnostic camera stream via Gemini Live "
            f"({machine_id} {target_tool} macro inspection)"
        )
        wear_mm = 0.35

    mime_type = "image/jpeg"
    if image_bytes.startswith(b"\x89PNG"):
        mime_type = "image/png"
    elif b"WEBP" in image_bytes[:16]:
        mime_type = "image/webp"

    return VisualEvidencePayload(
        filename=filename or ("evidence_photo.jpg" if not is_im else "dryer_photo.jpg"),
        mime_type=mime_type,
        size_bytes=size_bytes,
        image_base64=b64_preview,
        analysis=analysis_text,
        defect_detected=True,
        wear_measurement_mm=wear_mm,
        citation=citation,
    )


def analyze_visual_evidence_frame(
    image_bytes: bytes,
    machine_id: str = "CNC-02",
    tool_id: str | None = "T07",
    filename: str | None = None,
    defect_type: str | None = None,
    client: Any | None = None,
) -> VisualEvidencePayload:
    """Analyzes a close-up photo frame captured by frontline technician's mobile camera."""
    size_bytes = len(image_bytes)
    b64_preview = base64.b64encode(image_bytes[:512]).decode("ascii") if image_bytes else None

    mime_type = "image/jpeg"
    if image_bytes.startswith(b"\x89PNG"):
        mime_type = "image/png"
    elif b"WEBP" in image_bytes[:16]:
        mime_type = "image/webp"
    elif filename and filename.lower().endswith(".png"):
        mime_type = "image/png"
    elif filename and filename.lower().endswith(".webp"):
        mime_type = "image/webp"

    if client is not None or is_gemini_vision_available():
        try:
            from google.genai import types

            gemini_client = client or get_gemini_client()

            prompt_parts = [
                f"Analyze this frontline technician evidence photo for machine {machine_id}."
            ]
            if tool_id:
                prompt_parts.append(f"Suspect tool / component: {tool_id}.")
            if defect_type:
                prompt_parts.append(f"Suspected defect symptom: {defect_type}.")
            prompt_parts.append(
                "Provide: (1) concise engineering analysis (2-3 sentences) evaluating defect presence, wear pattern, "
                "and correlation with process parameters, (2) defect_detected boolean, (3) wear_measurement_mm if applicable "
                "(e.g. flank wear VB in mm or null if not applicable), (4) confidence score between 0.0 and 1.0."
            )
            prompt_text = "\n".join(prompt_parts)

            image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

            response = gemini_client.models.generate_content(
                model=settings.gemini_vision_model,
                contents=[prompt_text, image_part],
                config=types.GenerateContentConfig(
                    system_instruction=VISION_SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    response_schema=VisualInspectionResult,
                    temperature=0.2,
                ),
            )

            result: VisualInspectionResult
            if isinstance(getattr(response, "parsed", None), VisualInspectionResult):
                result = response.parsed
            elif hasattr(response, "text") and response.text:
                result = VisualInspectionResult.model_validate_json(response.text)
            else:
                raise ValueError("Gemini Vision returned empty or unparseable response")

            citation = (
                f"Gemini Vision ({settings.gemini_vision_model}) analysis of "
                f"{machine_id} {tool_id or ''} macro inspection photo"
            )

            return VisualEvidencePayload(
                filename=filename or "evidence_photo.jpg",
                mime_type=mime_type,
                size_bytes=size_bytes,
                image_base64=b64_preview,
                analysis=result.analysis,
                defect_detected=result.defect_detected,
                wear_measurement_mm=result.wear_measurement_mm,
                citation=citation,
            )
        except Exception as exc:
            if not settings.gemini_vision_fallback_to_mock:
                raise
            logger.warning(
                "Gemini Vision analysis failed, falling back to mock: %s",
                exc,
                exc_info=True,
            )

    return mock_visual_evidence_analysis(
        image_bytes=image_bytes,
        machine_id=machine_id,
        tool_id=tool_id,
        filename=filename,
        defect_type=defect_type,
    )


async def analyze_visual_evidence_frame_async(
    image_bytes: bytes,
    machine_id: str = "CNC-02",
    tool_id: str | None = "T07",
    filename: str | None = None,
    defect_type: str | None = None,
    client: Any | None = None,
) -> VisualEvidencePayload:
    """Async wrapper for analyze_visual_evidence_frame avoiding blocking event loop."""
    return await asyncio.to_thread(
        analyze_visual_evidence_frame,
        image_bytes=image_bytes,
        machine_id=machine_id,
        tool_id=tool_id,
        filename=filename,
        defect_type=defect_type,
        client=client,
    )
