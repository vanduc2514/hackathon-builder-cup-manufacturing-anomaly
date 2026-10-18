"""Scripted per-scenario agent drafts used when an LLM agent step fails in DEMO_SCRIPTED mode.

Each draft matches the finding the live agent is expected to produce for the demo story
(docs/DEMO_GUIDE.md): CNC-02 / tool T07 flank wear on aluminum AL-5083-B4 (`cnc_tool_wear`), or
IM-05 / cavity 3 short fill from damp ABS resin (`im_damp_material`). The root-cause draft clears
both RCA gate thresholds (0.70 first round, 0.85 after a field-evidence round), so the scripted
flow proceeds to repair, verification and closure.
"""

from __future__ import annotations

from backend.agents import agent_incident_scribe, agent_root_cause
from backend.core.models import FindingDraft, FiveWhysStep, RootCauseFindingDraft, ScribeDraft

DEFAULT_SCENARIO = "cnc_tool_wear"

_CNC_ROOT_CAUSE = RootCauseFindingDraft(
    finding=(
        "Tool T07 flank wear on CNC-02: the carbide insert ran 2,400 cuts against a 2,000-cut "
        "rated life, because SOP-MNT-CNC-04 changes tools on a calendar instead of a piece count."
    ),
    evidence=(
        "Defective AL-5083 housings trace to T07 only (lot AL-5083-B4 is ruled out), spindle "
        "vibration rose about 35% with steady temperature, and the CNC-02 manual (p.112) and the "
        "T07 maintenance log confirm the insert was past its rated life. Machine (tool wear) and "
        "Method (calendar-based SOP) are the causal 6M factors."
    ),
    confidence=0.87,
    citation=agent_root_cause.DEFAULT_CITATION,
    five_whys=[
        FiveWhysStep(
            level=1,
            why="Why did finished AL-5083 housings show vertical scratch marks?",
            answer="The face-mill insert on CNC-02 tool T07 had severe flank wear.",
            evidence="Traceability isolated CNC-02 / T07 with a 0.95 correlation score.",
            citation="Traceability topology query",
        ),
        FiveWhysStep(
            level=2,
            why="Why did the T07 insert wear out so badly?",
            answer="T07 cut 2,400 parts, 400 beyond the 2,000-cut rated insert life (VB > 0.3 mm).",
            evidence="Spindle vibration rose about 35% above baseline while temperature stayed steady.",
            citation="BigQuery sensor_telemetry window 09:00-10:00 + CNC Manual p.112",
        ),
        FiveWhysStep(
            level=3,
            why="Why was T07 allowed to run 400 cuts past its rated life?",
            answer="SOP-MNT-CNC-04 replaces cutting tools on a weekly calendar, not on part counts.",
            evidence="The maintenance log shows the last T07 change seven days earlier.",
            citation="CNC-02 Maintenance Log T07",
        ),
        FiveWhysStep(
            level=4,
            why="Why does the schedule ignore part counts?",
            answer="The cell controller has no piece-counter interlock to trigger a tool change.",
            evidence="Nothing inhibits spindle start when the count exceeds 2,000.",
            citation="8D-2026-03-12",
        ),
        FiveWhysStep(
            level=5,
            why="Why is there no piece-counter interlock?",
            answer=(
                "Root cause: the tool-change SOP relies on calendar intervals instead of an "
                "automated part-counter lockout."
            ),
            evidence="SOP-MNT-CNC-04 defines no usage-based trigger.",
            citation="8D-2026-03-12 D4",
        ),
    ],
    ishikawa={
        "Machine": ["T07 insert flank wear (VB > 0.3 mm) after 2,400 cuts; spindle vibration up 35%."],
        "Method": ["SOP-MNT-CNC-04 is calendar-based, with no usage-based tool-life limit."],
        "Material": ["Aluminum lot AL-5083-B4 ruled out: no defects on CNC-01 or CNC-03 from the same lot."],
        "Man": ["Operator followed standard feeds and speeds; human error ruled out."],
        "Measurement": ["End-of-line vision inspection correctly flagged the scratches and the SPC breach."],
        "Milieu": ["Spindle temperature and coolant flow were normal; environment ruled out."],
    },
)

_IM_ROOT_CAUSE = RootCauseFindingDraft(
    finding=(
        "Saturated desiccant on Dryer-03 let damp ABS resin reach IM-05, causing short fill in "
        "cavity 3, because no dew-point interlock stops injection when drying fails."
    ),
    evidence=(
        "All short-fill defects originate from IM-05 cavity 3, Dryer-03 dew point degraded from "
        "-45 C to about -18 C, and the IM-05 manual (p.78) and 8D-2026-02-14 tie moist resin to "
        "viscosity loss. Machine (dryer) and Method (no interlock) are the causal 6M factors."
    ),
    confidence=0.87,
    citation=agent_root_cause.DEFAULT_IM_CITATION,
    five_whys=[
        FiveWhysStep(
            level=1,
            why="Why did molded parts show short fill and sink marks in cavity 3?",
            answer="Melt pressure and fill volume were insufficient in cavity 3 during injection.",
            evidence="Conveyor vision flagged the short-fill rate above the SPC upper limit.",
            citation="Optical Inspection Station Camera #2",
        ),
        FiveWhysStep(
            level=2,
            why="Why were melt pressure and fill volume insufficient?",
            answer="The ABS resin carried excess moisture, causing hydrolysis and viscosity loss.",
            evidence="IM-05 manual, moisture limits for ABS.",
            citation="IM-05 Manual p.78",
        ),
        FiveWhysStep(
            level=3,
            why="Why was the resin moisture above specification?",
            answer="The Dryer-03 desiccant bed was saturated and could not reach the -40 C dew point.",
            evidence="Dew point spiked from -45 C to about -18 C over 90 minutes.",
            citation="BigQuery sensor_telemetry dryer metrics",
        ),
        FiveWhysStep(
            level=4,
            why="Why was the saturated desiccant not regenerated or replaced?",
            answer="Dryer maintenance was overdue and no alarm reached the line.",
            evidence="8D-2026-02-14 records the same maintenance gap.",
            citation="8D-2026-02-14 D4",
        ),
        FiveWhysStep(
            level=5,
            why="Why was there no automated dew-point interlock?",
            answer="Root cause: the preventive maintenance SOP lacks a dew-point interlock before hopper feed.",
            evidence="SOP-INJ-02 defines no inline moisture limit.",
            citation="8D-2026-02-14 D5",
        ),
    ],
    ishikawa={
        "Machine": ["Dryer-03 desiccant bed saturated; dew point degraded to about -18 C."],
        "Method": ["No dew-point interlock pauses injection when drying fails."],
        "Material": ["ABS resin moisture elevated by the failed drying; polymer degrades under heat."],
        "Man": ["Shift log shows no manual dew-point check before the run."],
        "Measurement": ["Inline vision correctly detected the short fill and the SPC breach."],
        "Milieu": ["High ambient humidity accelerated desiccant saturation."],
    },
)

_FINDINGS: dict[str, dict[str, FindingDraft]] = {
    "cnc_tool_wear": {
        "quality_inspector": FindingDraft(
            finding=(
                "Vision inspection found a vertical-scratch cluster on CNC-02 AL-5083 housings: "
                "about 7.7% of the last 300 parts, above the SPC upper control limit."
            ),
            evidence=(
                "The end-of-line camera classified the marks as linear scratches along the cutting "
                "direction on Face A, and the SPC chart crossed its upper control limit in the "
                "latest 300-part window."
            ),
            confidence=0.95,
            citation="End-of-line Camera Station #1 + SPC control chart",
        ),
        "traceability": FindingDraft(
            finding=(
                "Traceability isolates CNC-02 tool T07: every defective part passed through T07, "
                "while aluminum lot AL-5083-B4 is spread evenly across good and bad parts."
            ),
            evidence=(
                "Discrete topology shows 23 of 23 defects on CNC-02 / T07 with a 0.95 correlation "
                "score; CNC-01 and CNC-03 run the same lot with normal pass rates."
            ),
            confidence=0.93,
            citation="BigQuery: kaizen_manufacturing.traceability topology analysis",
        ),
        "process_analyst": FindingDraft(
            finding=(
                "CNC-02 spindle vibration rose about 35% above the line baseline while "
                "temperature stayed steady, the signature of cutting-edge wear."
            ),
            evidence=(
                "In the pre-incident window 09:00-10:00, vibration peaked near 10.4 kHz and "
                "spindle motor current rose, while temperature held at its baseline."
            ),
            confidence=0.9,
            citation="BigQuery: kaizen_manufacturing.sensor_telemetry window 09:00-10:00",
        ),
        "technician_copilot": FindingDraft(
            finding=(
                "The technician replaced worn insert T07 with a new WNMG-080408 and verified "
                "spindle runout within tolerance."
            ),
            evidence=(
                "Guided steps: LOTO disconnect, enclosure removal, insert swap at 4.2 N·m, dial "
                "indicator runout 0.003 mm (limit 0.005 mm), and a 1,500 RPM test spin."
            ),
            confidence=0.94,
            citation="CNC-02 OEM Maintenance Manual p.112",
        ),
        "technician_copilot_diagnostic": FindingDraft(
            finding=(
                "Field inspection confirms abrasive flank wear and a micro-chipped cutting edge "
                "on insert T07."
            ),
            evidence=(
                "The macro photo of the T07 insert shows flank wear above 0.3 mm (VB > 0.3 mm) "
                "and edge chipping, consistent with the vertical scratches on the housings."
            ),
            confidence=0.92,
            citation="Technician field photo of insert T07 (mobile camera)",
        ),
        "continuous_learning": FindingDraft(
            finding=(
                "The verified resolution was indexed as a Defect -> Cause -> Fix entry and the "
                "sustainability impact card was computed."
            ),
            evidence=(
                "The entry records CNC-02 / T07 flank wear, the 5-Whys root cause, the insert "
                "replacement steps and the proposed usage-based tool-life limit in SOP-MNT-CNC-04."
            ),
            confidence=0.97,
            citation="Vertex AI Search Vector Index + BigQuery Sustainability Accounting",
        ),
    },
    "im_damp_material": {
        "quality_inspector": FindingDraft(
            finding=(
                "Optical inspection found short shot and sink marks on mold cavity 3 of IM-05, "
                "with the defect rate above the SPC upper control limit."
            ),
            evidence=(
                "The conveyor camera detected incomplete fill on about 6.2% of the last 300 "
                "parts, all from cavity 3."
            ),
            confidence=0.95,
            citation="Optical Inspection Station Camera #2 + SPC control chart",
        ),
        "traceability": FindingDraft(
            finding=(
                "Traceability isolates IM-05 mold cavity 3, which accounts for every short-fill "
                "defect; the other cavities fill normally."
            ),
            evidence=(
                "Discrete topology shows 19 of 19 defects from IM-05 cavity 3 with a 0.97 "
                "correlation score; other machines and cavities show nominal fill."
            ),
            confidence=0.94,
            citation="BigQuery: kaizen_manufacturing.traceability topology analysis",
        ),
        "process_analyst": FindingDraft(
            finding=(
                "The IM-05 resin dryer dew point spiked from -45 C to about -18 C, well above "
                "the -40 C limit, which lets moisture into the resin."
            ),
            evidence=(
                "The dew point transmitter on the hopper dryer rose steadily over the last 90 "
                "minutes while barrel temperature stayed steady."
            ),
            confidence=0.93,
            citation="BigQuery: kaizen_manufacturing.sensor_telemetry dryer metrics",
        ),
        "technician_copilot": FindingDraft(
            finding=(
                "The technician replaced the saturated Dryer-03 filter and purged the moist resin; "
                "dew point is back within tolerance."
            ),
            evidence=(
                "Guided steps: heater de-energization, filter FLT-ABS-04 replaced with a new "
                "O-ring, dew point verified at -35 C (limit -30 C), and drying resumed at 85 C "
                "for 4 hours."
            ),
            confidence=0.94,
            citation="SOP-MOLD-02 p.45",
        ),
        "technician_copilot_diagnostic": FindingDraft(
            finding="Field inspection confirms saturated desiccant beads and oil fouling on Dryer-03.",
            evidence=(
                "The close-up photo of Dryer-03 shows discolored, clumped desiccant beads, "
                "consistent with moisture-induced short fill in cavity 3."
            ),
            confidence=0.92,
            citation="Technician field photo of Dryer-03 (mobile camera)",
        ),
        "continuous_learning": FindingDraft(
            finding=(
                "The verified resolution was indexed as a Defect -> Cause -> Fix entry and the "
                "sustainability impact card was computed."
            ),
            evidence=(
                "The entry records IM-05 cavity 3 short fill, the saturated-desiccant root cause, "
                "the dryer service steps and the proposed dew-point interlock in SOP-INJ-02."
            ),
            confidence=0.97,
            citation="Vertex AI Search Vector Index + BigQuery Sustainability Accounting",
        ),
    },
}

_ROOT_CAUSE: dict[str, RootCauseFindingDraft] = {
    "cnc_tool_wear": _CNC_ROOT_CAUSE,
    "im_damp_material": _IM_ROOT_CAUSE,
}

_SCRIBE: dict[str, ScribeDraft] = {
    "cnc_tool_wear": ScribeDraft(
        finding="8D report, work order WO-2026-1004 and SOP revision drafted for the T07 flank wear incident.",
        evidence=(
            "D1-D8 compiled from the board; the work order replaces insert T07 and re-verifies "
            "spindle runout; the SOP proposal adds a usage-based tool-life lockout."
        ),
        confidence=0.95,
        citation=agent_incident_scribe.DEFAULT_CITATION,
        work_order=(
            "WO-2026-1004 (pending_approval: shift_leader): replace insert T07 on CNC-02 with "
            "WNMG-080408 at 4.2 N·m; verify dial-indicator spindle runout <= 0.005 mm; run a "
            "1,500 RPM test spin before releasing the line."
        ),
        report_8d=(
            "8D (pending_approval: shift_leader). D2: vertical scratches on AL-5083-B4 housings "
            "from CNC-02, about 7.7% against the SPC limit. D3: scrap diverted at the edge. D4: "
            "T07 insert ran 2,400 cuts against a 2,000-cut life under a calendar-based SOP. D5: "
            "insert replaced, runout verified. D6: 50 consecutive defect-free parts required. D7: "
            "usage-based tool lockout. D8: team recognized."
        ),
        sop_proposal=(
            "SOP-MNT-CNC-04 revision (pending_approval: shift_leader): replace calendar-based tool "
            "changes with an automated piece-counter alarm at 1,900 parts and a hard lockout at "
            "2,000 cuts."
        ),
    ),
    "im_damp_material": ScribeDraft(
        finding="8D report, work order WO-2026-1005 and SOP revision drafted for the Dryer-03 moisture incident.",
        evidence=(
            "D1-D8 compiled from the board; the work order services Dryer-03 and purges IM-05; the "
            "SOP proposal adds a dew-point interlock."
        ),
        confidence=0.95,
        citation=agent_incident_scribe.DEFAULT_IM_CITATION,
        work_order=(
            "WO-2026-1005 (pending_approval: shift_leader): replace saturated filter FLT-ABS-04 "
            "on Dryer-03, purge the IM-05 barrel of moist resin, and verify dew point <= -30 C."
        ),
        report_8d=(
            "8D (pending_approval: shift_leader). D2: short fill and sink marks from IM-05 cavity "
            "3. D3: affected lot quarantined. D4: saturated desiccant let moist ABS reach the "
            "barrel. D5: filter replaced, barrel purged, dew point verified. D6: 50 consecutive "
            "defect-free parts required. D7: dew-point interlock. D8: team recognized."
        ),
        sop_proposal=(
            "SOP-INJ-02 revision (pending_approval: shift_leader): add an automated dew-point "
            "alarm interlock that blocks hopper feed and injection above -30 C."
        ),
    ),
}

def fallback_draft(agent_name: str, scenario: str | None) -> FindingDraft:
    """Returns a fresh scripted draft for the ADK agent `agent_name` in `scenario`.

    The type matches the agent's output schema: RootCauseFindingDraft for `root_cause`,
    ScribeDraft for `incident_scribe`, FindingDraft otherwise. An unknown or missing scenario
    uses the CNC tool-wear story. Raises KeyError for an agent that has no scripted draft.
    """
    key = scenario if scenario in _FINDINGS else DEFAULT_SCENARIO
    if agent_name == "root_cause":
        draft: FindingDraft = _ROOT_CAUSE[key]
    elif agent_name == "incident_scribe":
        draft = _SCRIBE[key]
    else:
        draft = _FINDINGS[key][agent_name]
    return draft.model_copy(deep=True)
