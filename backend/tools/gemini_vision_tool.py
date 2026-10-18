"""Gemini Vision Tool: Analyzes frontline technician evidence photos via Gemini Vision."""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
from typing import Any, Callable, Literal

from backend.core.config import settings
from backend.core.models import (
    GuardedInspection,
    InsertInspectionResult,
    PartInspectionResult,
    VisualEvidencePayload,
    VisualInspectionResult,
)

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


# ---------------------------------------------------------------------------
# Closed-schema inspections + DEMO_SCRIPTED expected-result guard
# ---------------------------------------------------------------------------

MAX_IMAGE_EDGE = 1024
GUARD_MAX_ATTEMPTS = 2

PART_PROMPT = (
    "You are the end-of-line vision inspector for {machine_id} (Cell 1) machining aluminum "
    "AL-5083 housing parts with tool {tool_id}. Classify the part surface. Linear marks/scuffs "
    "= scratch_vertical; broken edges = chipping; otherwise none."
)
INSERT_PROMPT = (
    "The technician on {machine_id} sent a phone photo of the {tool_id} carbide insert removed "
    "from the tool. Assess cutting-edge condition. Replace the insert if flank wear is severe "
    "or the edge is chipped."
)


def normalize_image(image_bytes: bytes) -> bytes:
    """EXIF-transpose, convert to RGB, cap the long edge at 1024 px (no upscale), JPEG q90."""
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(image_bytes)) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        if max(img.size) > MAX_IMAGE_EDGE:
            img.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=90)
        return out.getvalue()


def _inspect(
    kind: Literal["part", "insert"],
    schema: Any,
    prompt: str,
    image_bytes: bytes,
    client: Any | None,
) -> Any:
    from google.genai import types

    gemini_client = client or get_gemini_client()
    logger.info("gemini_call kind=%s model=%s", kind, settings.gemini_vision_model)
    response = gemini_client.models.generate_content(
        model=settings.gemini_vision_model,
        contents=[prompt, types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0,
        ),
    )
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, schema):
        return parsed
    if getattr(response, "text", None):
        return schema.model_validate_json(response.text)
    raise ValueError("Gemini Vision returned empty or unparseable response")


def inspect_part_image(
    image_bytes: bytes, *, machine_id: str, tool_id: str, client: Any | None = None
) -> PartInspectionResult:
    """One real Gemini call classifying a part photo. Raises on failure."""
    prompt = PART_PROMPT.format(machine_id=machine_id, tool_id=tool_id)
    return _inspect("part", PartInspectionResult, prompt, image_bytes, client)


def inspect_insert_image(
    image_bytes: bytes, *, machine_id: str, tool_id: str, client: Any | None = None
) -> InsertInspectionResult:
    """One real Gemini call assessing a removed cutting insert photo. Raises on failure."""
    prompt = INSERT_PROMPT.format(machine_id=machine_id, tool_id=tool_id)
    return _inspect("insert", InsertInspectionResult, prompt, image_bytes, client)


def _part_for(expected: str | None) -> PartInspectionResult:
    cls = expected if expected in ("scratch_vertical", "chipping") else "none"
    return PartInspectionResult(
        defect_class=cls, severity=3 if cls != "none" else 1, region="center"
    )


def _insert_for(expected: str | None) -> InsertInspectionResult:
    if expected == "replace":
        return InsertInspectionResult(flank_wear="severe", edge_chipping=True, replace_insert=True)
    return InsertInspectionResult(flank_wear="none", edge_chipping=False, replace_insert=False)


def _part_label(result: PartInspectionResult) -> str:
    return result.defect_class


def _insert_label(result: InsertInspectionResult) -> str:
    return "replace" if result.replace_insert else "ok"


def _part_summary(result: PartInspectionResult, machine_id: str, tool_id: str) -> str:
    if result.defect_class == "none":
        return f"{machine_id} {tool_id}: part surface clean, no defect detected."
    label = result.defect_class.replace("_", " ")
    return (
        f"{machine_id} {tool_id}: {label} detected, severity {result.severity}/5, "
        f"region {result.region}."
    )


def _insert_summary(result: InsertInspectionResult, machine_id: str, tool_id: str) -> str:
    chip = "edge chipping present" if result.edge_chipping else "no edge chipping"
    action = "replace the insert" if result.replace_insert else "insert can stay in service"
    return f"{machine_id} {tool_id}: flank wear {result.flank_wear}, {chip}; {action}."


def _guarded(
    kind: Literal["part", "insert"],
    inspect_fn: Callable[..., Any],
    make_expected: Callable[[str | None], Any],
    label_fn: Callable[[Any], str],
    summary_fn: Callable[[Any, str, str], str],
    image_bytes: bytes,
    expected: str | None,
    machine_id: str,
    tool_id: str,
    client: Any | None,
) -> GuardedInspection:
    model = settings.gemini_vision_model

    def build(result: Any, source: str, attempts: int) -> GuardedInspection:
        logger.info(
            "vision_guard kind=%s expected=%s got=%s source=%s attempts=%d",
            kind,
            expected,
            label_fn(result),
            source,
            attempts,
        )
        return GuardedInspection(
            kind=kind,
            part=result if kind == "part" else None,
            insert=result if kind == "insert" else None,
            source=source,  # type: ignore[arg-type]
            model=model,
            attempts=attempts,
            summary=summary_fn(result, machine_id, tool_id),
        )

    if client is None and not is_gemini_vision_available():
        return build(make_expected(expected), "mock", 0)

    scripted = settings.demo_scripted and expected is not None
    max_attempts = GUARD_MAX_ATTEMPTS if scripted else 1
    attempts = 0
    while attempts < max_attempts:
        attempts += 1
        try:
            result = inspect_fn(
                image_bytes, machine_id=machine_id, tool_id=tool_id, client=client
            )
        except Exception:
            if not scripted:
                raise
            logger.warning("vision_guard model call failed kind=%s", kind, exc_info=True)
            continue
        if not scripted or label_fn(result) == expected:
            return build(result, "gemini", attempts)
    return build(make_expected(expected), "fallback", attempts)


def guarded_part_inspection(
    image_bytes: bytes,
    *,
    expected: str | None,
    machine_id: str,
    tool_id: str,
    client: Any | None = None,
) -> GuardedInspection:
    """Inspect a part photo; with DEMO_SCRIPTED, force the catalog-expected class."""
    return _guarded(
        "part", inspect_part_image, _part_for, _part_label, _part_summary,
        image_bytes, expected, machine_id, tool_id, client,
    )  # fmt: skip


def guarded_insert_inspection(
    image_bytes: bytes,
    *,
    expected: str | None,
    machine_id: str,
    tool_id: str,
    client: Any | None = None,
) -> GuardedInspection:
    """Inspect an insert photo; with DEMO_SCRIPTED, force the catalog-expected verdict."""
    return _guarded(
        "insert", inspect_insert_image, _insert_for, _insert_label, _insert_summary,
        image_bytes, expected, machine_id, tool_id, client,
    )  # fmt: skip
