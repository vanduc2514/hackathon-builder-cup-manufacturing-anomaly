"""Technician Copilot: Vietnamese interactive repair guidance with strict OEM grounding."""

from __future__ import annotations

import datetime
import logging
import re
from typing import Any

from google.adk import Agent
from google.genai import types

from backend.agents.tool_guards import limit_tool_calls, return_argument_errors
from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import (
    AgentFinding,
    CopilotSessionTelemetry,
    CopilotTurn,
    FindingDraft,
    RAGSearchResult,
    RepairCheckpoint,
    VisualEvidencePayload,
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

OEM_REPAIR_MANUALS: dict[str, dict[str, Any]] = {
    "CNC-02": {
        "equipment_name": "Máy CNC phay/tiện tự động CNC-02 (DMG MORI / Fanuc)",
        "manual_title": "Sổ tay hướng dẫn vận hành & bảo trì CNC-02 (OEM Manual 2024)",
        "primary_citation": "Sổ tay hướng dẫn CNC-02 trang 112, mục 4.2",
        "supported_actions": [
            "thay mảnh cắt",
            "thay insert",
            "kiểm tra độ đảo",
            "đo độ đảo",
            "đo đồng hồ so",
            "ngắt nguồn",
            "loto",
            "nắp chắn",
            "siết vít",
            "chạy thử",
        ],
        "checkpoints": [
            {
                "step_number": 1,
                "title_vi": "Khóa an toàn LOTO & ngắt nguồn",
                "instruction_vi": (
                    "Theo sổ tay hướng dẫn máy CNC-02 trang 112 mục 4.2.1, nhấn nút dừng "
                    "khẩn cấp E-Stop, ngắt cầu dao nguồn chính và treo biển cảnh báo LOTO "
                    "trước khi can thiệp vào khoang máy."
                ),
                "citation": "Sổ tay hướng dẫn CNC-02 trang 112, mục 4.2.1",
                "metric_name": None,
                "target_threshold": None,
                "comparator": "<=",
                "unit": None,
            },
            {
                "step_number": 2,
                "title_vi": "Mở nắp chắn an toàn & kiểm tra mảnh cắt insert T07",
                "instruction_vi": (
                    "Theo sổ tay hướng dẫn máy CNC-02 trang 112 mục 4.2.2, mở nắp chắn bảo vệ "
                    "bên trái khoang gia công, dùng đèn kiểm tra mảnh cắt insert T07. "
                    "Quan sát dấu hiệu mòn mặt sau (flank wear) hoặc mẻ lưỡi cắt."
                ),
                "citation": "Sổ tay hướng dẫn CNC-02 trang 112, mục 4.2.2",
                "metric_name": None,
                "target_threshold": None,
                "comparator": "<=",
                "unit": None,
            },
            {
                "step_number": 3,
                "title_vi": "Tháo insert cũ & lắp mảnh cắt mới chuẩn lực siết",
                "instruction_vi": (
                    "Theo sổ tay hướng dẫn máy CNC-02 trang 112 mục 4.2.3, dùng khóa lục giác "
                    "nới vít kẹp, tháo insert T07 đã mòn. Vệ sinh sạch hốc gá dao, lắp mảnh cắt "
                    "mới mã WNMG-080408 và siết với lực siết định mức 4.2 N·m bằng cờ lê lực."
                ),
                "citation": "Sổ tay hướng dẫn CNC-02 trang 112, mục 4.2.3",
                "metric_name": None,
                "target_threshold": None,
                "comparator": "<=",
                "unit": None,
            },
            {
                "step_number": 4,
                "title_vi": "Đo độ đảo trục chính / đầu dao bằng đồng hồ so",
                "instruction_vi": (
                    "Theo sổ tay hướng dẫn máy CNC-02 trang 112 mục 4.2.4, gá đồng hồ so lên "
                    "bàn máy, rà đầu kim vào mặt chuẩn của đầu dao/trục chính. Quay nhẹ trục chính "
                    "bằng tay 360 độ. Độ đảo trục chính (spindle runout) bắt buộc phải nhỏ hơn "
                    "hoặc bằng dung sai tối đa 0.005 mm."
                ),
                "citation": "Sổ tay hướng dẫn CNC-02 trang 112, mục 4.2.4",
                "metric_name": "Độ đảo trục chính (spindle runout)",
                "target_threshold": 0.005,
                "comparator": "<=",
                "unit": "mm",
            },
            {
                "step_number": 5,
                "title_vi": "Đóng nắp chắn an toàn & chạy thử không tải",
                "instruction_vi": (
                    "Theo sổ tay hướng dẫn máy CNC-02 trang 112 mục 4.2.5, thu dọn dụng cụ, "
                    "đóng nắp chắn bảo vệ, mở khóa E-Stop, reset cảnh báo trên màn hình CNC "
                    "và chạy thử trục chính không tải ở 1,500 RPM trong 60 giây."
                ),
                "citation": "Sổ tay hướng dẫn CNC-02 trang 112, mục 4.2.5",
                "metric_name": None,
                "target_threshold": None,
                "comparator": "<=",
                "unit": None,
            },
        ],
    },
    "IM-05": {
        "equipment_name": "Máy ép phun nhựa IM-05 & Phễu sấy ABS",
        "manual_title": "Sổ tay bảo trì máy ép phun nhựa IM-05 & Hệ thống sấy ABS (OEM Manual 2024)",
        "primary_citation": "SOP-MOLD-02 trang 45, mục 3",
        "supported_actions": [
            "thay lọc",
            "thay bộ lọc",
            "đo điểm sương",
            "kiểm tra điểm sương",
            "sấy hạt nhựa",
            "ngắt nhiệt",
            "khóa khí nén",
        ],
        "checkpoints": [
            {
                "step_number": 1,
                "title_vi": "Khóa nhiệt & cô lập áp khí nén phễu sấy",
                "instruction_vi": (
                    "Theo tài liệu SOP-MOLD-02 trang 45 mục 3.1, ngắt điện trở sấy nhiệt, "
                    "khóa van cấp khí nén vào phễu sấy và xả hết áp dư trên van an toàn."
                ),
                "citation": "SOP-MOLD-02 trang 45, mục 3.1",
                "metric_name": None,
                "target_threshold": None,
                "comparator": "<=",
                "unit": None,
            },
            {
                "step_number": 2,
                "title_vi": "Tháo bộ lọc máy sấy cũ bị nghẹt dầu",
                "instruction_vi": (
                    "Theo tài liệu SOP-MOLD-02 trang 45 mục 3.2, mở khóa ngàm tháo cốc lọc, "
                    "lấy lõi lọc cũ đã nghẹt dầu và vệ sinh sạch khoang chứa cốc lọc."
                ),
                "citation": "SOP-MOLD-02 trang 45, mục 3.2",
                "metric_name": None,
                "target_threshold": None,
                "comparator": "<=",
                "unit": None,
            },
            {
                "step_number": 3,
                "title_vi": "Lắp lõi lọc tách ẩm mới mã FLT-ABS-04",
                "instruction_vi": (
                    "Theo tài liệu SOP-MOLD-02 trang 45 mục 3.3, lắp lõi lọc mới FLT-ABS-04, "
                    "thay vòng đệm gioăng cao su chịu nhiệt O-ring và siết chặt cốc lọc."
                ),
                "citation": "SOP-MOLD-02 trang 45, mục 3.3",
                "metric_name": None,
                "target_threshold": None,
                "comparator": "<=",
                "unit": None,
            },
            {
                "step_number": 4,
                "title_vi": "Đo kiểm tra điểm sương luồng khí sấy",
                "instruction_vi": (
                    "Theo tài liệu SOP-MOLD-02 trang 46 mục 3.4, bật trạm khí khô, gắn đầu đo "
                    "điểm sương (dew point sensor). Điểm sương phải đạt dưới mức tiêu chuẩn "
                    "-30.0 °C trước khi đưa vật liệu vào."
                ),
                "citation": "SOP-MOLD-02 trang 46, mục 3.4",
                "metric_name": "Điểm sương khí sấy",
                "target_threshold": -30.0,
                "comparator": "<=",
                "unit": "°C",
            },
            {
                "step_number": 5,
                "title_vi": "Bật gia nhiệt & duy trì sấy hạt nhựa ABS trong 4 giờ",
                "instruction_vi": (
                    "Theo tài liệu SOP-MOLD-02 trang 46 mục 3.5, cài đặt nhiệt độ sấy 85 °C và "
                    "duy trì sấy lại hạt nhựa ABS trong tối thiểu 4 giờ trước khi mở van cấp liệu "
                    "xuống cụm ép phun cavity 3."
                ),
                "citation": "SOP-MOLD-02 trang 46, mục 3.5",
                "metric_name": None,
                "target_threshold": None,
                "comparator": "<=",
                "unit": None,
            },
        ],
    },
}

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
    manual = OEM_REPAIR_MANUALS.get(equipment_id)
    if not manual:
        return []
    return [step["citation"] for step in manual.get("checkpoints", [])]


def is_action_grounded(equipment_id: str, query: str) -> bool:
    """Verifies whether a requested repair query is supported by OEM documentation."""
    if equipment_id not in OEM_REPAIR_MANUALS:
        return False
    supported = OEM_REPAIR_MANUALS[equipment_id].get("supported_actions", [])
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
# Technician Copilot Session Class
# =============================================================================


class TechnicianCopilot:
    """Interactive multi-turn repair guidance session manager."""

    def __init__(
        self,
        incident_id: str = "INC-0412",
        machine_id: str = "CNC-02",
        tool_id: str | None = "T07",
        root_cause: str | None = "Tool T07 worn past 2,000 part limit",
    ):
        self.incident_id = incident_id
        self.machine_id = machine_id
        self.tool_id = tool_id
        self.root_cause = root_cause

        now_str = datetime.datetime.now().strftime("%H:%M:%S")
        self.session_id = f"VN-COPILOT-{machine_id}-{int(datetime.datetime.now().timestamp())}"

        self.checkpoints: list[RepairCheckpoint] = self._load_checkpoints()
        self.current_step_index: int = 0

        self.telemetry = CopilotSessionTelemetry(
            session_id=self.session_id,
            incident_id=incident_id,
            machine_id=machine_id,
            tool_id=tool_id,
            checkpoints_total=len(self.checkpoints),
            checkpoints_passed=0,
            repair_done=False,
            hallucination_refusals=0,
            transcript=[],
            started_at=now_str,
        )

    def _load_checkpoints(self) -> list[RepairCheckpoint]:
        """Loads checkpoints from verified OEM database for target machine."""
        manual_data = OEM_REPAIR_MANUALS.get(self.machine_id)
        if not manual_data:
            return []
        raw_checkpoints = manual_data.get("checkpoints", [])
        return [RepairCheckpoint(**cp) for cp in raw_checkpoints]

    def get_checkpoints(self) -> list[RepairCheckpoint]:
        return self.checkpoints

    def get_current_checkpoint(self) -> RepairCheckpoint | None:
        if 0 <= self.current_step_index < len(self.checkpoints):
            return self.checkpoints[self.current_step_index]
        return None

    def is_repair_completed(self) -> bool:
        return self.telemetry.repair_done

    def get_initial_greeting(self) -> CopilotTurn:
        """Returns the first turn welcoming technician and presenting Step 1."""
        step = self.get_current_checkpoint()
        if not step:
            greeting = f"Xin chào, hệ thống chưa có dữ liệu OEM cho thiết bị {self.machine_id}."
            citation = "OEM Database"
            step_num = None
        else:
            greeting = (
                f"Xin chào kỹ thuật viên, tôi là Kaizen Copilot. Đang hướng dẫn xử lý sự cố "
                f"máy {self.machine_id} (nguyên nhân: {self.root_cause or 'mòn chi tiết'}).\n\n"
                f"Bước 1: {step.title_vi}\n{step.instruction_vi}\n\n"
                f"Vui lòng hoàn thành và phản hồi 'Đã xong' để chuyển sang bước tiếp theo."
            )
            citation = step.citation
            step_num = step.step_number

        turn = CopilotTurn(
            turn_id=len(self.telemetry.transcript) + 1,
            speaker="copilot",
            message_vi=greeting,
            citation=citation,
            step_number=step_num,
            checkpoint_verified=False,
        )
        self.telemetry.transcript.append(turn)
        self.telemetry.total_turns = len(self.telemetry.transcript)
        return turn

    def get_diagnostic_probe(
        self, confidence: float = 0.65, diagnostic_request: str | None = None
    ) -> CopilotTurn:
        """Returns the diagnostic probe turn verbalizing the photo evidence request in Vietnamese."""
        message_vi = build_contextual_diagnostic_probe_vi(
            confidence=confidence,
            machine_id=self.machine_id,
            tool_id=self.tool_id,
            diagnostic_request=diagnostic_request,
        )
        citation = (
            DEFAULT_DIAGNOSTIC_IM_CITATION
            if "IM" in self.machine_id.upper()
            else DEFAULT_DIAGNOSTIC_CNC_CITATION
        )
        turn = CopilotTurn(
            turn_id=len(self.telemetry.transcript) + 1,
            speaker="copilot",
            message_vi=message_vi,
            citation=citation,
            checkpoint_verified=False,
        )
        self.telemetry.transcript.append(turn)
        self.telemetry.total_turns = len(self.telemetry.transcript)
        return turn

    async def process_field_evidence(
        self,
        image_bytes: bytes,
        filename: str | None = None,
        notes: str | None = None,
    ) -> tuple[CopilotTurn, VisualEvidencePayload, AgentFinding]:
        """Ingests visual photo evidence from technician, updates blackboard, and appends turn."""
        evidence_payload = await analyze_visual_evidence_frame_async(
            image_bytes=image_bytes,
            machine_id=self.machine_id,
            tool_id=self.tool_id,
            filename=filename,
        )

        is_im = "IM" in self.machine_id.upper()
        if is_im:
            response_vi = (
                "Đã nhận hình ảnh cụm sấy Dryer-03. Nhận diện hạt hút ẩm bão hòa (đổi màu) "
                "và gioăng lọc FLT-ABS-04 bám cặn dầu, khớp với nguyên nhân gây thiếu liệu."
            )
        else:
            tool = self.tool_id or "T07"
            response_vi = (
                f"Đã nhận hình ảnh trực tiếp từ camera trạm {self.machine_id}. "
                f"Nhận diện mảnh dao {tool} mòn mặt sau VB=0.35mm và mẻ mép cắt, "
                f"khớp với tọa độ vết xước dọc trên phôi nhôm AL-5083."
            )

        turn = CopilotTurn(
            turn_id=len(self.telemetry.transcript) + 1,
            speaker="copilot",
            message_vi=response_vi,
            citation=evidence_payload.citation,
            checkpoint_verified=True,
        )
        self.telemetry.transcript.append(turn)
        self.telemetry.total_turns = len(self.telemetry.transcript)

        finding = AgentFinding(
            agent_id=AGENT_ID,
            agent_name=AGENT_NAME,
            phase=DIAGNOSTIC_PHASE,
            finding=f"Frontline technician submitted close-up photo confirming defect root cause on {self.machine_id}.",
            evidence=evidence_payload.analysis + (f" Ghi chú: {notes}" if notes else ""),
            confidence=0.92,
            citation=evidence_payload.citation,
        )
        blackboard.attach_field_evidence(finding, evidence_payload)

        return turn, evidence_payload, finding

    async def process_technician_input(
        self, message_vi: str, measured_metric: float | None = None
    ) -> CopilotTurn:
        """Processes a single conversational turn from the technician."""
        # 1. Record technician input
        tech_turn = CopilotTurn(
            turn_id=len(self.telemetry.transcript) + 1,
            speaker="technician",
            message_vi=message_vi,
            metric_value=measured_metric,
        )
        self.telemetry.transcript.append(tech_turn)

        # 1.5 Check if in diagnostic mode and responding to diagnostic prompt
        state = blackboard.get_state()
        lower_msg = message_vi.lower()
        if (state.status == "awaiting_evidence" or state.diagnostic_request) and any(
            k in lower_msg for k in ["bị gì", "sao thế", "làm gì", "kiểm tra", "yêu cầu"]
        ):
            return self.get_diagnostic_probe(
                confidence=0.65, diagnostic_request=state.diagnostic_request
            )

        # 2. Check for ungrounded/hallucination query
        hallucination_triggers = [
            "tăng tốc độ lên 50000",
            "bỏ qua cảm biến",
            "tháo phanh an toàn",
            "không cần khóa nguồn",
            "không cần loto",
            "chế độ tự do",
            "ép xung",
        ]
        if any(trigger in lower_msg for trigger in hallucination_triggers):
            self.telemetry.hallucination_refusals += 1
            refusal_turn = CopilotTurn(
                turn_id=len(self.telemetry.transcript) + 1,
                speaker="copilot",
                message_vi=REFUSAL_MESSAGE_VI,
                citation="Chính sách an toàn & tiêu chuẩn OEM",
                checkpoint_verified=False,
            )
            self.telemetry.transcript.append(refusal_turn)
            self.telemetry.total_turns = len(self.telemetry.transcript)
            return refusal_turn

        # 3. Check current checkpoint state
        current_step = self.get_current_checkpoint()
        if not current_step:
            # Already completed or no steps
            done_msg = (
                "Toàn bộ quy trình sửa chữa đã hoàn thành. Hệ thống đang chuyển sang "
                "bước xác minh chất lượng sản phẩm trên chuyền."
            )
            turn = CopilotTurn(
                turn_id=len(self.telemetry.transcript) + 1,
                speaker="copilot",
                message_vi=done_msg,
                citation="Quy trình hoàn tất",
                checkpoint_verified=True,
            )
            self.telemetry.transcript.append(turn)
            self.telemetry.total_turns = len(self.telemetry.transcript)
            return turn

        # 4. Handle metric verification checkpoint if current step requires one
        if current_step.target_threshold is not None:
            # Check if metric was supplied in parameter or in message text
            extracted_val = measured_metric
            if extracted_val is None:
                extracted_val = parse_metric_from_text(message_vi)

            if extracted_val is not None:
                passed, metric_feedback = validate_metric_measurement(current_step, extracted_val)
                if passed:
                    current_step.is_verified = True
                    current_step.measured_value = extracted_val
                    self.telemetry.checkpoints_passed += 1
                    metric_key = current_step.metric_name or f"step_{current_step.step_number}"
                    self.telemetry.verified_metrics[metric_key] = extracted_val

                    self.current_step_index += 1
                    next_step = self.get_current_checkpoint()
                    if next_step:
                        reply = (
                            f"{metric_feedback}\n\n"
                            f"Bước {next_step.step_number}: {next_step.title_vi}\n"
                            f"{next_step.instruction_vi}\n\n"
                            f"Vui lòng báo 'Đã xong' sau khi hoàn thành."
                        )
                        next_cit = next_step.citation
                        next_num = next_step.step_number
                    else:
                        reply = (
                            f"{metric_feedback}\n\n"
                            f"Xuất sắc! Tất cả các bước sửa chữa cho máy {self.machine_id} "
                            f"đã hoàn thành đúng tiêu chuẩn OEM. Báo cáo hoàn tất đã sẵn sàng."
                        )
                        next_cit = current_step.citation
                        next_num = current_step.step_number
                        self.telemetry.repair_done = True

                    turn = CopilotTurn(
                        turn_id=len(self.telemetry.transcript) + 1,
                        speaker="copilot",
                        message_vi=reply,
                        citation=next_cit,
                        step_number=next_num,
                        checkpoint_verified=True,
                        metric_value=extracted_val,
                    )
                    self.telemetry.transcript.append(turn)
                    self.telemetry.total_turns = len(self.telemetry.transcript)
                    return turn
                else:
                    # Metric failed threshold: prompt technician to fix and re-measure
                    turn = CopilotTurn(
                        turn_id=len(self.telemetry.transcript) + 1,
                        speaker="copilot",
                        message_vi=metric_feedback,
                        citation=current_step.citation,
                        step_number=current_step.step_number,
                        checkpoint_verified=False,
                        metric_value=extracted_val,
                    )
                    self.telemetry.transcript.append(turn)
                    self.telemetry.total_turns = len(self.telemetry.transcript)
                    return turn
            else:
                # Prompt technician for metric measurement
                prompt_metric = (
                    f"Bước {current_step.step_number} yêu cầu đo kiểm: "
                    f"Vui lòng dùng {current_step.title_vi.lower()} và đọc số đo cụ thể "
                    f"(tiêu chuẩn {current_step.comparator} {current_step.target_threshold} {current_step.unit or ''}). "
                    f"[{current_step.citation}]"
                )
                turn = CopilotTurn(
                    turn_id=len(self.telemetry.transcript) + 1,
                    speaker="copilot",
                    message_vi=prompt_metric,
                    citation=current_step.citation,
                    step_number=current_step.step_number,
                    checkpoint_verified=False,
                )
                self.telemetry.transcript.append(turn)
                self.telemetry.total_turns = len(self.telemetry.transcript)
                return turn

        # 5. Handle standard confirmation checkpoint (e.g. "Đã xong", "OK", "Xong bước 1", "Đã mở nắp", "Đã tháo")
        question_words = [
            "?",
            "sao",
            "thế nào",
            "như thế nào",
            "làm gì",
            "ở đâu",
            "bao nhiêu",
            "có phải",
        ]
        is_question = any(q in lower_msg for q in question_words)

        confirmation_phrases = [
            "xong",
            "đã xong",
            "da xong",
            "ok",
            "đã hoàn thành",
            "da hoan thanh",
            "done",
            "rồi",
            "roi",
            "đã ngắt",
            "đã tháo",
            "đã lắp",
            "đã mở",
            "đã đóng",
            "đã kiểm tra",
            "đã cài",
            "đã vệ sinh",
            "đã sấy",
            "đã ",
            "da ",
            "thấy mòn",
            "bị mòn",
            "mẻ",
        ]
        is_confirmed = not is_question and any(
            phrase in lower_msg for phrase in confirmation_phrases
        )

        if is_confirmed:
            current_step.is_verified = True
            self.telemetry.checkpoints_passed += 1
            self.current_step_index += 1

            next_step = self.get_current_checkpoint()
            if next_step:
                reply = (
                    f"Đã ghi nhận hoàn tất bước {current_step.step_number}. [{current_step.citation}]\n\n"
                    f"Bước {next_step.step_number}: {next_step.title_vi}\n"
                    f"{next_step.instruction_vi}\n\n"
                )
                if next_step.target_threshold is not None:
                    reply += (
                        f"Bước này yêu cầu đo lường cụ thể ({next_step.metric_name}). "
                        f"Hãy báo kết quả đo bằng đồng hồ so."
                    )
                else:
                    reply += "Vui lòng báo 'Đã xong' sau khi hoàn thành."

                turn = CopilotTurn(
                    turn_id=len(self.telemetry.transcript) + 1,
                    speaker="copilot",
                    message_vi=reply,
                    citation=next_step.citation,
                    step_number=next_step.step_number,
                    checkpoint_verified=True,
                )
            else:
                self.telemetry.repair_done = True
                reply = (
                    f"Đã hoàn tất toàn bộ quy trình bảo trì cho máy {self.machine_id}. "
                    f"Cảm ơn kỹ thuật viên. Đang gửi tín hiệu hoàn tất sửa chữa lên hệ thống."
                )
                turn = CopilotTurn(
                    turn_id=len(self.telemetry.transcript) + 1,
                    speaker="copilot",
                    message_vi=reply,
                    citation=current_step.citation,
                    step_number=current_step.step_number,
                    checkpoint_verified=True,
                )

            self.telemetry.transcript.append(turn)
            self.telemetry.total_turns = len(self.telemetry.transcript)
            return turn

        # 6. General question or clarification
        clarification = (
            f"Tôi đã nghe rõ. Hiện tại chúng ta đang ở Bước {current_step.step_number}: "
            f"{current_step.title_vi}. Hướng dẫn chi tiết: {current_step.instruction_vi} "
            f"[{current_step.citation}]. Khi hoàn thành hãy báo 'Đã xong' hoặc gửi số đo kiểm tra."
        )
        turn = CopilotTurn(
            turn_id=len(self.telemetry.transcript) + 1,
            speaker="copilot",
            message_vi=clarification,
            citation=current_step.citation,
            step_number=current_step.step_number,
            checkpoint_verified=False,
        )
        self.telemetry.transcript.append(turn)
        self.telemetry.total_turns = len(self.telemetry.transcript)
        return turn

    async def emit_repair_completion(self) -> AgentFinding:
        """Emits completed repair status and AgentFinding to the Blackboard."""
        now_str = datetime.datetime.now().strftime("%H:%M:%S")
        self.telemetry.completed_at = now_str
        self.telemetry.repair_done = True

        metric_details = []
        for k, v in self.telemetry.verified_metrics.items():
            metric_details.append(f"{k}: {v}")
        metric_str = ", ".join(metric_details) if metric_details else "Thông số đạt tiêu chuẩn OEM"

        finding = AgentFinding(
            agent_id="COPILOT",
            agent_name="Technician Copilot",
            phase="Phase C - Resolution",
            finding=(
                f"Hoàn tất quy trình sửa chữa máy {self.machine_id} bằng tiếng Việt. "
                f"Đã xác minh toàn bộ {self.telemetry.checkpoints_passed}/{self.telemetry.checkpoints_total} "
                f"bước chuẩn OEM."
            ),
            evidence=(
                f"Kỹ thuật viên đã hoàn thành thay thế và đo kiểm ({metric_str}). "
                f"Tổng số lượt đối thoại: {self.telemetry.total_turns}. "
                f"Không có vi phạm an toàn."
            ),
            confidence=0.96,
            citation=OEM_REPAIR_MANUALS.get(self.machine_id, {}).get(
                "primary_citation", "OEM Manual 2024"
            ),
            timestamp=now_str,
        )

        # Update Blackboard state
        blackboard.set_repair_done(True)
        blackboard.update_status(
            "verifying",
            repair_done=True,
            suspect_machine=self.machine_id,
            suspect_tool=self.tool_id,
            root_cause=self.root_cause,
        )
        blackboard.add_finding(finding)

        logger.info(
            "Technician Copilot session %s completed. repair_done=True emitted to Blackboard.",
            self.session_id,
        )
        return finding

    def get_session_telemetry(self) -> CopilotSessionTelemetry:
        return self.telemetry


# =============================================================================
# High-Level Simulation & Execution Function
# =============================================================================


async def run_technician_repair(
    incident_id: str = "INC-0412",
    machine_id: str = "CNC-02",
    tool_id: str = "T07",
    root_cause: str = "Tool T07 worn past 2,000 part limit",
    simulated_inputs: list[dict[str, Any]] | None = None,
) -> CopilotSessionTelemetry:
    """Runs a complete interactive technician repair session and emits completion."""
    session = TechnicianCopilot(
        incident_id=incident_id,
        machine_id=machine_id,
        tool_id=tool_id,
        root_cause=root_cause,
    )

    # Initial greeting turn
    session.get_initial_greeting()

    if simulated_inputs is None:
        # Default realistic CNC-02 repair walkthrough
        simulated_inputs = [
            {"message": "Đã ngắt nguồn và gắn biển LOTO an toàn"},
            {"message": "Đã mở nắp chắn và kiểm tra mảnh cắt T07 thấy mòn mặt sau"},
            {"message": "Đã tháo dao mòn và lắp mảnh insert mới, siết lực 4.2 N.m"},
            {"message": "Tôi dùng đồng hồ so đo độ đảo được 0.003 mm"},
            {"message": "Đã đóng nắp chắn bảo vệ và chạy thử không tải 1500 RPM xong"},
        ]

    for user_input in simulated_inputs:
        msg = user_input.get("message", "")
        metric = user_input.get("metric")
        await session.process_technician_input(msg, measured_metric=metric)

    if session.is_repair_completed():
        await session.emit_repair_completion()

    return session.get_session_telemetry()


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
