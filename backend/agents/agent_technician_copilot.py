"""Technician Copilot: streamed English repair guidance with strict OEM grounding."""

from __future__ import annotations

import logging
import re
from collections.abc import AsyncIterator
from typing import Any

from google.adk import Agent
from google.genai import types

from backend.agents.tool_guards import (
    AGENT_MAX_OUTPUT_TOKENS,
    limit_tool_calls,
    return_argument_errors,
)
from backend.core.config import settings
from backend.core.models import (
    FindingDraft,
    IncidentState,
    RAGSearchResult,
    RepairCheckpoint,
)
from backend.tools.gemini_vision_tool import (
    analyze_visual_evidence_frame as analyze_visual_evidence_frame,
)
from backend.tools.gemini_vision_tool import (
    analyze_visual_evidence_frame_async as analyze_visual_evidence_frame_async,
)
from backend.tools.gemini_vision_tool import (
    get_gemini_client,
    normalize_image,
)
from backend.tools.gemini_vision_tool import (
    mock_visual_evidence_analysis as mock_visual_evidence_analysis,
)
from backend.tools.manual_loader import (
    get_oem_repair_manual,
    load_oem_repair_manuals_dict,
)
from backend.tools.rag_search_tool import search_knowledge_base

logger = logging.getLogger(__name__)

# =============================================================================
# Verified OEM Equipment Manuals Database (Strict Grounding Sources)
# =============================================================================

OEM_REPAIR_MANUALS: dict[str, dict[str, Any]] = load_oem_repair_manuals_dict()

REFUSAL_MESSAGE = (
    "There is no documented OEM procedure for this request. "
    "To keep the work safe and within spec, please contact the senior maintenance engineer "
    "or the plant engineering department."
)

# =============================================================================
# Technician Copilot runtime: real Gemini streaming replies (spoken by the mobile browser)
# =============================================================================

COPILOT_LANGUAGE = "en-US"
COPILOT_TEMPERATURE = 0.3
COPILOT_MAX_OUTPUT_TOKENS = 1024
COPILOT_HISTORY_TURNS = 8
COPILOT_SOP_RESULTS = 3
COPILOT_FINDINGS_IN_CONTEXT = 4
COPILOT_EVIDENCE_CHARS = 300
NO_SOP_CONTEXT = "No SOP excerpts were retrieved for this request."


def build_technician_copilot_system_prompt(equipment_id: str = "CNC-02") -> str:
    """Constructs the English system prompt: spoken persona, strict grounding and refusal rules."""
    return f"""You are Kaizen Copilot, a senior maintenance engineer guiding a frontline technician at {equipment_id} by voice on a phone.

SPOKEN STYLE:
1. Your reply is read aloud: plain English, 2-4 short sentences, no markdown, no bullet lists, no emoji.
2. One step at a time. Wait for the technician to confirm a step or report a measurement before moving on.

STRICT GROUNDING:
1. Take every procedure step, part number, torque, tolerance and measurement limit only from the SOP excerpts or the incident context below. Name the source when you give a step, for example "According to the OEM manual, page 112".
2. If the SOP excerpts do not contain a value, say there is no documented value and tell the technician to ask the shift leader. Never invent numbers.
3. When a photo is attached, describe what you actually see on the part or insert and relate it to the incident. Do not assume anything the photo does not show.

REFUSAL:
If the technician asks for something outside the documented design (for example overriding a safety sensor or running the spindle beyond its limits), refuse with: "{REFUSAL_MESSAGE}"
"""


def build_copilot_incident_context(state: IncidentState) -> str:
    """Renders the incident board (status, suspect, root cause, findings, photo evidence) as prompt text."""
    lines = [
        f"Incident {state.incident_id}, status: {state.status}",
        f"Machine: {state.suspect_machine or 'unknown'}; tool: {state.suspect_tool or 'unknown'}",
        f"Reported defect: {state.defect_type or 'none recorded'} "
        f"(defect rate {state.defect_rate:.1%}, SPC upper limit {state.spc_ucl:.1%})",
        f"Root cause: {state.root_cause or 'not determined yet'}",
        f"Repair done: {'yes' if state.repair_done else 'no'}; "
        f"post-repair verification {state.verification_count}/{state.verification_target} good parts",
    ]
    if state.diagnostic_request:
        lines.append(f"Open diagnostic request to the technician: {state.diagnostic_request}")
    evidence = state.visual_evidence
    if evidence is not None and evidence.analysis:
        lines.append(f"Visual evidence on the board: {evidence.analysis}")
    recent = state.findings[-COPILOT_FINDINGS_IN_CONTEXT:]
    if recent:
        lines.append("Latest agent findings:")
        lines.extend(
            f"- {f.agent_name} ({f.phase}): {f.finding} "
            f"Evidence: {f.evidence[:COPILOT_EVIDENCE_CHARS]}"
            for f in recent
        )
    return "\n".join(lines)


async def fetch_copilot_sop_context(state: IncidentState, user_text: str) -> str:
    """RAG lookup of SOP snippets for the incident symptom/asset and the technician's question."""
    try:
        result = await search_knowledge_base(
            defect_symptom=state.defect_type,
            suspect_asset=state.suspect_machine,
            query=user_text,
            max_results=COPILOT_SOP_RESULTS,
        )
    except Exception as exc:
        logger.warning("Copilot SOP lookup failed: %s", exc)
        return NO_SOP_CONTEXT
    if not result.citations:
        return NO_SOP_CONTEXT
    return "\n".join(
        f'{i}. [{c.formatted_citation()}] "{c.snippet}"'
        for i, c in enumerate(result.citations, 1)
    )


def build_copilot_system_instruction(
    equipment_id: str, incident_context: str, sop_context: str
) -> str:
    """System prompt plus the per-turn incident board and SOP excerpts."""
    return (
        f"{build_technician_copilot_system_prompt(equipment_id)}\n"
        f"INCIDENT CONTEXT:\n{incident_context}\n\n"
        f"SOP EXCERPTS:\n{sop_context}\n"
    )


def build_copilot_contents(
    history: list[tuple[str, str]], user_text: str, image_bytes: bytes | None
) -> list[types.Content]:
    """Chat history (last N turns) plus the current technician turn, with the photo when sent."""
    contents = [
        types.Content(role=role, parts=[types.Part.from_text(text=text)])
        for role, text in history[-COPILOT_HISTORY_TURNS:]
    ]
    parts = [types.Part.from_text(text=user_text)]
    if image_bytes:
        parts.append(
            types.Part.from_bytes(data=normalize_image(image_bytes), mime_type="image/jpeg")
        )
    contents.append(types.Content(role="user", parts=parts))
    return contents


async def stream_copilot_reply(
    *,
    state: IncidentState,
    user_text: str,
    history: list[tuple[str, str]],
    image_bytes: bytes | None = None,
    client: Any | None = None,
) -> AsyncIterator[str]:
    """One real Gemini `generate_content_stream` call; yields the reply text chunk by chunk.

    `history` holds `(role, text)` pairs with role "user" or "model", oldest first. Raises on
    API failure; the caller reports it to the technician.
    """
    equipment_id = state.suspect_machine or "CNC-02"
    sop_context = await fetch_copilot_sop_context(state, user_text)
    config = types.GenerateContentConfig(
        system_instruction=build_copilot_system_instruction(
            equipment_id, build_copilot_incident_context(state), sop_context
        ),
        temperature=COPILOT_TEMPERATURE,
        max_output_tokens=COPILOT_MAX_OUTPUT_TOKENS,
    )
    contents = build_copilot_contents(history, user_text, image_bytes)
    gemini_client = client or get_gemini_client()
    logger.info(
        "gemini_call kind=copilot model=%s image=%s", settings.gemini_model, bool(image_bytes)
    )
    stream = await gemini_client.aio.models.generate_content_stream(
        model=settings.gemini_model, contents=contents, config=config
    )
    async for chunk in stream:
        if chunk.text:
            yield chunk.text


# =============================================================================
# Helper Utilities & Grounding Checks
# =============================================================================


def get_oem_manual_citations(equipment_id: str) -> list[str]:
    """Retrieves all verified citations for a given equipment."""
    manual = get_oem_repair_manual(equipment_id)
    if manual:
        return [cp.citation for cp in manual.checkpoints]
    manual_dict = OEM_REPAIR_MANUALS.get(equipment_id)
    if not manual_dict:
        return []
    return [step["citation"] for step in manual_dict.get("checkpoints", [])]


def is_action_grounded(equipment_id: str, query: str) -> bool:
    """Verifies whether a requested repair query is supported by OEM documentation."""
    manual = get_oem_repair_manual(equipment_id)
    if manual:
        supported = manual.supported_actions
    elif equipment_id in OEM_REPAIR_MANUALS:
        supported = OEM_REPAIR_MANUALS[equipment_id].get("supported_actions", [])
    else:
        return False
    query_lower = query.lower()
    return any(action in query_lower for action in supported)


def generate_refusal(query: str, equipment_id: str | None = None) -> str:
    """Generates standard refusal message when query lacks OEM grounding."""
    return REFUSAL_MESSAGE


def parse_metric_from_text(text: str) -> float | None:
    """Extracts a numeric float value from technician input, supporting dot and comma."""
    # Pattern matching numbers like 0.003, 0,003, -30, -30.5
    match = re.search(r"[-+]?\d+(?:[.,]\d+)?", text)
    if not match:
        return None
    val_str = match.group(0).replace(",", ".")
    try:
        return float(val_str)
    except ValueError:
        return None


def validate_metric_measurement(
    checkpoint: RepairCheckpoint, measured_value: float
) -> tuple[bool, str]:
    """Validates whether a measured metric satisfies the checkpoint threshold."""
    if checkpoint.target_threshold is None:
        return True, "Không yêu cầu chỉ số đo."

    target = checkpoint.target_threshold
    comparator = checkpoint.comparator or "<="
    passed = False

    if comparator == "<=":
        passed = measured_value <= target
    elif comparator == ">=":
        passed = measured_value >= target
    elif comparator == "==":
        passed = abs(measured_value - target) < 1e-6
    elif comparator == "<":
        passed = measured_value < target
    elif comparator == ">":
        passed = measured_value > target

    unit_str = f" {checkpoint.unit}" if checkpoint.unit else ""
    metric_label = checkpoint.metric_name or "Chỉ số kiểm tra"

    if passed:
        message = (
            f"Chỉ số {metric_label} đạt chuẩn: {measured_value}{unit_str} "
            f"(đạt yêu cầu {comparator} {target}{unit_str}). [{checkpoint.citation}]"
        )
    else:
        message = (
            f"Chỉ số {metric_label} không đạt: {measured_value}{unit_str} "
            f"(vượt dung sai cho phép {comparator} {target}{unit_str}). "
            f"Vui lòng vệ sinh bề mặt tiếp xúc, định vị lại gá kẹp và đo lại theo [{checkpoint.citation}]."
        )

    return passed, message


# =============================================================================
# Diagnostic Feedback Loop & Grounded Constants
# =============================================================================

AGENT_ID = "COPILOT"
AGENT_NAME = "Technician Copilot"
PHASE = "Phase C - Resolution"
DIAGNOSTIC_PHASE = "Phase B - Field Evidence"

DEFAULT_CNC_CITATION = "Gemini Live API multimodal voice session (CNC-02 OEM Manual p.112, mục 4.2)"
DEFAULT_IM_CITATION = "Gemini Live API multimodal voice session (IM-05 SOP-MOLD-02 p.45, mục 3)"
DEFAULT_DIAGNOSTIC_CNC_CITATION = (
    "Technician diagnostic camera stream via Gemini Live (CNC-02 T07 macro inspection)"
)
DEFAULT_DIAGNOSTIC_IM_CITATION = (
    "Technician diagnostic camera stream via Gemini Live (IM-05 dryer inspection)"
)


def build_contextual_diagnostic_probe_vi(
    confidence: float,
    machine_id: str = "CNC-02",
    tool_id: str | None = "T07",
    defect_type: str | None = "scratch_vertical",
    diagnostic_request: str | None = None,
) -> str:
    """Verbalizes the diagnostic question in Vietnamese for the frontline technician when RCA confidence is low (< 70%).

    Example: 'Độ tin cậy hiện là 65%. Anh vui lòng chụp ảnh cận cảnh mũi dao T07 để xác nhận là mòn lưỡi hay mẻ hạt.'
    """
    conf_pct = int(round(confidence * 100)) if confidence <= 1.0 else int(confidence)
    if diagnostic_request:
        if f"{conf_pct}%" in diagnostic_request or diagnostic_request.startswith("Độ tin cậy"):
            return diagnostic_request
        return f"Độ tin cậy hiện là {conf_pct}%. {diagnostic_request}"

    is_im = "IM" in machine_id.upper() or (defect_type and "short" in defect_type.lower())
    if is_im:
        return (
            f"Độ tin cậy hiện là {conf_pct}%. Anh vui lòng kiểm tra cụm sấy Dryer-03 và chụp ảnh hạt hút ẩm desiccant "
            f"để xác nhận độ bão hòa ẩm gây lỗi thiếu liệu (short fill)."
        )

    target_tool = tool_id or "T07"
    return (
        f"Độ tin cậy hiện là {conf_pct}%. Anh vui lòng chụp ảnh cận cảnh mũi dao {target_tool} "
        f"để xác nhận là mòn lưỡi hay mẻ hạt."
    )


# =============================================================================
# ADK Workflow Agents & Grounded Finding Builders
# =============================================================================


def _supports_tools() -> bool:
    """Determines whether the active LLM provider supports function-calling tools."""
    if settings.ai_provider == "ollama" and (
        "2b" in settings.llm_model.lower() or "gemma2" in settings.llm_model.lower()
    ):
        return False
    return True


async def query_repair_procedure(
    machine_id: str,
    defect_symptom: str,
    query: str | None = None,
) -> RAGSearchResult:
    """ADK Tool: Queries OEM equipment manuals and repair procedures for the suspect machine.

    Args:
        machine_id: Board suspect_machine, e.g. CNC-02 or IM-05.
        defect_symptom: Board defect_type, e.g. scratch_vertical or short_fill.
        query: Optional free-text refinement.
    """
    return await search_knowledge_base(
        defect_symptom=defect_symptom,
        suspect_asset=machine_id,
        query=query,
    )


INSTRUCTION = (
    "You are the Technician Copilot of the Kaizen Agent manufacturing incident team. "
    "Your objective is to report on the interactive repair guidance given to the frontline technician, "
    "grounded strictly in OEM equipment manuals and verified mechanical checkpoints. "
    "The user message is the current incident board as JSON. "
    "Follow these steps: "
    "1. Read the incident board to extract suspect_machine, suspect_tool, defect_type, and root_cause. "
    "2. If tools are available, call query_repair_procedure with the board's suspect_machine and defect_type to look up the OEM repair procedure, "
    "part numbers, torque values, and measurement tolerances. "
    "3. Ground EVERY part number, torque value, tolerance, measurement, speed, and page or section reference in the tool results or the board evidence. "
    "Do not state any value that is not present there; if the lookup returns no matching procedure, say so and lower the confidence instead of inventing steps. "
    "4. Return a FindingDraft with one concise sentence for finding summarizing the repair guidance for this machine and tool, "
    "2-3 sentences for evidence citing the verified checkpoints and the tolerances taken from the retrieved procedure, "
    "a confidence score that reflects how fully the retrieved procedure covers the repair, "
    "and a citation naming the OEM manual sections actually retrieved. Respond in English."
)

agent = Agent(
    name="technician_copilot",
    description="Guides the technician through physical equipment repair in Vietnamese grounded in OEM manuals.",
    instruction=INSTRUCTION,
    tools=[query_repair_procedure] if _supports_tools() else [],
    before_model_callback=limit_tool_calls(query_repair_procedure),
    on_tool_error_callback=return_argument_errors,
    output_schema=FindingDraft,
    generate_content_config=types.GenerateContentConfig(
        temperature=0.1, max_output_tokens=AGENT_MAX_OUTPUT_TOKENS
    ),
)

DIAGNOSTIC_INSTRUCTION = (
    "You are the Technician Copilot of the Kaizen Agent manufacturing incident team acting as the field diagnostic probe. "
    "The Root Cause Agent's confidence is below threshold, so you collect physical field evidence "
    "from the frontline technician at the machine via the mobile camera stream. "
    "The user message is the current incident board as JSON. "
    "Follow these steps: "
    "1. Read the incident board to extract suspect_machine, suspect_tool, defect_type, and any diagnostic_request from the Root Cause Agent. "
    "2. If tools are available, call query_repair_procedure with the board's suspect_machine and defect_type to cross-reference diagnostic criteria with OEM manuals. "
    "3. Report only what the technician's field evidence on the board shows (inspection findings, photo analysis) and the criteria returned by the tool; "
    "never assume the physical condition of the equipment, wear measurements, or inspection outcomes that are not recorded there. "
    "If no field evidence is present, state that the inspection is still pending and set a low confidence. "
    "4. Return a FindingDraft with one concise sentence for finding stating what the physical inspection established, "
    "2-3 sentences of evidence tied to the recorded observations and the retrieved criteria, "
    "a confidence score that reflects how conclusive the recorded evidence is, "
    "and a citation naming the field evidence source and the manual sections actually retrieved. "
    "Respond in English."
)

diagnostic_agent = Agent(
    name="technician_copilot_diagnostic",
    description="Collects field photos and physical diagnostic evidence from the technician when RCA confidence is low.",
    instruction=DIAGNOSTIC_INSTRUCTION,
    tools=[query_repair_procedure] if _supports_tools() else [],
    before_model_callback=limit_tool_calls(query_repair_procedure),
    on_tool_error_callback=return_argument_errors,
    output_schema=FindingDraft,
    generate_content_config=types.GenerateContentConfig(
        temperature=0.1, max_output_tokens=AGENT_MAX_OUTPUT_TOKENS
    ),
)
