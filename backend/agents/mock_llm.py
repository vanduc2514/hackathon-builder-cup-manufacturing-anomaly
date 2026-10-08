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
    """Answers every agent with deterministic, domain-grounded FindingDraft payloads."""

    model: str = "mock"
    rca_confidence: float = 0.88

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        si = str(llm_request.config.system_instruction or "")

        if "Quality Inspector" in si:
            payload = {
                "finding": "Vision inspection detected defect rate of 7.67% (23/300) exceeding SPC UCL of 3.00% on Face A vertical scratch.",
                "evidence": "Gemma Edge Gateway Frame #8412 + Gemini Vision Metrology: vertical scratch 2.4 mm",
                "confidence": 0.96,
                "citation": "Gemma Edge Gateway Frame #8412 + Gemini Vision Metrology",
            }
        elif "Traceability" in si:
            payload = {
                "finding": "Traceability topology analysis isolates CNC-02 tool T07 with 95% correlation to Face A scratches.",
                "evidence": "BigQuery discrete topology: 23/23 defects on CNC-02 T07; CNC-01/CNC-03 show normal PASS rates.",
                "confidence": 0.92,
                "citation": "BigQuery: `kaizen_manufacturing.traceability` topology analysis",
            }
        elif "Process Analyst" in si:
            payload = {
                "finding": "Spindle vibration spike to 3.82 mm/s RMS (+154% above 1.50 mm/s baseline) detected on CNC-02.",
                "evidence": "High-frequency accelerometer on CNC-02 recorded 3.82 mm/s RMS vs 1.5 mm/s baseline during defect window.",
                "confidence": 0.94,
                "citation": "BigQuery: `kaizen_manufacturing.sensor_telemetry` window query",
            }
        elif "Root Cause" in si:
            payload = {
                "finding": "Carbide insert T07 exceeded rated tool life (2,400 parts vs 2,000 spec), causing cutting flank chipping and workpiece scratching.",
                "evidence": "5-Whys: flank wear chipped -> exceeded 2,000-part life -> SOP is calendar-based, not usage-based.",
                "confidence": self.rca_confidence,
                "citation": "Vertex AI Search: CNC Manual p.112 + Maintenance Log T07 + 8D-2026-03-12",
            }
        elif "Technician Copilot" in si or "diagnostic" in si.lower():
            payload = {
                "finding": "Technician executed tool insert T07 replacement and dial indicator runout verification (TIR 0.008 mm, pass < 0.010 mm).",
                "evidence": "Dial indicator measurement confirmed 0.008 mm TIR. 4-step repair checklist completed.",
                "confidence": 0.95,
                "citation": "OEM CNC Maintenance Manual Section 4.5 (Runout Inspection)",
            }
        elif "Incident Scribe" in si:
            payload = {
                "finding": "8D incident report drafted and emergency maintenance work order WO-2026-1004 generated.",
                "evidence": "D1-D8 sections compiled, preventative action proposed to update SOP from calendar-based to usage-based tool change.",
                "confidence": 0.95,
                "citation": "Kaizen Scribe Knowledge Base & ISO 9001 8D Protocol",
                "work_order": "WO-2026-1004",
                "report_8d": "8D Report: Anomaly in CNC-02 Face A finish due to over-extended T07 insert...",
                "sop_proposal": "Update SOP-MNT-CNC-04: Implement hard tool counter lockout at 2,000 cuts.",
            }
        elif "Continuous Learning" in si:
            payload = {
                "finding": "Continuous learning loop updated SOP-MNT-CNC-04 tool life limits; avoided $14,200 scrap cost.",
                "evidence": "Rule update pushed to edge gateway; prevented further defective batch production.",
                "confidence": 0.97,
                "citation": "Kaizen Continuous Learning Engine",
            }
        else:
            payload = {
                "finding": "Deterministic synthetic finding for local test execution.",
                "evidence": "Local simulated evidence fixture.",
                "confidence": 0.90,
                "citation": "Local Dev Parity Fixture",
            }

        yield LlmResponse(
            content=types.Content(role="model", parts=[types.Part(text=json.dumps(payload))])
        )
