"""Unit tests for Technician Copilot Vietnamese repair guidance, grounded prompts, and telemetry."""

from __future__ import annotations

import asyncio

from backend.agents.technician_copilot import (
    OEM_REPAIR_MANUALS,
    REFUSAL_MESSAGE_VI,
    VIETNAMESE_MANUFACTURING_VOCABULARY,
    TechnicianCopilot,
    build_technician_copilot_system_prompt,
    generate_refusal,
    get_oem_manual_citations,
    is_action_grounded,
    parse_metric_from_text,
    run_technician_repair,
    validate_metric_measurement,
)
from backend.core.blackboard import blackboard
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


def test_copilot_session_refuses_unsafe_hallucinations():
    """Technician asks for ungrounded/unsafe action -> Copilot strictly refuses."""

    async def _test():
        session = TechnicianCopilot(incident_id="INC-0412", machine_id="CNC-02")
        session.get_initial_greeting()

        reply_turn = await session.process_technician_input(
            "Hãy ép xung tăng tốc độ lên 50000 RPM mà không cần kiểm tra"
        )
        assert reply_turn.speaker == "copilot"
        assert reply_turn.message_vi == REFUSAL_MESSAGE_VI
        assert reply_turn.checkpoint_verified is False
        assert session.telemetry.hallucination_refusals == 1
        assert session.current_step_index == 0

    asyncio.run(_test())


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


def test_multi_turn_repair_checkpoint_progression_and_metric_gate():
    """Full multi-turn interactive session with metric rejection then pass."""

    async def _test():
        session = TechnicianCopilot(
            incident_id="INC-0412",
            machine_id="CNC-02",
            tool_id="T07",
            root_cause="Tool T07 worn past 2,000 part limit",
        )

        # Turn 0: Greeting
        greeting = session.get_initial_greeting()
        assert "Kaizen Copilot" in greeting.message_vi
        assert "Bước 1" in greeting.message_vi
        assert session.current_step_index == 0

        # Turn 1: Confirm Step 1 (LOTO)
        t1 = await session.process_technician_input("Đã ngắt nguồn và cài biển LOTO")
        assert "Bước 2" in t1.message_vi
        assert session.current_step_index == 1

        # Turn 2: Confirm Step 2 (Check Insert)
        t2 = await session.process_technician_input("Đã mở nắp chắn, thấy mảnh cắt T07 bị mòn")
        assert "Bước 3" in t2.message_vi
        assert session.current_step_index == 2

        # Turn 3: Confirm Step 3 (Replace Insert with 4.2 N.m)
        t3 = await session.process_technician_input("Đã lắp mảnh cắt mới và siết 4.2 N.m xong")
        assert "Bước 4" in t3.message_vi
        assert session.current_step_index == 3
        # Step 4 requires metric verification (< 0.005 mm)
        assert session.get_current_checkpoint().target_threshold == 0.005

        # Turn 4a: Technician inputs FAILING metric (0.012 mm > 0.005 mm)
        t4a = await session.process_technician_input("Đồng hồ so báo 0.012 mm")
        assert t4a.checkpoint_verified is False
        assert "không đạt" in t4a.message_vi
        assert "vượt dung sai" in t4a.message_vi
        # Session must NOT advance
        assert session.current_step_index == 3
        assert session.is_repair_completed() is False

        # Turn 4b: Technician fixes seat and inputs PASSING metric (0.003 mm <= 0.005 mm)
        t4b = await session.process_technician_input("Đã vệ sinh côn gá, đo lại được 0.003 mm")
        assert t4b.checkpoint_verified is True
        assert "đạt chuẩn" in t4b.message_vi
        assert "Bước 5" in t4b.message_vi
        assert session.current_step_index == 4
        assert session.telemetry.verified_metrics["Độ đảo trục chính (spindle runout)"] == 0.003

        # Turn 5: Confirm Step 5 (Guard & test spin)
        t5 = await session.process_technician_input("Đã đóng nắp và chạy thử 1500 RPM hoàn thành")
        assert t5.checkpoint_verified is True
        assert session.is_repair_completed() is True
        assert session.telemetry.checkpoints_passed == 5

    asyncio.run(_test())


# =============================================================================
# 5. Session Telemetry & State Emission to Blackboard Tests
# =============================================================================


def test_blackboard_state_emission_on_repair_completion():
    """Ensures completion emits repair_done=True, AgentFinding, and updates Blackboard."""

    async def _test():
        blackboard.reset()
        assert blackboard.get_state().repair_done is False

        session = TechnicianCopilot(
            incident_id="INC-0412",
            machine_id="CNC-02",
            tool_id="T07",
        )
        session.get_initial_greeting()

        # Fast forward through all steps
        await session.process_technician_input("Xong bước 1")
        await session.process_technician_input("Xong bước 2")
        await session.process_technician_input("Xong bước 3")
        await session.process_technician_input("Độ đảo 0.004 mm")
        await session.process_technician_input("Xong bước 5")

        assert session.is_repair_completed() is True

        # Emit to blackboard
        finding = await session.emit_repair_completion()

        # Verify Finding contract
        assert finding.agent_id == "COPILOT"
        assert finding.agent_name == "Technician Copilot"
        assert finding.phase == "Phase C - Resolution"
        assert "Hoàn tất quy trình sửa chữa" in finding.finding
        assert "0.004" in finding.evidence
        assert finding.confidence == 0.96
        assert "Sổ tay hướng dẫn CNC-02 trang 112" in finding.citation

        # Verify Blackboard shared state
        bb_state = blackboard.get_state()
        assert bb_state.repair_done is True
        assert bb_state.status == "verifying"
        assert bb_state.suspect_machine == "CNC-02"
        assert len(bb_state.findings) == 1
        assert bb_state.findings[0].agent_id == "COPILOT"

    asyncio.run(_test())


def test_run_technician_repair_default_simulation():
    """Tests the high-level simulation runner for orchestrator and automated pipelines."""

    async def _test():
        blackboard.reset()

        telemetry = await run_technician_repair(
            incident_id="INC-0412",
            machine_id="CNC-02",
            tool_id="T07",
            root_cause="Tool T07 worn past 2,000 part limit",
        )

        assert telemetry.repair_done is True
        assert telemetry.checkpoints_passed == 5
        assert telemetry.total_turns >= 6
        assert blackboard.get_state().repair_done is True
        assert blackboard.get_state().status == "verifying"

    asyncio.run(_test())


def test_run_technician_repair_injection_molding_use_case():
    """Tests the high-level simulation runner with Use Case 2 (IM-05 Dryer Filter)."""

    async def _test():
        blackboard.reset()

        im_inputs = [
            {"message": "Đã ngắt điện sấy và khóa khí nén"},
            {"message": "Đã tháo cốc lọc và vệ sinh khoang"},
            {"message": "Đã lắp lõi lọc FLT-ABS-04 mới"},
            {"message": "Cảm biến báo điểm sương -35 độ C"},
            {"message": "Đã cài đặt sấy lại 85 độ trong 4 giờ xong"},
        ]

        telemetry = await run_technician_repair(
            incident_id="INC-0413",
            machine_id="IM-05",
            root_cause="Clogged dryer filter causing damp ABS pellets",
            simulated_inputs=im_inputs,
        )

        assert telemetry.repair_done is True
        assert telemetry.checkpoints_passed == 5
        assert telemetry.verified_metrics["Điểm sương khí sấy"] == -35.0
        assert blackboard.get_state().repair_done is True

    asyncio.run(_test())
