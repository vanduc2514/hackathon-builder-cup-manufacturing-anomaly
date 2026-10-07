# Kaizen Agent: An AI Team for Product Inspection and Root-Cause Tracing on the Production Line

**Competition theme:** Manufacturing, interwoven with Sustainability.

"Kaizen" is the Japanese philosophy of continuous improvement, very familiar inside factories. The name helps judges from the manufacturing industry immediately understand what the product does.

**One-sentence summary:** Kaizen Agent looks at the *product* coming off the line, detects defects as early as possible, then traces back to the *machine, tool, mold, material, or process* that caused the defect, guides the technician through the repair with Vietnamese voice instructions, confirms the fix using the product itself, and stores the experience so it never repeats.

---

## 1. The problem to solve

Small and medium-sized factories in Southeast Asia (electronics, automotive parts, plastics, textiles) face 5 difficulties:

| Difficulty | Consequence |
|---|---|
| **Machines don't stop but silently produce scrap** (worn tools, misaligned molds, thermal drift, damp material) | By the time end-of-shift QC or the customer notices, the whole lot is gone. Scrap and rework costs are usually larger than the cost of stopping the machine. |
| When a product defect is found, **there is no way to know which machine or which process step** caused it | Lines run many machines in parallel; manual tracing takes hours, during which the faulty machine keeps running. |
| Only 1–2 veteran technicians know how to fix it | If they are on leave, have quit, or are on another shift, no one can handle it. The experience lives in their heads, not on paper. |
| Machine documentation is written in English or Japanese | Frontline workers and technicians mostly speak Vietnamese, Thai, or Indonesian; they cannot read it or lose a lot of time. |
| Incident root-cause reports (8D) take days to write | Old incidents easily repeat. Every repetition means more scrap and wasted electricity and materials. |

The common thread: **a defective product is the earliest and most objective symptom** of a problem on the line, but today that information is not connected to machine data and repair knowledge.

---

## 2. Design principle: Product-first

Kaizen Agent does **not** start from machine sensors. The system starts at the product inspection station and only uses machine data to trace back.

```
Product inspection  →  Detect defect / rising defect rate
       ↓
Trace: which machine, which tool/mold, which material lot, which shift made this product?
       ↓
Narrow down suspects  →  Pull sensor data for THAT machine, THAT time window
       ↓
Look up manuals, logs, past incidents  →  Find root cause (5-Whys, Ishikawa)
       ↓
Guide the repair with voice + camera
       ↓
Re-inspect the product: N consecutive good products  →  only then close the incident
       ↓
Draft 8D, work order, SOP update  →  Human approval  →  Store in the knowledge base
```

Why this direction is stronger than "machine sensors raise the alarm first":

- A machine that breaks down completely is obvious to everyone. The danger is a machine that keeps running while producing scrap for hours with nobody noticing. Only the product "speaks" that truth.
- The cause is not always in the machine. It can be the material, the environment, or the operator's actions. Looking only at machine sensors will never find it (see Use case 2).
- Closed loop: an incident is only closed when the *product* confirms the defects are gone, not when the technician says "done."

Machine sensors still have a **secondary path** for early warning (a spike in vibration, an unusual machine sound), but that is a supporting signal, not the primary starting point of the workflow.

---

## 3. Solution: one coordinated AI "team," split into 4 phases

Instead of a single chatbot, Kaizen Agent is a team of multiple AI agents, each with its own specialty, like a miniature engineering crew. The whole thing is driven by an **Orchestrator Agent** built with ADK (Google's Agent Development Kit).

### Agent team overview

| Phase | Agent | What it does | Core technology |
|---|---|---|---|
| A. Detection | **Quality Inspector** | Scans each product's image, classifies defect type, location, and severity; monitors SPC control charts; called by the Orchestrator, it returns the classification (the Orchestrator opens the incident when thresholds are exceeded) | Gemma at the gateway + Gemini Vision |
| B. Tracing | **Traceability** | Links the defective product to machine, process step, tool/mold, material lot, operator, and parameters; produces a ranked suspect list | BigQuery + ADK tool |
| B. Tracing | **Process Analyst** | Pulls sensor data for the suspected machine only, in the right time window, and compares with baseline | BigQuery + Gemini |
| B. Tracing | **Knowledge** | Searches manuals, maintenance logs, past 8D reports, and expert technician videos; a "defect → cause" library; always cites sources | Vertex AI Search / RAG |
| B. Tracing | **RCA (Root Cause)** | Synthesizes evidence, runs 5-Whys and Ishikawa, produces ranked hypotheses with confidence; requests more evidence if insufficient | Gemini |
| C. Resolution | **Repair Guide** | Real-time voice + camera conversation in Vietnamese, step by step, with citations | Gemini Live API |
| C. Resolution | **Action & Documentation** | Drafts work orders, 8D reports, and SOP change proposals; returns them to the Orchestrator, which routes them to the shift leader for approval | Gemini |
| D. Learning | **Knowledge Capture & Impact** | Turns expert technician videos and just-resolved incidents into new knowledge-base entries; computes impact cards | Gemini Video + BigQuery |

### Phase A: Detecting anomalies from the product

**Data infrastructure.** Cameras at the inspection station photograph each product. Machine sensors (temperature, vibration, current, pressure) and microphones recording machine sound send data via OPC-UA/MQTT to Google Cloud. Pub/Sub is the "conveyor belt" receiving real-time data; BigQuery is the storage and analytics warehouse. Most importantly, each product is tagged with a **traceability code** (QR/laser-etched code, or simply a timestamp + position on the conveyor) so it can be linked to the machine that produced it.

**On-premises gateway.** A small computer running Gemma, Google's lightweight open-source model, does two things locally: fast classification of product images as pass/fail, and anomaly detection in sensor/audio signals. Only defective images and anomalous signals are sent to the cloud. Benefits: fast, bandwidth-efficient, and sensitive raw data never has to leave the factory. Factories care a lot about this point for security.

**Quality Inspector Agent.** The defect / SPC event from the gateway goes to the Orchestrator, not to the agents. The Orchestrator calls the Quality Inspector, which takes the defect images and uses Gemini for detailed classification: defect type (scratch, burr, short fill, misalignment, etc.), location on the product, severity. Monitors the defect rate on an SPC control chart. When the defect rate exceeds control limits or a new defect type appears, the Orchestrator opens an incident and records the Quality Inspector's classification on the board.

> Example output: *"Vertical scratch 2–3 mm on face A, started at 09:40, 23/300 products (7.7%), rising. Baseline rate was 0.5% before."*

### Phase B: Tracing and root-cause investigation

The Orchestrator Agent receives the incident and assigns work in a deliberate order:

**Step 1. Traceability Agent (runs first, mandatory).** From the product code or the defect time window, it looks up the traceability table in BigQuery: which machines this product passed through, which process steps, which tools/molds, which material lot, who operated it, and what the settings were. The agent compares the group of defective products with the group of good products at the same time to rule out irrelevant factors, then produces a ranked suspect list.

> Example: *"100% of defective products passed through CNC-02, tool T07. CNC-01 and CNC-03 used the same aluminum lot but had no defects → rule out material. Suspect #1: CNC-02 / tool T07 (score 0.95)."*

**Step 2. Process Analyst Agent and Knowledge Agent (run in parallel).**

Sensor analysis pulls data only for the suspected machine, in the time window around the defect, and compares it with that same machine's baseline. Because the scope is already narrowed, there is no need to "fish" across the whole line.

> Example: *"CNC-02 spindle vibration up 35% from 09:30, spindle current up 12%. Bearing temperature normal. The vibration rise started 10 minutes before the product defects."*

Knowledge lookup searches by two keys: product defect type and suspected machine. Sources include equipment manuals, maintenance logs, past 8D reports, and procedures extracted from expert technician videos. Every result comes with citations.

> Example: *"CNC manual page 112: vertical scratches plus rising vibration indicate tool wear. Maintenance log: tool T07 was last replaced 18 days ago and has cut 2,400 parts; the manufacturer's recommended life is 2,000. A similar incident on 12/3 was resolved by replacing the insert."*

**Step 3. Root Cause Agent.** Synthesizes all evidence and analyzes it using two industry-standard methods:

- **5-Whys**, always starting from the product: *Product has vertical scratches → because tool T07 on CNC-02 is worn → because the tool ran past its life → because the tool-change schedule is by day, not by number of parts → because the old SOP has no counter.*
- **Ishikawa fishbone diagram**: sorts evidence into People, Machine, Material, Method, Environment, and Measurement categories so no branch is missed.

The agent produces ranked hypotheses with confidence (for example 87%). If confidence is below threshold (for example 70%), the agent **does not conclude** but states exactly what additional evidence is needed (for example "a close-up photo of the cutting edge"); the Orchestrator Agent turns that request into a question for the technician over the voice channel.

### Phase C: Guiding the repair and confirming with the product

**Repair Guide Agent.** The technician points a phone at the machine and speaks Vietnamese as if on a video call with an expert: *"What's wrong with this machine, what should I do?"* The Gemini Live API, watching through the camera and listening, answers step by step: *"Remove the left cover… that's right, now check the tool runout…"* Every instruction cites its source ("according to the manual, page 112") so the technician can trust and verify it. The AI does not invent repair steps; if there is no source, the AI says so clearly and suggests calling a senior technician.

When more evidence is needed, this same channel is where the system asks the technician back: *"Please take a close-up of the cutting edge so I can confirm."*

**Confirmation with the product.** After the technician reports the repair is done, the system **does not close the incident immediately**. The Orchestrator Agent has the Quality Inspector Agent keep monitoring; the incident is only closed when N consecutive products pass (for example 50) and the defect rate returns to baseline. If defects remain, it goes back to Phase B with the new evidence ("the tool was replaced but scratches persist → different cause").

**Action & Documentation Agent.** Automatically drafts 3 documents:

1. **Work order:** assigns the repair job, orders spare parts.
2. **8D report:** the 8-step incident-resolution report template, standard in automotive and electronics. It normally takes days to write; the AI drafts it in seconds from the incident board itself.
3. **SOP update proposal:** adds a preventive step so the incident doesn't repeat.

A manager or shift leader approves before it is officially applied. The human is always the final decision-maker.

### Phase D: Learning and measuring impact

**Preserving the knowledge of expert technicians.** A veteran technician records a 2-minute video, demonstrating and explaining how to fix a difficult defect. Gemini watches the video, converts it into a step-by-step procedure with visuals, and stores it in the knowledge base. At the same time, each closed incident is added to a **"defect → cause → fix" library**, so the next time a similar defect appears, the Knowledge Agent finds it immediately. When expert technicians retire or leave, their skills stay in the factory.

**Impact card.** Each incident has a card displaying, in priority order:

1. **Scrap avoided** = (time detected earlier than manual QC) × (line speed). This is the central metric of the Product-first approach.
2. Minutes of machine downtime saved compared to the usual handling.
3. Kilograms of material, kWh of electricity, and CO₂ reduced (the material and energy already spent producing scrap, plus recycling cost).

This is the sustainability proof and the basis for competing for the Most Impactful Solution side prize.

---

## 4. How the agents communicate

The agents **do not chat freely with each other**. The system uses a **shared incident state** model (a "blackboard" style) stored in Firestore, controlled by the Orchestrator Agent (ADK). The Orchestrator is the single entry and exit point: it receives every input (defect/SPC events, technician reports, shift-leader approvals), passes the board to the agent it calls, records the agent's returned finding on the board (it is the sole writer), decides who to call next, and publishes every output (dashboard, documents for approval, knowledge-base entries, impact card). Agents never receive external events, never write the board, and never talk to each other or to humans directly.

Documented exceptions:

- **Read-only dashboard:** the dashboard reads the board (current incident + live event stream); only the Orchestrator writes it.
- **Agent tool lookups:** Traceability/Process Analyst query BigQuery, Root Cause/Copilot query RAG, agents call Gemini. These are data queries, not incident input/output.
- **Data-plane ingestion:** Pub/Sub → BigQuery storage of raw telemetry and traceability data.
- **Technician Copilot live session:** the live voice + camera stream with the technician (Gemini Live) cannot be relayed; the Orchestrator starts and ends the session and receives its outcomes (diagnostic evidence, repair done).
- **ADK dev UI:** `adk web` / `adk run` run the workflow graph directly, without the Orchestrator runner (dev only, separate process, in-memory board).

Every message has 4 mandatory parts: **finding – evidence – confidence – source citation**. This makes every conclusion verifiable, and the demo screen only needs to display this incident board for judges to clearly see what each agent is doing.

### Flow of a typical incident

| # | Who | Does what | Result (recorded on the board by the Orchestrator) |
|---|---|---|---|
| 1 | Orchestrator | Receives the `defect_spike` event from the edge gateway / SPC, opens incident INC-0412, calls Quality Inspector to classify | `{event: "defect_spike", type: "scratch_vertical", rate: 0.077, since: "09:40"}` |
| 2 | Orchestrator | Records the Quality Inspector's classification, calls Traceability (sequential, mandatory) | `{incident: "INC-0412", status: "tracing"}` |
| 3 | Traceability | Narrows down suspects | `{suspects: [{machine: "CNC-02", tool: "T07", score: 0.95}], excluded: ["material_lot"]}` |
| 4 | Orchestrator | Calls **in parallel** Process Analyst (CNC-02, 09:00–10:00) and Knowledge (vertical scratch + CNC-02) | `{status: "investigating"}` |
| 5 | Process Analyst | Returns result | `{finding: "vibration +35%, current +12%", since: "09:30", confidence: 0.8}` |
| 5 | Knowledge | Returns result | `{finding: "tool wear", sources: ["manual p.112", "maint_log T07", "8D 2026-03-12"]}` |
| 6 | Orchestrator | Calls RCA | `{status: "analyzing"}` |
| 7 | RCA | Concludes or requests more evidence | `{root_cause: "T07 worn, over tool life", confidence: 0.87, whys: [...], ishikawa: {Machine: ..., Method: ...}}` |
| 7b | RCA (if confidence < 0.7) | Requests evidence | `{need: "close-up photo of insert"}` → Orchestrator turns it into a question for the technician via Gemini Live → photo arrives → back to step 7 |
| 8 | Orchestrator | Calls **in parallel** Repair Guide (for the technician) and Action (draft 8D) | `{status: "repairing"}` |
| 9 | Repair Guide | Technician reports done; returns the outcome to the Orchestrator | `{repair_done: true, steps_taken: [...]}` |
| 10 | Orchestrator | Has Quality Inspector verify 50 consecutive good products | `{status: "verifying"}` |
| 11 | Quality Inspector | Confirms | `{verified: true, good_streak: 50, rate: 0.004}` |
| 12 | Orchestrator | Closes the incident; calls Action to finalize 8D/SOP and sends it to the shift leader; the shift leader's approval comes back to the Orchestrator; calls Knowledge Capture | `{status: "closed", pending_approval: "shift_leader"}` |
| 13 | Knowledge Capture | Returns a defect → cause library entry and the impact card; the Orchestrator adds the entry and publishes the card | `{impact: {scrap_avoided: 240, downtime_min: 45, kwh: 38, co2_kg: 25}}` |

Three notable points in this communication style:

- **The order has a reason.** Traceability always runs before sensor analysis, because you have to know who the suspect is before you know which machine's data to pull. This is the core of "tracing back."
- **The evidence-gathering loop** (step 7b). The system is not a one-way pipeline; when it isn't sure enough, it knows how to ask again.
- **Closing the incident with product data** (steps 10–11), not with a statement.

---

## 5. Two use cases

### Use case 1: CNC machining of automotive parts — surface scratches → tool wear

*Root cause in the Machine + Method categories.*

**Context.** A factory machining aluminum gearbox housings, 3 CNC machines running in parallel, all receiving blanks from the same aluminum lot. Night shift; the on-duty technician is not familiar with the machine.

**Sequence of events.**

1. 09:40, the end-of-line camera sees vertical scratches on face A. Within 20 minutes, the defect rate rises from 0.5% to 8%. The Orchestrator opens an incident from the edge/SPC signal (the Quality Inspector Agent classifies the defect).
2. Traceability Agent: 100% of defective products passed through CNC-02, tool T07. CNC-01 and CNC-03 used the same aluminum lot but had no defects → rule out material. Suspect: CNC-02 / T07.
3. Process Analyst Agent: CNC-02 spindle vibration up 35% from 09:30, 10 minutes before the product defects; current up 12%; temperature normal.
4. Knowledge Agent: manual page 112 (vertical scratches + rising vibration = tool wear); maintenance log shows T07 has cut 2,400 parts, exceeding its 2,000 life; the tool-change schedule is currently by day.
5. RCA Agent, 87% confidence: tool wear. Root cause: the tool-change SOP is time-based instead of part-count-based.
6. The night-shift technician, speaking Vietnamese over the phone, is guided to replace the insert and check runout, each step with a manual citation.
7. After the repair, 50 consecutive products pass and the defect rate returns to 0.4% → incident closed.
8. The system drafts the 8D and proposes a new SOP: an automatic part counter that reminds at 1,900 parts. The shift leader approves.

**Impact card.** Detected 2 hours earlier than end-of-shift QC → 240 scrap parts avoided; 45 minutes of downtime saved hunting for the cause; 38 kWh and about 25 kg CO₂ (machining energy plus aluminum re-melting).

### Use case 2: Injection molding of electronics enclosures — short fill in one mold cavity → damp material

*Root cause in the Material + Environment categories. The injection machine is completely normal.*

**Context.** Injection machine IM-05 runs a 4-cavity mold, producing ABS plastic enclosures. At 14:00, the material team switches to a new batch of plastic pellets.

**Sequence of events.**

1. 14:20, the camera sees sink marks and short fill, but **only on products from cavity #3**. The Orchestrator opens an incident from the edge/SPC signal (the Quality Inspector Agent classifies the defect).
2. Traceability Agent: defects start exactly 20 minutes after the material lot change. The neighboring machine IM-06 still uses the old lot, with no defects. Suspect #1: the new material lot; suspect #2: cavity 3.
3. Process Analyst Agent: injection pressure, melt temperature, and cycle time of IM-05 are all normal. But the dryer's dew point rose from −40 °C to −18 °C at 13:50.
4. Knowledge Agent: ABS material manual (pellet moisture > 0.02% causes sink marks and short fill); an 8D report from 12/3 had a similar incident resolved by replacing the dryer filter; the mold drawing shows cavity 3 has the longest runner, so it is the most sensitive to poorly flowing material.
5. RCA Agent, 82% confidence: the new lot's pellets were not dried enough because the dryer filter is clogged. Root cause: the lot-change SOP has no dew-point measurement step.
6. The technician is guided to replace the filter and re-dry the material for 4 hours. The system simultaneously drafts a spare-filter order.
7. After restarting, 50 consecutive products pass on all 4 cavities → incident closed.
8. New SOP: dew point must be measured on every lot change; automatic warning when dew point > −30 °C.

**Impact card.** 600 scrap plastic enclosures avoided (about 18 kg of plastic); 3 hours of useless machine runtime; about 45 kWh.

**Why these two use cases.** One traces back to a machine fault, the other traces back to a material and process fault. That proves the Traceability Agent and the Ishikawa diagram are genuinely necessary, not decoration: if the system only looked at injection-machine sensors, use case 2 would never be solved.

---

## 6. Why this idea has a high chance of winning

**Technical merit (40%).** The idea demonstrates many AI capabilities at once:

- Multi-agent coordination with a clear protocol and an evidence-gathering loop.
- Processing product images, sensor data, audio, text, and video.
- Real-time voice conversation through the camera in Vietnamese.
- Combining Gemma running on-premises (edge) with Gemini in the cloud.
- Answers with citations, no fabrication; knows how to say "not enough evidence."
- Closed loop: confirmation through product data; human approval.

This gives the project a shot at the Best use of Google Cloud AI tools side prize.

**Creativity (25%).** At Gen AI Exchange 2025, the winning team in the cement track focused on optimizing factory operations. Kaizen Agent takes a different direction: starting from product quality, serving frontline workers, and preserving knowledge. The theme is still manufacturing (which judges have shown they like) but does not duplicate the old idea.

---

## 7. Demo script (under 90 seconds)

1. The screen shows a simulated production line: 3 CNC machines, an end-of-line camera station, and an SPC defect-rate chart sitting at 0.5%.
2. Press the **"Inject defect"** button: the camera starts catching scratched products, the SPC chart jumps to 8%, and a red alert appears.
3. The incident board appears, with each line filled in real time: Traceability narrows down CNC-02 → the vibration chart for **that machine** appears, showing the rise from 09:30 → manual page 112 is looked up → RCA concludes "Worn tool T07, 87% confidence."
4. A person holds a phone, speaks Vietnamese to the camera, and receives step-by-step tool-replacement guidance.
5. That person says "Done." The screen shows a counter "Verifying: 50/50 products passed" → the incident closes → the 8D report and impact card appear (240 scrap avoided, 45 minutes, 38 kWh, 25 kg CO₂).

No real factory is needed. The team builds a virtual line that emits simulated data from the public datasets below.

---

## 8. Public datasets available for free

| Dataset | Contents | Used for |
|---|---|---|
| **MVTec AD** | Thousands of industrial product images with and without defects, 15 object types, labeled by defect type | **The central demo dataset**: Quality Inspector Agent |
| AI4I 2020, NASA C-MAPSS | Machine sensor data leading to failures | Process Analyst Agent; simulating machine data |
| MIMII | Recordings of pumps, fans, and valves in normal and faulty states | The secondary early-warning path via sound |
| Public equipment manuals | PDF instruction files from machine manufacturers | Knowledge base for the Knowledge Agent |
| **Traceability table (team-generated)** | product_id → machine_id, tool_id, lot_id, operator, timestamp | Traceability Agent. No public dataset exists; the team generates it with a simulation script and states this clearly to the judges |

---

## 9. Post-competition development (scalability)

**Business model.** Subscription software, priced per production line. The first customers are small and medium-sized factories and component suppliers that don't yet have MES. This is the largest group in Vietnam and Southeast Asia, and they usually cannot afford solutions from Siemens or SAP.

**Machine connectivity.** Use OPC-UA and MQTT, the two most common industrial communication standards supported by almost all modern PLCs. For factories without traceability codes, start with timestamp + conveyor-position tracing, then upgrade to QR/laser.

**For large factories.** Integrate into Google Cloud's Manufacturing Data Engine and connect with existing MES/QMS.

**Accumulating competitive advantage.** Each resolved incident makes the "defect → cause → fix" library thicker. The more factories use it, the more accurate the diagnostic system becomes, and latecomer competitors find it very hard to catch up.
