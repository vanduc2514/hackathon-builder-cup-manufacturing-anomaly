"""Traceability Agent: Queries discrete line topology and outputs a ranked suspect list."""

import asyncio
from backend.core.models import AgentFinding
from backend.tools.bigquery_tool import query_traceability_topology

class TraceabilityAgent:
    async def run(self, state, model_name: str = "mock", delay: float = 1.2) -> AgentFinding:
        await asyncio.sleep(delay)
        
        # Query discrete topology diff from BigQuery / Emulator
        topology_result = await asyncio.to_thread(query_traceability_topology)
        
        suspects = topology_result.get("suspects", [])
        top_suspect = suspects[0] if suspects else None
        
        if top_suspect:
            machine_id = top_suspect.get("machine_id")
            tool_id = top_suspect.get("tool_id")
            confidence = top_suspect.get("correlation_score", 0.0)
            
            finding_text = f"Defects isolated to {machine_id} with Cutting Tool {tool_id}. Raw materials excluded."
            evidence_text = f"Highest correlation score ({confidence}) for {machine_id}/{tool_id} based on discrete event tracing."
            citation = f"BigQuery `{topology_result.get('source')}` cross-lot correlation"
        else:
            finding_text = "No clear suspects identified from discrete topology."
            evidence_text = "BigQuery returned empty suspects list."
            confidence = 0.0
            citation = "BigQuery `traceability`"

        return AgentFinding(
            agent_id="TRA",
            agent_name="Traceability Agent",
            phase="Phase B - Tracing",
            finding=finding_text,
            evidence=evidence_text,
            confidence=confidence,
            citation=citation
        )

traceability = TraceabilityAgent()
