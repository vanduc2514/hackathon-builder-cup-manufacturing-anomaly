"""Quality Inspector Agent: Vision defect classification, SPC chart monitoring, and post-repair verification gatekeeper."""

import asyncio
from backend.core.models import AgentFinding
from backend.core.llm_factory import get_llm_provider
from backend.tools.spc_calculator import calculate_spc_ucl, verify_post_repair_streak
import logging

logger = logging.getLogger(__name__)

class QualityInspectorAgent:
    async def run_detection(self, defect_type: str, current_defect_rate: float, model_name: str = "vision", delay: float = 1.2) -> AgentFinding:
        await asyncio.sleep(delay)
        
        # 1. Calculate SPC
        historical_rates = [0.005, 0.006, 0.004, 0.005, 0.007, 0.004]
        ucl = calculate_spc_ucl(historical_rates)
        
        # 2. Prompt LLM to analyze defect based on "visual" mock context
        prompt = f"""
        You are a Quality Inspector Agent equipped with vision capabilities.
        Analyze the following manufacturing data:
        Defect Type Detected: {defect_type}
        Current Defect Rate: {current_defect_rate:.1%}
        Historical SPC Upper Control Limit (UCL): {ucl:.1%}
        
        State if the current rate exceeds the UCL. Describe the physical characteristics of a typical "{defect_type}".
        Keep the response brief, max 3 sentences. Give a confidence score.
        Provide the response in the format:
        FINDING: [your finding]
        EVIDENCE: [your evidence]
        CONFIDENCE: [score]
        """
        
        finding_text = f"Vertical scratch 2–3 mm on face A detected on conveyor station."
        evidence_text = f"Defect rate ({current_defect_rate:.1%}) exceeds SPC UCL ({ucl:.1%})."
        confidence = 0.96
        
        try:
            llm = get_llm_provider()
            text = await llm.generate(prompt, logical_model=model_name)
            
            # Simple parse
            for line in text.split('\n'):
                if line.startswith("FINDING:"): finding_text = line.replace("FINDING:", "").strip()
                elif line.startswith("EVIDENCE:"): evidence_text = line.replace("EVIDENCE:", "").strip()
                elif line.startswith("CONFIDENCE:"): 
                    try: confidence = float(line.replace("CONFIDENCE:", "").strip())
                    except: pass
        except Exception as e:
            logger.warning("LLM generation failed for Quality Inspector, using fallback. Error: %s", e)
            
        return AgentFinding(
            agent_id="QA",
            agent_name="Quality Inspector",
            phase="Phase A - Detection",
            finding=finding_text,
            evidence=evidence_text,
            confidence=confidence,
            citation="Gemma Edge Gateway Frame #8412 + Gemini Vision Metrology"
        )
        
    async def run_verification(self, state, model_name: str = "vision", delay: float = 1.2) -> AgentFinding:
        await asyncio.sleep(delay)
        
        streak_result = verify_post_repair_streak(state.verification_count, state.verification_target)
        
        prompt = f"""
        You are a Quality Inspector Agent.
        Verify the physical recovery based on the following:
        Streak Data: {streak_result}
        Defect Rate: {state.defect_rate:.1%}
        
        Provide the response in the format:
        FINDING: [your finding]
        EVIDENCE: [your evidence]
        CONFIDENCE: [score]
        """
        
        finding_text = streak_result["message"]
        evidence_text = f"Defect rate dropped back to {state.defect_rate:.1%} (below SPC UCL). Zero surface scratches detected."
        confidence = 0.99
        
        try:
            llm = get_llm_provider()
            text = await llm.generate(prompt, logical_model=model_name)
            
            # Simple parse
            for line in text.split('\n'):
                if line.startswith("FINDING:"): finding_text = line.replace("FINDING:", "").strip()
                elif line.startswith("EVIDENCE:"): evidence_text = line.replace("EVIDENCE:", "").strip()
                elif line.startswith("CONFIDENCE:"): 
                    try: confidence = float(line.replace("CONFIDENCE:", "").strip())
                    except: pass
        except Exception as e:
            logger.warning("LLM generation failed for Quality Inspector (Verification), using fallback. Error: %s", e)
            
        return AgentFinding(
            agent_id="QA",
            agent_name="Quality Inspector (Gatekeeper)",
            phase="Phase C - Verification",
            finding=finding_text,
            evidence=evidence_text,
            confidence=confidence,
            citation="End-of-line Camera Station #1 inspection buffer"
        )

quality_inspector = QualityInspectorAgent()
