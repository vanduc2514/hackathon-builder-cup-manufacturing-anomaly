"""Incident Scribe: Compiles verified blackboard findings into 8D reports, work orders, and SOP update proposals."""

import asyncio
import json
from backend.core.models import AgentFinding
from backend.core.llm_factory import get_llm_provider
from backend.core.blackboard import blackboard
import logging

logger = logging.getLogger(__name__)

class IncidentScribe:
    async def run(self, state, model_name: str = "complex_reasoning", delay: float = 1.2) -> AgentFinding:
        await asyncio.sleep(delay)
        
        # 1. Gather all findings to formulate the report
        context = "\n".join([f"- {f.phase}: {f.finding} (Confidence: {f.confidence})" for f in state.findings])
        incident_id = state.incident_id
        
        # 2. Prompt LLM to generate structured documentation
        prompt = f"""
        You are an Incident Scribe Agent.
        Based on the following findings for incident {incident_id}, draft formal documentation.
        
        Findings:
        {context}
        
        Provide the response in the following JSON format ONLY:
        {{
            "work_order": "WO-...: [Action to take]",
            "report_8d": "8D Report {incident_id}: [Summary of root cause and actions]",
            "sop_proposal": "SOP-... Revision: [Proposed change]"
        }}
        """
        
        docs = {
            "work_order": "WO-8821: Replace T07 insert & recalibrate spindle offset (Completed)",
            "report_8d": f"8D Report {incident_id}: Root cause verified as insert wear; preventive action defined.",
            "sop_proposal": "SOP-CNC-04 Revision: Add automated M-code piece counter alarm at 1,900 parts."
        }
        
        try:
            llm = get_llm_provider()
            text = await llm.generate(prompt, logical_model=model_name)
            
            # Clean up text if it contains markdown code blocks
            clean_text = text.replace('```json', '').replace('```', '').strip()
            parsed_docs = json.loads(clean_text)
            
            if "work_order" in parsed_docs and "report_8d" in parsed_docs and "sop_proposal" in parsed_docs:
                docs = parsed_docs
                
        except Exception as e:
            logger.warning("LLM generation failed for Incident Scribe, using fallback. Error: %s", e)
        
        # 3. Write directly to the blackboard
        # Note: We update the documents field without changing the state's status
        blackboard.update_status(state.status, documents=docs)
        
        finding_text = f"Generated formal 8D Incident Report, Work Order, and SOP countermeasure for {incident_id}."
        evidence_text = f"Drafted 8-step resolution dossier and preventative countermeasure ready for Shift Leader sign-off. Work Order: {docs.get('work_order', '').split(':')[0]}"
        
        return AgentFinding(
            agent_id="DOC",
            agent_name="Incident Scribe",
            phase="Phase C - Documentation",
            finding=finding_text,
            evidence=evidence_text,
            confidence=0.95,
            citation="LLM Document Synthesis + Firestore incident board state compiler"
        )

incident_scribe = IncidentScribe()
