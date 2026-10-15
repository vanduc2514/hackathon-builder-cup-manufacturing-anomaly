"""In-memory deterministic mock LLM for local dev parity without cloud credentials or Ollama."""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

logger = logging.getLogger(__name__)


class MockLlm(BaseLlm):
    """Answers every agent with deterministic, domain-grounded FindingDraft/ScribeDraft payloads."""

    model: str = "mock"
    rca_confidence: float = 0.88

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        si = str(llm_request.config.system_instruction or "")
        first_line = si.splitlines()[0] if si else ""

        # Extract message contents to identify scenario context
        content_text = ""
        if llm_request.contents:
            for content in llm_request.contents:
                if hasattr(content, "parts") and content.parts:
                    for part in content.parts:
                        if hasattr(part, "text") and part.text:
                            content_text += " " + part.text

        is_im_scenario = (
            "im_damp_material" in content_text
            or "IM-05" in content_text
            or "short_shot" in content_text
            or "short_fill" in content_text
            or "sink_mark" in content_text
            or "dryer" in content_text
            or "dew_point" in content_text
            or "resin" in content_text
            or "MOLD-03" in content_text
        )

        if "Incident Scribe" in first_line or "You are the Incident Scribe" in si:
            if is_im_scenario:
                payload = {
                    "finding": (
                        "8D incident report drafted and emergency maintenance work order "
                        "WO-2026-1005 generated."
                    ),
                    "evidence": (
                        "D1-D8 sections compiled, preventative action proposed to add "
                        "dew point sensor high-limit interlock."
                    ),
                    "confidence": 0.95,
                    "citation": "Kaizen Scribe Knowledge Base & ISO 9001 8D Protocol",
                    "work_order": "WO-2026-1005: Desiccant heater reset and barrel purge on IM-05.",
                    "report_8d": (
                        "8D Report: Anomaly in IM-05 mold cavity #3 due to moist resin charge "
                        "from desiccant saturation. Corrective Action: Heater reset, automated alarm added."
                    ),
                    "sop_proposal": "Update SOP-INJ-02: Add automated dew point alarm interlock before mold clamping.",
                }
            else:
                payload = {
                    "finding": (
                        "8D incident report drafted and emergency maintenance work order "
                        "WO-2026-1004 generated."
                    ),
                    "evidence": (
                        "D1-D8 sections compiled, preventative action proposed to update SOP "
                        "from calendar-based to usage-based tool change."
                    ),
                    "confidence": 0.95,
                    "citation": "Kaizen Scribe Knowledge Base & ISO 9001 8D Protocol",
                    "work_order": "WO-2026-1004: Emergency replacement of CNC-02 spindle insert T07. Verified runout <= 0.008mm.",
                    "report_8d": (
                        "8D Report: Anomaly in CNC-02 Face A finish due to over-extended T07 "
                        "insert beyond 2,000 cuts. Root Cause: Calendar-based replacement schedule failed under high-mix batching. Corrective Action: Tool replaced, hard counter lockout installed."
                    ),
                    "sop_proposal": "Update SOP-MNT-CNC-04: Implement hard tool counter lockout at 2,000 cuts.",
                }
        elif "Continuous Learning" in first_line or "You are the Continuous Learning" in si:
            if is_im_scenario:
                payload = {
                    "finding": (
                        "Continuous learning loop updated SOP-INJ-02 dew point limits; "
                        "avoided $18,400 scrap cost."
                    ),
                    "evidence": (
                        "Rule update pushed to edge gateway; prevented further short-fill "
                        "batch production."
                    ),
                    "confidence": 0.98,
                    "citation": "Kaizen Continuous Learning Engine",
                    "work_order": "N/A",
                    "report_8d": "N/A",
                    "sop_proposal": "N/A",
                }
            else:
                payload = {
                    "finding": (
                        "Continuous learning loop updated SOP-MNT-CNC-04 tool life limits; "
                        "avoided $14,200 scrap cost."
                    ),
                    "evidence": (
                        "Rule update pushed to edge gateway; prevented further defective "
                        "batch production."
                    ),
                    "confidence": 0.97,
                    "citation": "Kaizen Continuous Learning Engine",
                    "work_order": "N/A",
                    "report_8d": "N/A",
                    "sop_proposal": "N/A",
                }
        elif (
            "Technician Copilot" in first_line
            or "You are the Technician Copilot" in si
            or "diagnostic" in si.lower()
        ):
            if is_im_scenario:
                payload = {
                    "finding": (
                        "Technician reset desiccant regeneration circuit breaker and purged "
                        "moist resin charge; dew point returned to -42°C."
                    ),
                    "evidence": (
                        "Dew point meter confirmed -42°C, purge cycle completed. "
                        "4-step checklist verified."
                    ),
                    "confidence": 0.95,
                    "citation": "OEM Dryer Manual Section 3.2 (Desiccant Regeneration)",
                    "work_order": "N/A",
                    "report_8d": "N/A",
                    "sop_proposal": "N/A",
                }
            else:
                payload = {
                    "finding": (
                        "Technician executed tool insert T07 replacement and dial indicator "
                        "runout verification (TIR 0.008 mm, pass < 0.010 mm)."
                    ),
                    "evidence": (
                        "Dial indicator measurement confirmed 0.008 mm TIR. "
                        "4-step repair checklist completed."
                    ),
                    "confidence": 0.95,
                    "citation": "OEM CNC Maintenance Manual Section 4.5 (Runout Inspection)",
                    "work_order": "N/A",
                    "report_8d": "N/A",
                    "sop_proposal": "N/A",
                }
        elif "Root Cause" in first_line or "You are the Root Cause" in si:
            if is_im_scenario:
                payload = {
                    "finding": (
                        "Desiccant dryer bed saturation allowed moist resin into barrel, "
                        "causing hydrolysis and short fill under standard injection pressure."
                    ),
                    "evidence": (
                        "5-Whys: moist resin -> desiccant tower regeneration heater tripped "
                        "-> desiccant saturated."
                    ),
                    "confidence": self.rca_confidence,
                    "citation": "Vertex AI Search: Dryer Maintenance Guide p.45 + SOP-INJ-02",
                    "work_order": "N/A",
                    "report_8d": "N/A",
                    "sop_proposal": "N/A",
                }
            else:
                payload = {
                    "finding": (
                        "Carbide insert T07 exceeded rated tool life (2,400 parts vs "
                        "2,000 spec), causing cutting flank chipping and workpiece scratching."
                    ),
                    "evidence": (
                        "5-Whys: flank wear chipped -> exceeded 2,000-part life -> "
                        "SOP is calendar-based, not usage-based."
                    ),
                    "confidence": self.rca_confidence,
                    "citation": (
                        "Vertex AI Search: CNC Manual p.112 + Maintenance Log T07 + 8D-2026-03-12"
                    ),
                    "work_order": "N/A",
                    "report_8d": "N/A",
                    "sop_proposal": "N/A",
                }
        elif "Process Analyst" in first_line or "You are the Process Analyst" in si:
            if is_im_scenario:
                payload = {
                    "finding": (
                        "Resin dryer telemetry exhibits dew point spike to -18°C "
                        "(normal operating limit <= -40°C), introducing moisture."
                    ),
                    "evidence": (
                        "Dew point transmitter on hopper dryer for IM-05 spiked from -45°C "
                        "to -18°C over the last 90 minutes."
                    ),
                    "confidence": 0.93,
                    "citation": "BigQuery: `kaizen_manufacturing.sensor_telemetry` dryer metrics",
                    "work_order": "N/A",
                    "report_8d": "N/A",
                    "sop_proposal": "N/A",
                }
            else:
                payload = {
                    "finding": (
                        "Spindle vibration spike to 3.82 mm/s RMS (+154% above 1.50 mm/s "
                        "baseline) detected on CNC-02."
                    ),
                    "evidence": (
                        "High-frequency accelerometer on CNC-02 recorded 3.82 mm/s RMS vs "
                        "1.5 mm/s baseline during defect window."
                    ),
                    "confidence": 0.94,
                    "citation": "BigQuery: `kaizen_manufacturing.sensor_telemetry` window query",
                    "work_order": "N/A",
                    "report_8d": "N/A",
                    "sop_proposal": "N/A",
                }
        elif "Traceability" in first_line or "You are the Traceability" in si:
            if is_im_scenario:
                payload = {
                    "finding": (
                        "Traceability analysis isolates Injection Molding Machine IM-05, "
                        "Mold Cavity #3 with 97% correlation to short shot defects."
                    ),
                    "evidence": (
                        "BigQuery discrete topology: 19/19 defects originate from IM-05 cavity #3; "
                        "other cavities and machines show nominal fill rates."
                    ),
                    "confidence": 0.94,
                    "citation": "BigQuery: `kaizen_manufacturing.traceability` topology analysis",
                    "work_order": "N/A",
                    "report_8d": "N/A",
                    "sop_proposal": "N/A",
                }
            else:
                payload = {
                    "finding": (
                        "Traceability topology analysis isolates CNC-02 tool T07 with "
                        "95% correlation to Face A scratches."
                    ),
                    "evidence": (
                        "BigQuery discrete topology: 23/23 defects on CNC-02 T07; "
                        "CNC-01/CNC-03 show normal PASS rates."
                    ),
                    "confidence": 0.92,
                    "citation": "BigQuery: `kaizen_manufacturing.traceability` topology analysis",
                    "work_order": "N/A",
                    "report_8d": "N/A",
                    "sop_proposal": "N/A",
                }
        elif "Quality Inspector" in first_line or "You are the Quality Inspector" in si:
            if is_im_scenario:
                payload = {
                    "finding": (
                        "Optical inspection detected short shot and sink marks on mold "
                        "cavity #3. Defect rate 6.20% exceeds SPC UCL of 3.00%."
                    ),
                    "evidence": (
                        "Optical vision camera on conveyor inspection station detected "
                        "incomplete fill on 19 of 300 parts (6.20% vs UCL 3.00%)."
                    ),
                    "confidence": 0.95,
                    "citation": "Optical Inspection Station Camera #2 + Vision Metrology",
                    "work_order": "N/A",
                    "report_8d": "N/A",
                    "sop_proposal": "N/A",
                }
            else:
                payload = {
                    "finding": (
                        "Vision inspection detected defect rate of 7.67% (23/300) "
                        "exceeding SPC UCL of 3.00% on Face A vertical scratch."
                    ),
                    "evidence": (
                        "Gemma Edge Gateway Frame #8412 + Gemini Vision Metrology: "
                        "vertical scratch 2.4 mm"
                    ),
                    "confidence": 0.96,
                    "citation": "Gemma Edge Gateway Frame #8412 + Gemini Vision Metrology",
                    "work_order": "N/A",
                    "report_8d": "N/A",
                    "sop_proposal": "N/A",
                }
        else:
            payload = {
                "finding": "Deterministic synthetic finding for local test execution.",
                "evidence": "Local simulated evidence fixture.",
                "confidence": 0.90,
                "citation": "Local Dev Parity Fixture",
                "work_order": "WO-2026-DEFAULT",
                "report_8d": "8D Report: Default synthetic anomaly resolution.",
                "sop_proposal": "Update SOP-DEFAULT: Standard inspection checks.",
            }

        yield LlmResponse(
            content=types.Content(
                role="model",
                parts=[types.Part(text=json.dumps(payload))],
            )
        )
