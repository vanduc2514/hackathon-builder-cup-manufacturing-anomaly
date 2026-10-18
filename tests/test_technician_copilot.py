"""Unit tests for Technician Copilot Vietnamese repair guidance, grounded prompts, and telemetry."""

from __future__ import annotations

from backend.agents.agent_technician_copilot import (
    OEM_REPAIR_MANUALS,
    REFUSAL_MESSAGE_VI,
    VIETNAMESE_MANUFACTURING_VOCABULARY,
    build_technician_copilot_system_prompt,
    generate_refusal,
    get_oem_manual_citations,
    is_action_grounded,
    parse_metric_from_text,
    validate_metric_measurement,
)
from backend.core.models import RepairCheckpoint

# =============================================================================
# 1. Domain-Specific Vietnamese Persona & Vocabulary Tests
# =============================================================================


def test_vietnamese_manufacturing_vocabulary():
    """Ensures domain vocabulary contains required Vietnamese industrial terms."""
    terms_vi = {item["term_vi"] for item in VIETNAMESE_MANUFACTURING_VOCABULARY.values()}

    assert "đầu dao" in terms_vi
    assert "mảnh cắt insert" in terms_vi
    assert "độ đảo trục chính spindle runout" in terms_vi
    assert "dung sai" in terms_vi
    assert "đồng hồ so" in terms_vi
    assert "lực siết bu-lông" in terms_vi
    assert "nắp chắn an toàn" in terms_vi
    assert "trục chính" in terms_vi
    assert "bộ lọc máy sấy" in terms_vi
    assert "điểm sương" in terms_vi


def test_system_prompt_vietnamese_persona_and_grounding():
    """Ensures system prompt enforces persona, domain vocabulary, OEM citations, and refusal rules."""
    prompt = build_technician_copilot_system_prompt("CNC-02")

    # Persona & Language
    assert "Kaizen Copilot" in prompt
    assert "tiếng Việt" in prompt
    assert "đầu dao" in prompt
    assert "mảnh cắt insert" in prompt
    assert "độ đảo trục chính spindle runout" in prompt
    assert "đồng hồ so" in prompt
    assert "dung sai" in prompt

    # Strict RAG Grounding
    assert "Sổ tay hướng dẫn CNC-02 trang 112" in prompt
    assert "STRICT RAG GROUNDING" in prompt

    # Refusal to hallucinate
    assert "TỪ CHỐI BỊA ĐẶT" in prompt
    assert REFUSAL_MESSAGE_VI in prompt

    # Checkpoint verification gate (< 0.005 mm)
    assert "0.005 mm" in prompt


# =============================================================================
# 2. Strict OEM Manual RAG Grounding Tests
# =============================================================================


def test_oem_manual_knowledge_base():
    """Verifies that all checkpoints in OEM database include verified manual citations."""
    assert "CNC-02" in OEM_REPAIR_MANUALS
    assert "IM-05" in OEM_REPAIR_MANUALS

    cnc_data = OEM_REPAIR_MANUALS["CNC-02"]
    assert "Sổ tay hướng dẫn CNC-02 trang 112" in cnc_data["primary_citation"]
    assert len(cnc_data["checkpoints"]) == 5

    for cp in cnc_data["checkpoints"]:
        assert "citation" in cp
        assert "Sổ tay hướng dẫn CNC-02 trang 112" in cp["citation"]
        assert len(cp["instruction_vi"]) > 20


def test_get_oem_manual_citations():
    """Tests citation lookup helper."""
    citations = get_oem_manual_citations("CNC-02")
    assert len(citations) == 5
    assert all("CNC-02 trang 112" in c for c in citations)

    unknown_citations = get_oem_manual_citations("UNKNOWN-MACHINE")
    assert unknown_citations == []


def test_is_action_grounded():
    """Tests action verification against OEM supported capabilities."""
    assert is_action_grounded("CNC-02", "Cần thay mảnh cắt insert T07") is True
    assert is_action_grounded("CNC-02", "Kiểm tra độ đảo bằng đồng hồ so") is True
    assert is_action_grounded("CNC-02", "Tự chế đồ gá gia công gỗ") is False
    assert is_action_grounded("UNKNOWN-MACHINE", "Thay dao") is False


# =============================================================================
# 3. Refusal to Hallucinate Tests
# =============================================================================


def test_generate_refusal():
    """Verifies standard refusal message format and escalation advice."""
    refusal = generate_refusal("ép xung trục chính")
    assert REFUSAL_MESSAGE_VI == refusal
    assert "kỹ sư bảo trì cấp cao" in refusal




# =============================================================================
# 4. Interactive Multi-Turn Checkpoint Verification Tests
# =============================================================================


def test_parse_metric_from_text():
    """Tests regex float extraction supporting Vietnamese comma and period separators."""
    assert parse_metric_from_text("Độ đảo là 0.003 mm") == 0.003
    assert parse_metric_from_text("Số đo là 0,004 mm") == 0.004
    assert parse_metric_from_text("Điểm sấy -32.5 độ C") == -32.5
    assert parse_metric_from_text("Không có số nào ở đây") is None


def test_validate_metric_measurement():
    """Tests numeric threshold verification logic."""
    cp_runout = RepairCheckpoint(
        step_number=4,
        title_vi="Đo độ đảo",
        instruction_vi="Đo đồng hồ so",
        citation="Sổ tay CNC trang 112",
        metric_name="Độ đảo",
        target_threshold=0.005,
        comparator="<=",
        unit="mm",
    )

    # Passing measurement (0.003 <= 0.005)
    passed, msg = validate_metric_measurement(cp_runout, 0.003)
    assert passed is True
    assert "đạt chuẩn" in msg
    assert "0.003 mm" in msg

    # Failing measurement (0.012 > 0.005)
    passed, msg = validate_metric_measurement(cp_runout, 0.012)
    assert passed is False
    assert "không đạt" in msg
    assert "vượt dung sai" in msg
    assert "đo lại" in msg




# =============================================================================
# 5. Session Telemetry & State Emission to Blackboard Tests
# =============================================================================






