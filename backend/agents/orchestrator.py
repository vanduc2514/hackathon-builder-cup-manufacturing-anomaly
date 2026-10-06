"""Orchestrator Agent (ADK): State machine that coordinates all agents via the Blackboard."""

import asyncio
import logging
import time
import json
from datetime import datetime
from backend.core.blackboard import blackboard
from backend.core.models import IncidentState, ImpactMetrics

from backend.agents.sub_agent_quality_inspector import quality_inspector
from backend.agents.sub_agent_traceability import traceability
from backend.agents.sub_agent_process_analyst import process_analyst
from backend.agents.sub_agent_root_cause import root_cause
from backend.agents.sub_agent_technician_copilot import technician_copilot
from backend.agents.sub_agent_incident_scribe import incident_scribe
from backend.agents.sub_agent_continuous_learning import continuous_learning

logger = logging.getLogger(__name__)

class Orchestrator:
    """Coordinates the Kaizen Agent team through the 4-phase incident lifecycle."""

    def __init__(self):
        self._task = None
        self._processed_states = set()
        self._delay = 1.2
        
        # Agent Registry for linear transitions
        self._linear_workflow = {
            "detecting": {
                "next_state": "tracing",
                "agent_name": "TraceabilityAgent",
                "agent": traceability,
                "model_name": "bigquery-emulator",
                "kwargs": {"incident_id": "INC-0412"}
            },
            "tracing": {
                "next_state": "investigating",
                "agent_name": "ProcessAnalystAgent",
                "agent": process_analyst,
                "model_name": "fast_reasoning",
                "kwargs": {"suspect_machine": "CNC-02", "suspect_tool": "T07"}
            },
            "investigating": {
                "next_state": "analyzing",
                "agent_name": "RootCauseAgent",
                "agent": root_cause,
                "model_name": "complex_reasoning",
                "kwargs": {}
            }
        }

    async def start(self):
        """Starts the background state machine loop."""
        if not self._task:
            self._task = asyncio.create_task(self._process_loop())
            logger.info("Orchestrator state machine started.")

    async def stop(self):
        """Stops the background state machine loop."""
        if self._task:
            self._task.cancel()
            self._task = None
            logger.info("Orchestrator state machine stopped.")
            
    def _reset_tracking(self):
        """Reset internal tracking for a new incident."""
        self._processed_states.clear()

    async def _safe_run_agent(self, agent_name: str, agent_coro, state: IncidentState):
        """Wrapper for Safe Runner: Tracing, Monitoring, Reproducibility."""
        start_time = time.time()
        try:
            finding = await agent_coro
            duration = time.time() - start_time
            logger.info(f"[Monitor] {agent_name} completed in {duration:.2f}s")
            return finding
        except Exception as e:
            logger.error(f"[Trace] {agent_name} failed: {e}", exc_info=True)
            
            # Dump state for reproducibility
            dump_data = {
                "failed_agent": agent_name,
                "error": str(e),
                "timestamp": datetime.now().isoformat(),
                "state_at_crash": state.model_dump()
            }
            dump_file = f"crash_{state.incident_id}_{agent_name}.json"
            try:
                with open(dump_file, "w") as f:
                    json.dump(dump_data, f, indent=2)
                logger.error(f"Crash dump saved to {dump_file}")
            except Exception as dump_err:
                logger.error(f"Failed to save crash dump: {dump_err}")
                
            # Alert the system via blackboard
            blackboard.update_status("error", error_message=str(e))
            return None

    async def _process_loop(self):
        """Main event-driven loop listening to Blackboard state changes."""
        try:
            async for state_json in blackboard.subscribe():
                state = IncidentState.model_validate_json(state_json)
                await self._handle_state(state)
        except asyncio.CancelledError:
            pass

    async def _handle_state(self, state: IncidentState):
        """Transition logic for the incident lifecycle."""
        
        if state.status == "error":
            return
            
        if state.status == "normal":
            self._reset_tracking()
            
        # 1. Linear Registry-driven Transitions
        elif state.status in self._linear_workflow:
            config = self._linear_workflow[state.status]
            next_state = config["next_state"]
            
            if next_state not in self._processed_states:
                self._processed_states.add(next_state)
                logger.info(f"Transitioning to {next_state.upper()}")
                
                await asyncio.sleep(self._delay)
                blackboard.update_status(next_state, **config["kwargs"])
                
                # Execute safely
                model_to_use = config.get("model_name", "mock")
                finding = await self._safe_run_agent(
                    config["agent_name"], 
                    config["agent"].run(state, model_to_use, self._delay), 
                    state
                )
                if finding:
                    blackboard.add_finding(finding)

        # 2. Complex Parallel Transition (Analyzing -> Repairing)
        elif state.status == "analyzing" and "repairing" not in self._processed_states:
            self._processed_states.add("repairing")
            logger.info("Transitioning to REPAIRING (Parallel Copilot & Scribe)")
            blackboard.update_status("repairing", root_cause="Tool T07 worn past 2,000 part limit")
            
            # Run parallel tasks with safe wrapper
            t1 = self._safe_run_agent("TechnicianCopilot", technician_copilot.run(state, "live", self._delay), state)
            t2 = self._safe_run_agent("IncidentScribe", incident_scribe.run(state, "complex_reasoning", self._delay), state)
            
            findings = await asyncio.gather(t1, t2)
            
            # Post successful findings
            for finding in findings:
                if finding:
                    blackboard.add_finding(finding)
                    
            docs = {
                "work_order": "WO-8821: Replace T07 insert & recalibrate spindle offset (Completed)",
                "report_8d": "8D Report INC-0412: Root cause verified as insert wear; preventive action defined.",
                "sop_proposal": "SOP-CNC-04 Revision: Add automated M-code piece counter alarm at 1,900 parts."
            }
            # Update status to verifying and attach documents from scribe
            self._processed_states.add("verifying")
            logger.info("Transitioning to VERIFYING")
            blackboard.update_status("verifying", documents=docs)
            
            # Start the verification gatekeeper
            asyncio.create_task(self._run_verification_loop())

        # 3. Complex Loop Transition (Verifying -> Closed)
        elif state.status == "verifying":
            # The invariant: we only transition to closed after target is met
            if state.verification_count >= state.verification_target and "closed" not in self._processed_states:
                self._processed_states.add("closed")
                logger.info("Transitioning to CLOSED")
                
                # Quality inspector's final gatekeeper finding
                qa_finding = await self._safe_run_agent(
                    "QualityInspector(Gatekeeper)", 
                    quality_inspector.run_verification(state, "vision", self._delay), 
                    state
                )
                if qa_finding:
                    blackboard.add_finding(qa_finding)
                
                # Continuous Learning impact
                impact = ImpactMetrics(
                    scrap_avoided=240,
                    downtime_minutes=45,
                    energy_kwh=38.0,
                    co2_kg=25.0
                )
                blackboard.update_status("closed", impact=impact, defect_rate=0.004)
                
                learn_finding = await self._safe_run_agent(
                    "ContinuousLearningAgent", 
                    continuous_learning.run(state, "video", self._delay), 
                    state
                )
                if learn_finding:
                    blackboard.add_finding(learn_finding)
                
    async def _run_verification_loop(self):
        """Simulates the verification process over time."""
        for count in [10, 25, 40, 50]:
            blackboard.update_status("verifying", verification_count=count)
            await asyncio.sleep(self._delay * 0.4)


orchestrator = Orchestrator()
