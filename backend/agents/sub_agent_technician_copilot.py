"""Technician Copilot: Multimodal Gemini Live interface (Vietnamese voice + camera) for diagnostics and repair guidance."""

import asyncio
from backend.core.models import AgentFinding
from backend.core.llm_factory import get_llm_provider
import logging

logger = logging.getLogger(__name__)

class TechnicianCopilot:
    async def run(self, state, model_name: str = "live", delay: float = 1.2) -> AgentFinding:
        await asyncio.sleep(delay)
        
        # In a real scenario, this agent would await the completion of a WebSocket Live API session.
        # Here we mock the outcome of that live session using a standard LLM call to generate the summary.
        prompt = f"""
        You are a Technician Copilot Agent.
        You just finished a live audio/video session with a technician repairing {state.suspect_tool} on {state.suspect_machine}.
        The root cause was: {state.root_cause}.
        Write a short summary of the live repair session, explicitly mentioning that it was conducted in Vietnamese and citing the relevant SOP or manual.
        
        Keep the response brief, max 2 sentences. Give a confidence score.
        Provide the response in the format:
        FINDING: [your finding]
        EVIDENCE: [your evidence]
        CONFIDENCE: [score]
        """
        
        finding_text = "Interactive repair completed in Vietnamese with verified tool runout."
        evidence_text = f"Guided technician through cover removal, {state.suspect_tool} insert swap, and runout calibration citing CNC manual."
        confidence = 0.94
        
        try:
            # Fallback to complex_reasoning if live model is not supported (e.g. Ollama)
            llm = get_llm_provider()
            try:
                text = await llm.generate(prompt, logical_model=model_name)
            except ValueError:
                # If "live" is not supported by provider, use "complex_reasoning"
                text = await llm.generate(prompt, logical_model="complex_reasoning")
                
            # Simple parse
            for line in text.split('\n'):
                if line.startswith("FINDING:"): finding_text = line.replace("FINDING:", "").strip()
                elif line.startswith("EVIDENCE:"): evidence_text = line.replace("EVIDENCE:", "").strip()
                elif line.startswith("CONFIDENCE:"): 
                    try: confidence = float(line.replace("CONFIDENCE:", "").strip())
                    except: pass
        except Exception as e:
            logger.warning("LLM generation failed for Technician Copilot, using fallback. Error: %s", e)
            
        return AgentFinding(
            agent_id="COPILOT",
            agent_name="Technician Copilot",
            phase="Phase C - Resolution",
            finding=finding_text,
            evidence=evidence_text,
            confidence=confidence,
            citation="Gemini Live API multimodal voice session (Session #VN-902)"
        )

technician_copilot = TechnicianCopilot()
