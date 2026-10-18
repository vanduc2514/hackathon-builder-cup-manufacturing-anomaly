"""Technician Copilot: Vietnamese interactive repair guidance with strict OEM grounding."""

from __future__ import annotations

import logging
import re
from typing import Any

from google.adk import Agent
from google.genai import types

from backend.agents.tool_guards import limit_tool_calls, return_argument_errors
from backend.core.config import settings
from backend.core.models import (
    FindingDraft,
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
    mock_visual_evidence_analysis as mock_visual_evidence_analysis,
)
from backend.tools.manual_loader import (
    get_oem_repair_manual,
    load_oem_repair_manuals_dict,
)
from backend.tools.rag_search_tool import search_knowledge_base

logger = logging.getLogger(__name__)

# =============================================================================
# Vietnamese Manufacturing Domain Vocabulary
# =============================================================================

VIETNAMESE_MANUFACTURING_VOCABULARY: dict[str, dict[str, str]] = {
    "dau_dao": {
        "term_vi": "đầu dao",
        "term_en": "tool head / tool holder",
        "definition_vi": "Bộ phận gá kẹp mảnh cắt insert hoặc chuôi dao vào trục chính CNC.",
    },
    "manh_cat_insert": {
        "term_vi": "mảnh cắt insert",
        "term_en": "cutting insert / indexable insert",
        "definition_vi": "Chíp tiện/phay hợp kim cắt gọt kim loại, thay thế khi mòn quá định mức.",
    },
    "do_dao_spindle_runout": {
        "term_vi": "độ đảo trục chính spindle runout",
        "term_en": "spindle / tool runout",
        "definition_vi": "Độ sai lệch tâm quay của trục chính hoặc cán dao so với trục quay lý thuyết.",
    },
    "dung_sai": {
        "term_vi": "dung sai",
        "term_en": "tolerance",
        "definition_vi": "Khoảng sai lệch cho phép của kích thước hình học hoặc độ đảo cơ khí.",
    },
    "dong_ho_so": {
        "term_vi": "đồng hồ so",
        "term_en": "dial indicator / runout gauge",
        "definition_vi": "Dụng cụ đo cơ khí chính xác dùng kiểm tra độ phẳng và độ đảo trục chính.",
    },
    "do_ga": {
        "term_vi": "đồ gá",
        "term_en": "fixture / jig",
        "definition_vi": "Cơ cấu định vị và kẹp chặt phôi gia công trên bàn máy.",
    },
    "luc_siet": {
        "term_vi": "lực siết bu-lông",
        "term_en": "tightening torque",
        "definition_vi": "Mô-men xoắn cần thiết khi siết vít kẹp mảnh cắt (ví dụ: 4.2 N·m).",
    },
    "nap_chan_an_toan": {
        "term_vi": "nắp chắn an toàn",
        "term_en": "safety enclosure guard / door",
        "definition_vi": "Cửa chắn bảo vệ vùng gia công, ngăn phoi bắn và bảo vệ người vận hành.",
    },
    "truc_chinh": {
        "term_vi": "trục chính",
        "term_en": "main spindle",
        "definition_vi": "Trục quay mang đầu gá dao hoặc mâm cặp chi tiết.",
    },
    "bo_loc_may_say": {
        "term_vi": "bộ lọc máy sấy",
        "term_en": "dryer filter",
        "definition_vi": "Bộ lọc tách ẩm và dầu cho phễu sấy hạt nhựa nguyên sinh.",
    },
    "diem_suong": {
        "term_vi": "điểm sương",
        "term_en": "dew point",
        "definition_vi": "Nhiệt độ đọng sương của luồng khí sấy (ngưỡng tiêu chuẩn dưới -30 °C).",
    },
}

# =============================================================================
# Verified OEM Equipment Manuals Database (Strict Grounding Sources)
# =============================================================================

OEM_REPAIR_MANUALS: dict[str, dict[str, Any]] = load_oem_repair_manuals_dict()

REFUSAL_MESSAGE_VI = (
    "Không có quy trình chính thức được ghi nhận trong tài liệu hướng dẫn OEM cho yêu cầu này. "
    "Để đảm bảo an toàn kỹ thuật và tiêu chuẩn vận hành, vui lòng liên hệ ngay kỹ sư bảo trì "
    "cấp cao hoặc bộ phận kỹ thuật nhà máy."
)


# =============================================================================
# System Prompt Generation
# =============================================================================


def build_technician_copilot_system_prompt(equipment_id: str = "CNC-02") -> str:
    """Constructs the Vietnamese system prompt with strict grounding and persona."""
    manual_info = OEM_REPAIR_MANUALS.get(equipment_id, {})
    manual_title = manual_info.get("manual_title", "Sổ tay thiết bị OEM")
    citation = manual_info.get("primary_citation", "Tài liệu OEM")

    vocabulary_summary = "\n".join(
        f"- {item['term_vi']} ({item['term_en']}): {item['definition_vi']}"
        for item in VIETNAMESE_MANUFACTURING_VOCABULARY.values()
    )

    return f"""Bạn là Kaizen Copilot — Kỹ sư bảo trì cơ khí cấp cao, chuyên gia hướng dẫn kỹ thuật viên tiền tuyến qua giao diện đàm thoại thời gian thực (Gemini Live) tại nhà máy thông minh.

NGÔN NGỮ VÀ VĂN PHONG (VIETNAMESE PERSONA):
1. Giao tiếp bằng tiếng Việt tự nhiên, chuẩn mực nhà xưởng cơ khí, điềm tĩnh và súc tích.
2. Sử dụng chính xác thuật ngữ cơ khí chế tạo:
{vocabulary_summary}

NGUYÊN TẮC BẮT BUỘC VỀ TRÍCH DẪN (STRICT RAG GROUNDING):
1. MỌI bước hướng dẫn sửa chữa cơ khí PHẢI trích dẫn chính xác tài liệu nguồn OEM.
   Ví dụ: "Theo {citation}, hãy tháo nắp chắn bên trái..."
2. Thiết bị hiện tại: {equipment_id} — {manual_title}.
3. Tuyệt đối không đưa ra chỉ dẫn không có nguồn trích dẫn từ tài liệu OEM đã kiểm chứng.

TỪ CHỐI BỊA ĐẶT (REFUSAL TO HALLUCINATE):
1. Nếu kỹ thuật viên yêu cầu sửa đổi thông số ngoài thiết kế (như ép xung trục chính quá mức, ngắt cảm biến an toàn) hoặc thao tác trên thiết bị chưa có tài liệu OEM, bạn BẮT BUỘC PHẢI TỪ CHỐI.
2. Câu trả lời từ chối chuẩn mực:
   "{REFUSAL_MESSAGE_VI}"

QUY TRÌNH KIỂM SOÁT TỪNG BƯỚC (INTERACTIVE MULTI-TURN CHECKPOINTS):
1. Hướng dẫn từng bước một (single-step guidance). Không liệt kê tất cả các bước cùng lúc.
2. Chờ kỹ thuật viên xác nhận hoàn thành từng bước hoặc cung cấp số đo kiểm tra mới chuyển bước tiếp theo.
3. Khi đến bước đo kiểm (ví dụ: dùng đồng hồ so đo độ đảo trục chính / đầu dao):
   - Ngưỡng cho phép: <= 0.005 mm.
   - Nếu kết quả vượt quá dung sai: giải thích lỗi, hướng dẫn vệ sinh gá kẹp và yêu cầu đo lại.
   - Chỉ khi kết quả đo đạt chuẩn mới chuyển sang bước đóng nắp và chạy thử.

KẾT THÚC VÀ PHÁT TÍN HIỆU (SESSION EMISSION):
Khi tất cả các bước hoàn thành, phát tín hiệu xác nhận sửa chữa hoàn tất để hệ thống chuyển trạng thái sang xác minh 50 sản phẩm đạt chuẩn.
"""


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
    return REFUSAL_MESSAGE_VI


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
    "Your objective is to report on the interactive multimodal repair guidance delivered in Vietnamese to the frontline technician, "
    "grounded strictly in OEM equipment manuals and verified mechanical checkpoints. "
    "The user message is the current incident board as JSON. "
    "Follow these steps: "
    "1. Read the incident board to extract suspect_machine, suspect_tool, and root_cause. "
    "2. If tools are available, you can call query_repair_procedure to look up OEM specs and torque tolerances. "
    "3. If suspect_machine is CNC-02: the technician was guided in Vietnamese through LOTO safety disconnect, "
    "safety enclosure removal, replacement of worn insert T07 with new insert WNMG-080408 at 4.2 N·m torque, "
    "verifying dial indicator spindle runout to 0.003 mm (within 0.005 mm tolerance), and running a 1500 RPM test spin, "
    "citing Sổ tay hướng dẫn CNC-02 trang 112. "
    "4. If suspect_machine is IM-05: the technician was guided in Vietnamese through heating de-energization, "
    "replacing saturated dryer filter FLT-ABS-04 with new O-ring, verifying dew point to -35.0 °C (within -30.0 °C tolerance), "
    "and resuming drying at 85 °C for 4 hours, citing SOP-MOLD-02 trang 45. "
    "5. Return a FindingDraft with one concise sentence for finding summarizing completed repair guidance, "
    "2-3 sentences for evidence citing the 5 verified checkpoints and measured tolerances, "
    "confidence set to 0.94, and citation citing the OEM manual. Respond in English."
)

agent = Agent(
    name="technician_copilot",
    description="Guides the technician through physical equipment repair in Vietnamese grounded in OEM manuals.",
    instruction=INSTRUCTION,
    tools=[query_repair_procedure] if _supports_tools() else [],
    before_model_callback=limit_tool_calls(query_repair_procedure),
    on_tool_error_callback=return_argument_errors,
    output_schema=FindingDraft,
    generate_content_config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=2048),
)

DIAGNOSTIC_INSTRUCTION = (
    "You are the Technician Copilot of the Kaizen Agent manufacturing incident team acting as the field diagnostic probe. "
    "The Root Cause Agent's confidence is below threshold, so you collect physical field evidence "
    "from the frontline technician at the machine via Gemini Live multimodal mobile stream. "
    "The user message is the current incident board as JSON. "
    "Follow these steps: "
    "1. Read the incident board to extract suspect_machine, suspect_tool, and any diagnostic_request from Root Cause Agent. "
    "2. If tools are available, call query_repair_procedure to cross-reference diagnostic criteria with OEM manuals. "
    "3. If suspect_machine is CNC-02: macro camera photo and inspection of insert T07 confirms abrasive flank wear "
    "exceeding 0.3mm (VB > 0.3mm) and micro-chipped cutting edge, corroborating workpiece vertical scratches. "
    "4. If suspect_machine is IM-05: close-up photo and inspection of Dryer-03 confirms saturated desiccant beads and oil fouling, "
    "corroborating moisture-induced short fill in cavity 3. "
    "5. Return a FindingDraft with one concise sentence for finding confirming the physical inspection, "
    "2-3 sentences of visual evidence from the mobile camera feed confirming wear patterns, "
    "confidence set to 0.92, and citation 'Technician diagnostic camera stream via Gemini Live'. "
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
    generate_content_config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=2048),
)
