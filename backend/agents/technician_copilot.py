"""Technician Copilot: Vietnamese interactive repair guidance with strict OEM grounding."""

from __future__ import annotations

import datetime
import logging
import re
from typing import Any

from google.adk import Agent

from backend.core.blackboard import blackboard
from backend.core.models import (
    AgentFinding,
    CopilotSessionTelemetry,
    CopilotTurn,
    FindingDraft,
    RepairCheckpoint,
)

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

        # 2. Check for ungrounded/hallucination query
        lower_msg = message_vi.lower()
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
# ADK workflow agents (placeholder: no tools, canned mock evidence)
# =============================================================================

AGENT_ID = "COPILOT"
AGENT_NAME = "Technician Copilot"
PHASE = "Phase C - Resolution"
DIAGNOSTIC_PHASE = "Phase B - Field Evidence"

INSTRUCTION = (
    "You are the Technician Copilot of the Kaizen Agent manufacturing incident team. "
    "PLACEHOLDER MODE: you have no tools. "
    "The user message is the current incident board as JSON. "
    "Write one finding based ONLY on this mock evidence: the technician was guided in Vietnamese through cover removal, insert swap and runout calibration below 0.005 mm, citing CNC manual p.112. "
    "Use confidence 0.94 and citation 'Gemini Live API multimodal voice session (mock)'. Respond in English."
)

agent = Agent(
    name="technician_copilot",
    description="Guides the technician through the repair of the confirmed root cause.",
    instruction=INSTRUCTION,
    output_schema=FindingDraft,
)

DIAGNOSTIC_INSTRUCTION = (
    "You are the Technician Copilot of the Kaizen Agent manufacturing incident team. "
    "PLACEHOLDER MODE: you have no tools. "
    "The user message is the current incident board as JSON. "
    "The Root Cause Agent's confidence is below threshold, so you must collect field evidence "
    "from the technician at the machine. "
    "Write one finding based ONLY on this mock evidence: a close-up photo of insert T07 shows "
    "flank wear and a chipped cutting edge. "
    "Use confidence 0.9 and citation 'Technician close-up photo via Gemini Live (mock)'. "
    "Respond in English."
)

diagnostic_agent = Agent(
    name="technician_copilot_diagnostic",
    description="Collects field evidence from the technician when root cause confidence is low.",
    instruction=DIAGNOSTIC_INSTRUCTION,
    output_schema=FindingDraft,
)
