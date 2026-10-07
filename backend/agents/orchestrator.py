"""Orchestrator Agent (ADK): Coordinates phases A -> B -> C -> D and manages the incident lifecycle state machine."""

import asyncio

from backend.core.blackboard import blackboard
from backend.core.models import AgentFinding
from backend.tools.impact_calculator import calculate_sustainability_impact


class Orchestrator:
    """Coordinates the Kaizen Agent team through the 4-phase incident lifecycle."""

    async def run_incident_simulation(self, delay: float = 1.2):
        """Executes the full closed-loop incident investigation and recovery flow."""
        # 1. Phase A: Detection by Quality Inspector
        blackboard.update_status(
            "detecting", defect_type="scratch_vertical", defect_rate=0.077, verification_count=0
        )
        await asyncio.sleep(delay)

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
        await asyncio.sleep(delay)

        # 2. Phase B: Traceability Agent (discrete topology)
        blackboard.update_status("tracing", incident_id="INC-0412")
        await asyncio.sleep(delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="TRA",
                agent_name="Traceability Agent",
                phase="Phase B - Tracing",
                finding="Defects isolated to CNC-02 with Cutting Tool T07. Raw materials excluded.",
                evidence="100% of defective parts routed through CNC-02/T07. CNC-01 and CNC-03 used blank lot AL-5083-B4 with 0 defects.",
                confidence=0.95,
                citation="BigQuery `traceability_discrete_events` cross-lot correlation",
            )
        )
        await asyncio.sleep(delay)

        # 3. Phase B: Process Analyst Agent (continuous telemetry)
        blackboard.update_status("investigating", suspect_machine="CNC-02", suspect_tool="T07")
        await asyncio.sleep(delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="PA",
                agent_name="Process Analyst Agent",
                phase="Phase B - Sensor Analysis",
                finding="Spindle vibration spike (+35%) and motor current rise (+12%) preceding defects.",
                evidence="Vibration increased at 09:30 (10 min prior to defect spike). Bearing temperature normal at 42°C.",
                confidence=0.89,
                citation="BigQuery `machine_telemetry_5s` time-window query (09:00-10:00)",
            )
        )
        await asyncio.sleep(delay)

        # 4. Phase B: Root Cause Agent with RAG Tool
        blackboard.update_status("analyzing")
        await asyncio.sleep(delay)

        blackboard.add_finding(
            AgentFinding(
                agent_id="RCA",
                agent_name="Root Cause Agent",
                phase="Phase B - Root Cause",
                finding="Tool wear on insert T07 past maximum rated cutting life. SOP lacks piece-counter.",
                evidence="5-Whys & Ishikawa synthesis: Tool T07 cut 2,400 parts (limit: 2,000). Tool replacement SOP is calendar-based, not usage-based.",
                confidence=0.87,
                citation="Vertex AI Search: CNC Manual p.112 + Maintenance Log T07 + 8D-2026-03-12",
            )
        )
        await asyncio.sleep(delay)

        # 5. Phase C: Technician Copilot (multimodal resolution)
        blackboard.update_status("repairing", root_cause="Tool T07 worn past 2,000 part limit")
        await asyncio.sleep(delay)

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
        await asyncio.sleep(delay)

        # 6. Phase C: Quality Inspector Post-Repair Verification Gatekeeper
        blackboard.update_status("verifying")
        for count in [10, 25, 40, 50]:
            blackboard.update_status("verifying", verification_count=count)
            await asyncio.sleep(delay * 0.4)

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
        await asyncio.sleep(delay)

        # 7. Phase C: Incident Scribe (8D & SOP documentation)
        docs = {
            "work_order": "WO-8821: Replace T07 insert & recalibrate spindle offset (Completed)",
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
        await asyncio.sleep(delay)

        # 8. Phase D: Continuous Learning & Impact Card
        impact = calculate_sustainability_impact(factory_type="aluminum_cnc")
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


orchestrator = Orchestrator()
