"""Orchestrator Agent (ADK): Coordinates phases A -> B -> C -> D and manages the incident lifecycle state machine."""

from __future__ import annotations

import asyncio
import time
from typing import Optional

from backend.core.blackboard import blackboard
from backend.core.models import AgentFinding, DefectInjectionRequest, ImpactMetrics


class Orchestrator:
    """Coordinates the Kaizen Agent team through the 4-phase incident lifecycle."""

    def __init__(self) -> None:
        self.is_running: bool = False
        self.current_scenario: Optional[str] = None
        self.current_mode: Optional[str] = None
        self.target_machine: Optional[str] = None
        self.target_tool: Optional[str] = None
        self.start_time: Optional[float] = None
        self.total_duration: Optional[float] = None
        self._current_task: Optional[asyncio.Task] = None

    def stop_simulation(self) -> None:
        """Stops and cancels any running incident simulation."""
        self.is_running = False
        self.current_scenario = None
        self.current_mode = None
        self.target_machine = None
        self.target_tool = None
        self.start_time = None
        self.total_duration = None
        if self._current_task and not self._current_task.done():
            self._current_task.cancel()
            self._current_task = None

    async def run_incident_simulation(
        self,
        delay: Optional[float] = None,
        req: Optional[DefectInjectionRequest] = None,
    ) -> None:
        """Executes the full closed-loop incident investigation and recovery flow."""
        self._current_task = asyncio.current_task()
        self.is_running = True
        self.start_time = time.time()

        if req is None:
            req = DefectInjectionRequest()

        scenario = req.scenario or "cnc_tool_wear"
        mode = req.mode or "demo"
        self.current_scenario = scenario
        self.current_mode = mode

        # Determine timing envelope
        if req.duration_seconds is not None:
            total_duration = max(1.0, req.duration_seconds)
        elif delay is not None:
            # Backward-compatible explicit delay parameter
            total_duration = delay * 10.0
        elif mode == "fast":
            total_duration = 8.0
        else:
            total_duration = 90.0  # Deterministic 90-second demo envelope

        self.total_duration = total_duration
        step_delay = total_duration / 9.0

        try:
            if scenario == "im_damp_material":
                await self._run_scenario_im_damp_material(step_delay, req)
            else:
                await self._run_scenario_cnc_tool_wear(step_delay, req)
        except asyncio.CancelledError:
            self.is_running = False
            raise
        finally:
            self.is_running = False

    async def _run_scenario_cnc_tool_wear(
        self, step_delay: float, req: DefectInjectionRequest
    ) -> None:
        """Executes Scenario 1: CNC-02 Cutting Tool T07 mechanical onset, wear, and resolution."""
        machine_id = req.machine_id or "CNC-02"
        tool_id = req.tool_id or "T07"
        self.target_machine = machine_id
        self.target_tool = tool_id

        # 1. Phase A: Detection by Quality Inspector
        blackboard.update_status(
            "detecting",
            defect_type="scratch_vertical",
            defect_rate=0.077,
            verification_count=0,
            suspect_machine=machine_id,
        )
        await asyncio.sleep(step_delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="QA",
                agent_name="Quality Inspector",
                phase="Phase A - Detection",
                finding="Vertical scratch 2–3 mm on face A detected on conveyor station.",
                evidence="23/300 products defective (7.7% defect rate), exceeding SPC UCL of 3.0%. Started at 09:40.",
                confidence=0.96,
                citation="Gemma Edge Gateway Frame #8412 + Gemini Vision Metrology",
            )
        )
        await asyncio.sleep(step_delay)

        # 2. Phase B: Traceability Agent (discrete topology)
        blackboard.update_status("tracing", incident_id="INC-0412")
        await asyncio.sleep(step_delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="TRA",
                agent_name="Traceability Agent",
                phase="Phase B - Tracing",
                finding=f"Defects isolated to {machine_id} with Cutting Tool {tool_id}. Raw materials excluded.",
                evidence=f"100% of defective parts routed through {machine_id}/{tool_id}. CNC-01 and CNC-03 used blank lot AL-5083-B4 with 0 defects.",
                confidence=0.95,
                citation="BigQuery `traceability_discrete_events` cross-lot correlation",
            )
        )
        await asyncio.sleep(step_delay)

        # 3. Phase B: Process Analyst Agent (continuous telemetry)
        blackboard.update_status("investigating", suspect_machine=machine_id, suspect_tool=tool_id)
        await asyncio.sleep(step_delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="PA",
                agent_name="Process Analyst Agent",
                phase="Phase B - Sensor Analysis",
                finding="Spindle vibration spike (+35% to 2.7 mm/s) and motor current rise (+12% to 13.5 A) preceding defects.",
                evidence="Vibration increased at 09:30 (10 min prior to defect spike). Bearing temperature normal at 42°C.",
                confidence=0.89,
                citation="BigQuery `machine_telemetry_5s` time-window query (09:00-10:00)",
            )
        )
        await asyncio.sleep(step_delay)

        # 4. Phase B: Root Cause Agent with RAG Tool
        blackboard.update_status("analyzing")
        await asyncio.sleep(step_delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="RCA",
                agent_name="Root Cause Agent",
                phase="Phase B - Root Cause",
                finding=f"Tool wear on insert {tool_id} past maximum rated cutting life. SOP lacks piece-counter.",
                evidence=f"5-Whys & Ishikawa synthesis: Tool {tool_id} cut 2,400 parts (limit: 2,000). Tool replacement SOP is calendar-based, not usage-based.",
                confidence=0.87,
                citation=f"Vertex AI Search: CNC Manual p.112 + Maintenance Log {tool_id} + 8D-2026-03-12",
            )
        )
        await asyncio.sleep(step_delay)

        # 5. Phase C: Technician Copilot (multimodal resolution)
        blackboard.update_status(
            "repairing",
            root_cause=f"Tool {tool_id} worn past 2,000 part limit",
            repair_done=True,
        )
        await asyncio.sleep(step_delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="COPILOT",
                agent_name="Technician Copilot",
                phase="Phase C - Resolution",
                finding="Interactive repair completed in Vietnamese with verified tool runout.",
                evidence="Guided technician through cover removal, insert swap, and runout calibration (< 0.005 mm) citing CNC manual p.112.",
                confidence=0.94,
                citation="Gemini Live API multimodal voice session (Session #VN-902)",
            )
        )
        await asyncio.sleep(step_delay)

        # 6. Phase C: Quality Inspector Post-Repair Verification Gatekeeper
        blackboard.update_status("verifying")
        sub_delay = step_delay * 0.25
        for count in [10, 25, 40, 50]:
            blackboard.update_status("verifying", verification_count=count)
            await asyncio.sleep(sub_delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="QA",
                agent_name="Quality Inspector (Gatekeeper)",
                phase="Phase C - Verification",
                finding="Physical recovery verified: 50 consecutive defect-free products passed on conveyor.",
                evidence="Defect rate dropped from 7.7% back to baseline 0.4% (below SPC UCL 3.0%). Zero surface scratches detected.",
                confidence=0.99,
                citation="End-of-line Camera Station #1 inspection buffer (50/50 pass streak)",
            )
        )
        await asyncio.sleep(step_delay)

        # 7. Phase C: Incident Scribe (8D & SOP documentation)
        docs = {
            "work_order": f"WO-8821: Replace {tool_id} insert & recalibrate spindle offset (Completed)",
            "report_8d": "8D Report INC-0412: Root cause verified as insert wear; preventive action defined.",
            "sop_proposal": "SOP-CNC-04 Revision: Add automated M-code piece counter alarm at 1,900 parts.",
        }
        blackboard.update_status("verifying", documents=docs)

        blackboard.add_finding(
            AgentFinding(
                agent_id="DOC",
                agent_name="Incident Scribe",
                phase="Phase C - Documentation",
                finding="Generated formal 8D Incident Report, Work Order WO-8821, and SOP countermeasure.",
                evidence="Drafted 8-step resolution dossier and preventative countermeasure ready for Shift Leader sign-off.",
                confidence=0.95,
                citation="Firestore incident board state compiler",
            )
        )
        await asyncio.sleep(step_delay)

        # 8. Phase D: Continuous Learning & Impact Card
        impact = ImpactMetrics(scrap_avoided=240, downtime_minutes=45, energy_kwh=38.0, co2_kg=25.0)
        blackboard.update_status("closed", impact=impact, defect_rate=0.004)

        blackboard.add_finding(
            AgentFinding(
                agent_id="LEARN",
                agent_name="Continuous Learning",
                phase="Phase D - Learning",
                finding="Resolution indexed into defect-cause-fix library; Impact Card calculated.",
                evidence="Avoided 240 scrap housings (~$3,600), saved 45 min downtime, reduced 38 kWh power and 25 kg CO2.",
                confidence=0.99,
                citation="Vertex AI Search Vector Index + BigQuery Sustainability Accounting",
            )
        )

    async def _run_scenario_im_damp_material(
        self, step_delay: float, req: DefectInjectionRequest
    ) -> None:
        """Executes Scenario 2: IM-05 Injection Molding damp material and cavity #3 defect resolution."""
        machine_id = req.machine_id if req.machine_id != "CNC-02" else "IM-05"
        tool_id = req.tool_id if req.tool_id != "T07" else "MOLD-03"
        self.target_machine = machine_id
        self.target_tool = tool_id

        # 1. Phase A: Detection by Quality Inspector
        blackboard.update_status(
            "detecting",
            defect_type="short_fill",
            defect_rate=0.081,
            verification_count=0,
            suspect_machine=machine_id,
        )
        await asyncio.sleep(step_delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="QA",
                agent_name="Quality Inspector",
                phase="Phase A - Detection",
                finding="Short fill and sink marks detected on mold cavity #3 at camera station.",
                evidence="26/320 parts defective (8.1% defect rate), exceeding SPC UCL of 3.0%. Started at 09:20.",
                confidence=0.97,
                citation="Gemma Edge Gateway Frame #9104 + Optical Profilometry Station",
            )
        )
        await asyncio.sleep(step_delay)

        # 2. Phase B: Traceability Agent (discrete topology)
        blackboard.update_status("tracing", incident_id="INC-0413")
        await asyncio.sleep(step_delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="TRA",
                agent_name="Traceability Agent",
                phase="Phase B - Tracing",
                finding=f"Defects isolated to {machine_id} mold cavity #3. Raw resin lot PA66-GF30-L12.",
                evidence=f"100% of defective housings produced on {machine_id} using {tool_id} Cavity #3. Cavities #1, #2, #4 show 0 defects.",
                confidence=0.96,
                citation="BigQuery `traceability_discrete_events` cavity cross-tabulation",
            )
        )
        await asyncio.sleep(step_delay)

        # 3. Phase B: Process Analyst Agent (continuous telemetry)
        blackboard.update_status("investigating", suspect_machine=machine_id, suspect_tool=tool_id)
        await asyncio.sleep(step_delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="PA",
                agent_name="Process Analyst Agent",
                phase="Phase B - Sensor Analysis",
                finding="Machine parameters normal, but material dryer dew point rose from -40°C to -18°C.",
                evidence="Dryer dew point spiked at 09:10 (-18°C vs specification -40°C). Melt temperature (210°C) and injection pressure remain normal.",
                confidence=0.92,
                citation="BigQuery `machine_telemetry_5s` dehumidifier channel dew_point_c",
            )
        )
        await asyncio.sleep(step_delay)

        # 4. Phase B: Root Cause Agent with RAG Tool
        blackboard.update_status("analyzing")
        await asyncio.sleep(step_delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="RCA",
                agent_name="Root Cause Agent",
                phase="Phase B - Root Cause",
                finding="Hygroscopic moisture saturation in PA66 resin caused by saturated desiccant bed.",
                evidence="5-Whys synthesis: Dryer regeneration valve failed to seal, leading to resin moisture 0.28% (spec < 0.05%) and melt viscosity drop.",
                confidence=0.88,
                citation="Vertex AI Search: Dryer Manual p.54 + PA66 Processing Guide + 8D-2025-11-04",
            )
        )
        await asyncio.sleep(step_delay)

        # 5. Phase C: Technician Copilot (multimodal resolution)
        blackboard.update_status(
            "repairing",
            root_cause="Dryer desiccant bed saturated; resin moisture 0.28%",
            repair_done=True,
        )
        await asyncio.sleep(step_delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="COPILOT",
                agent_name="Technician Copilot",
                phase="Phase C - Resolution",
                finding="Interactive hopper purge and desiccant cartridge regeneration completed.",
                evidence="Guided technician through desiccant bed replacement, hopper drain purge, and dew point calibration (-42°C verified).",
                confidence=0.95,
                citation="Gemini Live API multimodal voice session (Session #VN-908)",
            )
        )
        await asyncio.sleep(step_delay)

        # 6. Phase C: Quality Inspector Post-Repair Verification Gatekeeper
        blackboard.update_status("verifying")
        sub_delay = step_delay * 0.25
        for count in [10, 25, 40, 50]:
            blackboard.update_status("verifying", verification_count=count)
            await asyncio.sleep(sub_delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="QA",
                agent_name="Quality Inspector (Gatekeeper)",
                phase="Phase C - Verification",
                finding="Physical recovery verified: 50 consecutive defect-free molded parts passed on conveyor.",
                evidence="Defect rate dropped from 8.1% to baseline 0.3% (below SPC UCL 3.0%). Cavity #3 surface finish nominal.",
                confidence=0.99,
                citation="Optical Inspection Station #2 buffer (50/50 pass streak)",
            )
        )
        await asyncio.sleep(step_delay)

        # 7. Phase C: Incident Scribe (8D & SOP documentation)
        docs = {
            "work_order": "WO-9042: Regenerate desiccant bed, purge hopper, and inspect cavity #3 gate (Completed)",
            "report_8d": "8D Report INC-0413: Root cause verified as resin moisture; dryer maintenance preventive countermeasure implemented.",
            "sop_proposal": "SOP-IM-08 Revision: Add automated dew point alarm interlock cutoff at -30°C.",
        }
        blackboard.update_status("verifying", documents=docs)

        blackboard.add_finding(
            AgentFinding(
                agent_id="DOC",
                agent_name="Incident Scribe",
                phase="Phase C - Documentation",
                finding="Generated formal 8D Incident Report, Work Order WO-9042, and SOP-IM-08 update.",
                evidence="Drafted 8-step resolution dossier and preventive interlock countermeasure ready for Shift Leader sign-off.",
                confidence=0.96,
                citation="Firestore incident board state compiler",
            )
        )
        await asyncio.sleep(step_delay)

        # 8. Phase D: Continuous Learning & Impact Card
        impact = ImpactMetrics(scrap_avoided=320, downtime_minutes=60, energy_kwh=42.0, co2_kg=28.0)
        blackboard.update_status("closed", impact=impact, defect_rate=0.003)

        blackboard.add_finding(
            AgentFinding(
                agent_id="LEARN",
                agent_name="Continuous Learning",
                phase="Phase D - Learning",
                finding="Moisture-induced short fill signature indexed into vector knowledge base.",
                evidence="Avoided 320 scrap housings (~$4,800), saved 60 min downtime, reduced 42 kWh power and 28 kg CO2.",
                confidence=0.99,
                citation="Vertex AI Search Vector Index + BigQuery Sustainability Accounting",
            )
        )


orchestrator = Orchestrator()
