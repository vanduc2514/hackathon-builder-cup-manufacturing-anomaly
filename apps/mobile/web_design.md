# Web Design — Incident Dashboard

**Header controls (demo only: built in the frontend, no backend support)**
Top right has three buttons: Auto / Manual / Settings.
- **Manual:** the Lead Plant Ops must accept each step before the next one is shown.
- **Auto:** all steps run automatically up to the Approve & Release line, which ends the whole process.
- **Settings:** a pop-up where the Lead Plant Ops chooses Manual or Auto for each step.

For the demo, the backend always runs in Auto. In Manual mode, the frontend holds back the next step's section until the user clicks Accept.

**Factory dashboard and incident log (demo only: built in the frontend)**
The factory dashboard shows the current incident card, using its ID from the incident stream (`/api/incidents/stream`). The backend holds one incident at a time, so the incident list and the incident log are kept in frontend state for the demo.

**Incident detail screen**
Clicking the incident opens "Spindle Anomaly & Defect Spike". Everything is on one screen, split into one section per step.

The right sidebar shows the steps as numbers 1, 2, 3, 4. Hovering a number shows the step name, and clicking it scrolls to that section. The active step follows the incident status:

| Step | Backend phase | Incident status |
|---|---|---|
| 1. Inspection | Phase A – Detection | `detecting` |
| 2. Traceability | Phase B – Tracing + Sensor Analysis | `tracing`, `investigating` |
| 3. Analysis | Phase B – Root Cause (+ Field Evidence) | `analyzing`, `awaiting_evidence` |
| 4. Work Order | Phase C – Resolution + Verification | `repairing`, `verifying` |
| Approve & Release | Continuous Learning | `closed` |

**1. Inspection**
Inspection looks at the END PRODUCT only (end-of-line camera), never at each machine's output on the line.
- **Shows now:** defect category (`defect_type`), defect rate against the control limit (UCL), and the Quality Inspector finding with its evidence and confidence %.
- **Need backend to support:** add the inspected defect frames to the incident state, each with the product image, the defect's location on the part (bounding box) and a severity level.

**2. Traceability**
- **Shows now:** the Traceability Agent finding with evidence and confidence %, the suspect machine and tool, the Process Analyst sensor finding, and the sensor chart for the incident time window (`/api/telemetry/history`).
- **Need backend to support:** add the full ranked list of suspects (machine, tool, correlation score, defect count) to the incident state, top to bottom, instead of only the top suspect and a text finding.

**3. Analysis**
- **5 Whys:** a linear chain of 5 levels. Each level shows the why, the answer, and its evidence and citation if present.
- **Ishikawa fishbone:** the 6M categories (Machine, Method, Material, Man, Measurement, Milieu), each listing its factors.
- **Root cause:** the root-cause text with a single confidence % for the whole finding, plus evidence and citation.
- **Field evidence branch:** if confidence is below 70%, the backend asks the technician for field evidence (status `awaiting_evidence`). Show a "Field evidence requested" block inside step 3 with the Technician Copilot's field-evidence finding. The analysis then reruns with an updated confidence. After 2 rounds still below 70%, the incident is escalated.

**4. Work Order**
After step 3, show the issued work order (`documents.work_order`), the 8D report and the SOP proposal, plus the Technician Copilot's repair finding.
- **Need backend to support:** a structured work order with an assigned specialist, the specialist's live repair progress from their Gemini Live session, and an uploaded repair video linked to the incident.
- **Verification:** after the repair, show a progress bar `verification_count / verification_target`. That's 50 good end products in a row on the end-of-line camera.
- **Failed verification:** the incident goes back to step 2. The sidebar shows step 2 active again with a "Reopened" badge.

**Approve & Release**
- The Approve button is enabled only when the status is `closed` and the incident isn't approved yet. That only happens after verification passes, not right after the technician finishes.
- Clicking it calls `POST /api/incidents/approve`, which marks the incident approved and ends the process.
- Next to it, show the Continuous Learning finding and the impact card.
- After approval, the incident moves to the "Incident log" (demo) so it can be checked again later.

**Other end states**
- `dismissed` (no defect spike found): show the reason, no approve button.
- `escalated`: red banner with `status_reason`, no approve button.
- `error`: error banner.
