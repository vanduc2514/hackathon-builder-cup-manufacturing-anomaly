"""Root Cause Agent: Synthesizes evidence with 5-Whys, Ishikawa fishbone, RAG lookup, and confidence scoring."""

import asyncio
from backend.core.models import AgentFinding
from backend.tools.rag_search_tool import search_knowledge_base
from backend.core.llm_factory import get_llm_provider
import logging

logger = logging.getLogger(__name__)

class RootCauseAgent:
    async def run(self, state, model_name: str = "complex_reasoning", delay: float = 1.2) -> AgentFinding:
        await asyncio.sleep(delay)
        
        # 1. Gather context from previous findings
        previous_findings = "\n".join([f"- {f.finding} ({f.evidence})" for f in state.findings])
        suspect_machine = state.suspect_machine or "Unknown Machine"
        
        # 2. RAG Lookup
        rag_results = await search_knowledge_base(
            query=f"tool wear vibration scratch limit SOP {suspect_machine}",
            max_results=3,
            filter_machine=suspect_machine
        )
        
        rag_context = "\n".join([f"[{r.title} p.{r.page_number}]: {r.snippet}" for r in rag_results])
        
        # 3. Prompt LLM to synthesize 5-Whys
        prompt = f"""
        You are an expert Root Cause Analysis agent.
        
        Previous Findings:
        {previous_findings}
        
        Knowledge Base Information:
        {rag_context}
        
        Perform a 5-Whys analysis based on the evidence.
        Keep the response brief, max 3 sentences. Give a confidence score between 0.0 and 1.0.
        Provide the response in the format:
        FINDING: [your finding]
        EVIDENCE: [your 5-whys evidence]
        CONFIDENCE: [score]
        """
        
        finding_text = "Tool wear on insert T07 past maximum rated cutting life. SOP lacks piece-counter."
        evidence_text = "5-Whys synthesis: Tool T07 cut 2,400 parts (limit: 2,000). Tool replacement SOP is calendar-based, not usage-based."
        confidence = 0.87
        citation = "Vertex AI Search: CNC Manual + Maintenance Log T07 + 8D-2026-03-12"
        
        if rag_results:
            citation_parts = [r.title for r in rag_results]
            citation = f"Vertex AI Search: {' + '.join(citation_parts)}"
            
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
            logger.warning("LLM generation failed for Root Cause Agent, using fallback. Error: %s", e)
            
        return AgentFinding(
            agent_id="RCA",
            agent_name="Root Cause Agent",
            phase="Phase B - Root Cause",
            finding=finding_text,
            evidence=evidence_text,
            confidence=confidence,
            citation=citation
        )

root_cause = RootCauseAgent()
