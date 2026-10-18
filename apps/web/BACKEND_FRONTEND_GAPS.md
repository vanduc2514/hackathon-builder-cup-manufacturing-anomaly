# Dashboard ↔ Backend Gap Report

Compares the Plant Ops dashboard (`dashboard/src`) with the FastAPI backend (`backend/`).
Only the components the dashboard actually renders count as "in the frontend".

_Last updated: 2026-10-11 (round 4): every item in section 1a–1c is now consumed by the dashboard. No backend files changed; section 1d (data computed but never exposed) and section 2 are still open._

---

## ✅ What fits: connected and working

### Endpoints

| Endpoint | Dashboard usage | Data points used |
|---|---|---|
| `GET /api/incidents/current` | Initial load, refresh after inject/reset, and a stale-tab check before approving | Full `IncidentState` |
| `GET /api/incidents/stream` (falls back to `/events`) | Live updates over SSE; the event name `incident_update` matches | Full `IncidentState` |
| `GET /api/simulation/status` | Polled every 3 s in the Demo Controller | `status`, `active_scenario`, `mode`, `elapsed_seconds` |
| `POST /api/simulation/inject` | "Inject" button | Sends `scenario`, `mode`, `machine_id`, `tool_id`; uses `message`, `duration_seconds` |
| `POST /api/simulation/reset` | "Reset" button | Shows `message` |
| `POST /api/incidents/approve` | "Approve & Release Line" | Only enabled when `status == closed`. Uses `message`, checks `state.incident_id`, and shows the 409 `detail` in an error toast |

### `IncidentState` fields shown correctly

| Field | Shown in |
|---|---|
| `incident_id` | Breadcrumb, status bar, sidebar tabs, product card |
| `status` (all 12 values match the backend) | Status bar Andon lamp, step rail (steps 1–5), product card stage, Demo Controller text |
| `defect_type` | Incident title + archetype (via `friendlyDefectName()` / `resolveDefectArchetype()`, works for `scratch_vertical`, `short_fill`, `sink_mark`, `minor_burr`…), `defect_type: "…"` code chip, product card defect label |
| `defect_rate` | Step 1 "Defect Rate", product card defect % |
| `spc_ucl` | Step 1 "Upper Control Limit", product card UCL |
| `suspect_machine`, `suspect_tool` | Header "traced to …", the fault station in the genealogy route, sensor section title |
| `verification_count`, `verification_target` | Status bar `n/50`, step 4 progress grid, product card "Verifying n/50" |
| `repair_done` | Step 4 Repair chip: EXECUTED / IN PROGRESS |
| `approved` | Step 5, status bar "Line released", product card back to normal |
| `findings[]` by agent, matched via `matchesAgentRole()` (`QA`, `TRA`, `PA`, `RCA`, `COPILOT`, `DOC`, `LEARN`) | **Now live.** Step 1 QA finding + confidence, step 2 TRA/PA finding, step 3 RCA evidence + confidence, step 4 Copilot finding + Scribe "8D Ready", step 5 Learning finding |
| `findings[].agent_name`, `confidence`, `citation`, `timestamp` | `AgentAttribution` footer on every step (unique keys, so multiple QA findings render correctly) |
| `findings[].phase` + `agent_name` | Used to split the QA **detection** finding (step 1) from the **Gatekeeper verification / reopening** findings (step 4, with verified/reopen badges) |
| `findings[].five_whys` | Step 3 5-Whys list (latest finding that has one); `Ev:` / `Ref:` only shown when present |
| `findings[].ishikawa` | Step 3 Ishikawa 6M grid (RCA finding, or the latest finding that has one) |
| `impact.scrap_avoided`, `cost_savings_usd`, `downtime_minutes`, `co2_kg` | Step 5 Impact tiles |
| `impact.scrap_avoided`, `cost_savings_usd`, `co2_kg` | Kaizen & Impact hero cards |
| `latest_telemetry.spindle_vibration`, `motor_current`, `spindle_temp` | Step 2 sensor legend values (only when `machine_id == suspect_machine`) |
| `updated_at` | Step 1 chart footer, step 4 "Updated …" |

### Type mirrors that match `backend/core/models.py`

`AgentFinding`, `FiveWhysStep`, `IshikawaFactor`, `CitationReference`, `RAGSearchResult`, `ImpactMetrics`, `ManufacturingBenchmark`, `ImpactCalculationRequest`, `MachineTelemetryPayload` (`dryer_dew_point` removed), `TelemetryAlert`, `TelemetryPoint`, `SensorBaseline`, `MultiMachineTelemetryResponse`, `DefectInjectionRequest`, `SimulationStatusResponse`, `IncidentState`, and the `IncidentStatus` values.

### Rules both sides agree on

| Rule | Backend | Dashboard |
|---|---|---|
| Closes only after 50 good parts | `verification_gate` | Step 5 is locked until `count >= target` |
| Approval only on a closed incident | `orchestrator.approve()` returns 409 otherwise | Approve button is disabled unless `status == closed`; the demo incident can't be approved |
| Workflow order | `investigating` = Process Analyst, `analyzing` = Root Cause, Learning runs on close **before** sign-off | `PHASE_SCRIPT` and the step 5 placeholder now say the same |
| Relative API URLs only | Vite proxy `/api` → `:8000` | No hardcoded hostnames |
| Scenario defaults | `cnc_tool_wear` → CNC-02/T07, `im_damp_material` → IM-05/MOLD-03 | Same values on the scenario cards |

---

## 0. Bugs: status of the previous list

| # | Problem | Status | Still open |
|---|---|---|---|
| 1 | Findings looked up by `quality_inspector`… while the backend sends `QA`, `TRA`, `PA`, `RCA`, `COPILOT`, `DOC`, `LEARN` | ✅ **Fixed** (`AGENT_ROLE_MAP` + `matchesAgentRole()`, also in `agentIcon`) | — |
| 2 | `dryer_dew_point` in the dashboard type but not in the backend model | ✅ **Fixed** (removed from `types/index.ts`) | `ProductionLine.tsx` (not rendered) still reads it with a cast. The backend still doesn't send dew point, so scenario 2 has no dryer telemetry on the dashboard |
| 3 | `SimulationStatusResponse.total_seconds` is never set by the backend | 🟡 **Worked around** (uses `duration_seconds` from the inject response) | The backend still returns `total_seconds = null`. After a page reload, or for runs started elsewhere, it falls back to the hardcoded 8 s / 90 s |
| 4 | Approve could hit a different incident (the backend ignores `incident_id`) | 🟡 **Guarded on the dashboard** (checks `/current` first, then checks `state.incident_id` in the response) | `POST /api/incidents/approve` still ignores the body, so a small race window remains. A proper fix needs the backend to accept and check `incident_id` |
| 5 | Ishikawa "causal" colouring was a guess (first 2 categories) | 🟡 **Improved** (`isIshikawaCategoryCausal()` keyword heuristic on the text + RCA finding) | Still a guess. The backend sends `Dict[str, List[str]]` with no causal flag. The `IshikawaFactor.is_causal` model exists but isn't used in `RootCauseFindingDraft` |
| 6 | Status text said the wrong agent per status / Learning "after sign-off" | ✅ **Fixed** | — |
| 7 | `Ev: undefined` / `Ref: undefined` in the 5-Whys list | ✅ **Fixed** (rendered only when present) | — |
| 8 | `DEFECT_ARCHETYPE` keys are `scratch`, `dent`, `porosity`, `burr`. The backend sends `scratch_vertical`, `short_fill`, `sink_mark`, `minor_burr` | ✅ **Fixed** (`DEFECT_ARCHETYPE` + `DEFECT_FRIENDLY_NAME` mappings + `friendlyDefectName()` & `resolveDefectArchetype()`) | — |
| 9 | Finding `timestamp` and `updated_at` are `HH:MM:SS` only | ✅ **Fixed on the dashboard** (`computeIncidentDuration()` parses `HH:MM:SS` and handles midnight wrap, so no more `NaN`; `formatIncidentDate()` formats real dates) | The backend still sends no date, so for live incidents the date shown is the **browser's today**, not when the incident happened. A proper fix needs ISO timestamps or an `opened_at` field in the backend |
| 10 | Post-repair results from Quality Inspector Gatekeeper (`Phase C - Verification`) hidden | ✅ **Fixed** (separated `qiDetection` from `qiVerificationFindings`; Step 4 renders all verification/reopening findings + attribution) | Minor: the verification findings are also listed in step 1 (Inspection) and its footer, so they appear twice |

---

## 1. In the backend, missing from the dashboard

_Round 4: sections 1a–1c are now wired into the dashboard (frontend only, no backend change). Only the Gemini Live WebSocket and section 1d remain._

### Round 4 changes at a glance

- **What-If calculator:** the client-only "defective share" slider was removed. The backend computes scrap as `earlier_detection_minutes × line_speed_parts_per_min` and has no defect-share input, so the dashboard no longer invents one. Presets, sliders and results now come from `/api/impact/benchmarks` and `/api/impact/calculate`.
- **Kaizen & Impact feed:** the 3 hardcoded items (8D #8D-2026-104, UCL auto-tune for T07, SOP-CNC-402) were replaced with real Learning / Scribe findings and the SOP proposal.
- **Hardcoded fallbacks:** `$42,850`, `340` parts and `1240` kg CO₂ were removed. With no `impact` the page shows "—" and "Awaiting incident close".
- **Badges:** "Shift A" and "ESG Goal" were removed from the Kaizen page and replaced by the real `factory_type`.

### 1a. Endpoints

| Endpoint | Status | Where it is used |
|---|---|---|
| `GET /api/telemetry/history` | ✅ Done | Incident step 2 `SensorHistoryChart`: real series for the suspect machine, baseline, warning thresholds, onset marker, anomalous-sample count, control machines, `source`, `time_window` (polled every 5 s while the incident is open) |
| `GET /api/telemetry/baseline` | ✅ Done | Demo Controller → "Backend services" (`description`) |
| `GET /api/impact/benchmarks` | ✅ Done | Kaizen & Impact: benchmark table, real MTTR / manual vs AI diagnosis (replaces the hardcoded "18 min / -92.8% / 4.2 h"), What-If presets |
| `POST /api/impact/calculate` | ✅ Done | `WhatIfCalculator` is mounted on Kaizen & Impact and calls this endpoint (the client-only "defective share" slider was removed because the backend does not model it) |
| `GET /api/gemini-live/status` | ✅ Done | Step 4 `GeminiLiveCard` + Demo Controller |
| `GET /api/gemini-live/sessions` | ✅ Done | Step 4 `GeminiLiveCard` (replaces the fake still image): ids, status, message counters, created/last active |
| `POST /api/gemini-live/session`, `WS /api/gemini-live/ws` | ⛔ Not for the dashboard | Technician voice/camera stream belongs to the mobile app |
| `GET /health` | ✅ Done | Demo Controller → "Backend services" (needs the `/health` Vite proxy entry, added to `vite.config.ts`) |

### 1b. `IncidentState` fields

| Field | Status | Where it is shown |
|---|---|---|
| `documents.work_order` / `report_8d` / `sop_proposal` | ✅ Done | Step 4 `DocumentsPanel` (tabs, copy, download .md); SOP proposal also in the Kaizen loop feed |
| `status_reason` | ✅ Done | `StatusReasonBanner` for escalated / error / dismissed |
| `telemetry_alerts[]` | ✅ Done | Step 2 `TelemetryAlertsPanel` |
| `latest_telemetry` extras | ✅ Done | Step 2 `LiveTelemetryStrip`: `operating_status`, `rpm`, `anomaly_score`, `tool_id`, `timestamp` |
| `root_cause` | ✅ Done | Step 3 "Confirmed root cause" banner |
| `impact.downtime_minutes` | ✅ Done | Kaizen & Impact hero card (the hardcoded "18 min" is gone) |
| `impact.energy_kwh`, `energy_co2_kg`, `material_co2_kg`, `factory_type` | ✅ Done | Step 5 impact tiles and Kaizen hero cards |
| `findings[].phase` | ✅ Done | Phase chip in `AgentAttribution` |

### 1c. Other response fields

| Endpoint | Status | Where it is shown |
|---|---|---|
| `POST /api/simulation/inject` | ✅ Done | Demo Controller "Last injection": `status`, `scenario`, `mode`, `defect_type`, `target_machine/tool`, `burst_telemetry` |
| `POST /api/simulation/reset` | ✅ Done | Demo Controller "Last reset": `state`, `bigquery` |
| `GET /api/simulation/status` | ✅ Done | Running label shows `target_machine/target_tool` |

### 1d. Computed in the backend but not exposed by any endpoint

These are calculated inside the agents, and only their text summary reaches the dashboard (through `findings[].finding/evidence`):

- **SPC:** `SpcEvaluationResult` → `sample_size`, `defect_count`, `limits{centerline, ucl, lcl, sigma}`, `breach_direction`, `violations[]{rule_id, rule_name, description, violation_indices}`
- **Inspection:** `QualityInspectionReport` → `defect_type_counts`, `defect_frames[]{product_id, camera_id, lot_id, confidence, bounding_box, image_token, cavity_id, …}`
- **Traceability:** `TraceabilityTopologyResponse` → `suspects[]{machine_id, tool_id, correlation_score, defect_count, total_parts}`, `excluded_factors`, `factor_distributions[]{factor_type, factor_value, defect_ratio, is_anomalous}`
- **Sensor window:** `SensorTelemetryWindowResponse` → `metrics{min/max/avg/std_vibration, avg_temperature, avg_current, sample_count}`, `anomaly_detected`
- **RCA:** `RootCauseFindingDraft.diagnostic_request` (the field-evidence request shown during `awaiting_evidence`)
- **Ishikawa causal flag:** `IshikawaFactor.is_causal` / `detail` (model exists; RCA output uses a plain dict)
- **Copilot:** `CopilotSessionTelemetry` → `checkpoints_total/passed`, `verified_metrics`, `hallucination_refusals`, `transcript[]`
- **Edge:** `EdgeFilterStatistics` → `drop_ratio`, `cloud_bandwidth_reduction_pct`, `estimated_bandwidth_saved_mb`
- **Structured docs** (models exist, but the Scribe returns plain strings): `EightDReport` (D1–D8), `WorkOrder` (`parts_required`, `priority`, `status`), `SOPRevisionProposal`, `KnowledgeBaseEntry`, `RepairVideoAnalysis`

---

## 2. In the dashboard, missing from the backend (hardcoded or fake)

### Products page

| Data point | Hardcoded value | Backend has |
|---|---|---|
| Product list (Line-01 build order) | Engine Block, Cylinder Head, Gearbox Casing, Clutch Housing, Flywheel Housing | No product concept |
| Per-product defect rate | 1%, 1%, 0.42%, —, — | Only one `defect_rate` for the single current incident |
| Active product | `Gearbox Casing` (every live incident is attached to it) | No product field on `IncidentState` |
| Shift label | `• Shift A (Alpha Floor)` in the page header (new) | No shift data |
| Multiple concurrent incidents | Dashboard supports several tabs | Blackboard holds **one** incident; no history or list endpoint |

### Incident view (5 steps)

| Data point | Hardcoded value | Backend has |
|---|---|---|
| Nominal defect rate | `0.0044` | Not exposed (SPC `centerline` is internal) |
| SPC run chart, "last 60 parts" | Synthetic curve (`SpcRunChart` builds it from the peak, UCL and mean) | No per-part / per-sample series endpoint |
| Sensor history chart | Synthetic Gaussian curves (`SensorHistoryChart`) | `/api/telemetry/history` exists but **isn't called** |
| Genealogy route | RAW → CNC-01 (Op-10) → CNC-02 (Op-20) → CNC-03 (Op-30) | No route/station list (no IM-05 route for scenario 2) |
| Defect display names + archetypes | Dashboard-side mapping (`_BASE_DEFECT_FRIENDLY_NAME`, `_BASE_DEFECT_ARCHETYPE`) with keyword fallbacks | Backend sends raw keys only (`scratch_vertical`, `short_fill`, `sink_mark`, `minor_burr`); no display-name source. The mapping matches now, but any new backend defect type needs a dashboard update |
| EOL camera frame + bounding box | Static `/incident/cam-eol-frame.jpg`, fixed box position | `image_token` and `bounding_box` exist internally, not exposed |
| Camera / station names | `CAM-LINE01-EOL`, `Keyence CV-X480` | Only in internal frame packets |
| Gemini Live video tile | Static `/incident/ar-stream-frame.jpg` | No session/recording link on the incident |
| Gatekeeper / approver name | `Devon Vance` | No user or approver identity; `approve` records no who/when |
| Incident date | Browser's today (`formatIncidentDate` fallback for `HH:MM:SS`) | No date on `timestamp` / `updated_at`; no `created_at` / `opened_at` field |
| Ishikawa causal flags | Keyword heuristic (`isIshikawaCategoryCausal`) | No causal flag (see bug 5) |

### Kaizen & Impact page

| Data point | Hardcoded value | Backend has |
|---|---|---|
| Fallbacks when `impact` is null | ✅ **Removed (round 4).** The cards show "—" and "Awaiting incident close" until the backend sends `impact` | — |
| Detection/response time | ✅ **Removed (round 4).** MTTR now comes from `/api/impact/benchmarks` (`manual_diagnosis_minutes` vs `ai_diagnosis_minutes`) and `impact.downtime_minutes` | — |
| "Shift A", "ESG Goal" badges | ✅ **Removed (round 4).** Replaced by the real `impact.factory_type` badge and the real `energy_kwh` | — |
| Kaizen loop feed | ✅ **Replaced (round 4).** Now built from the Continuous Learning / Incident Scribe findings and `documents.sop_proposal` of the current incident; empty state until an incident closes | Still only the current incident. There is no learning-event or history endpoint, so past lessons are not listed |
| Cumulative / multi-incident totals | Implied by page | Only the current incident's `impact` |

### SOP Library & Tech Walkthroughs pages

| Data point | Hardcoded value | Backend has |
|---|---|---|
| 6 SOPs (code, title, category, tags, run time, adherence, cycles, cost saved…) | `lib/knowledge.ts` | No SOP endpoint (only RAG documents in `data/knowledge_base/`, no list API) |
| Walkthrough videos (id, title, asset, author, chapters, duration, badges) | `lib/knowledge.ts` | No endpoint (`RepairVideoAnalysis` model exists, unused) |
| SOP ↔ walkthrough links (`walkthroughId`) | Static | — |
| Buttons: Audit matrix, New procedure, Side links, Upload capture, Guidelines, Certificate, Request walkthrough | Show "not connected in this build" toasts | No endpoints |
| Search, watchlist, "Required Shift A" filter | Client-side only | — |

### App-wide

| Data point | Hardcoded value | Backend has |
|---|---|---|
| Logged-in user | `Devon Vance`, "Lead Plant Operator · Shift A" | No auth or user endpoint |
| Offline demo data | Removed in #171 (no fallback fake incidents/RCA) | Shown only when the backend is unreachable |
| Scenario cards | `cnc_tool_wear` → CNC-02/T07, `im_damp_material` → IM-05/MOLD-03 | Backend has the same defaults but no `GET` scenarios endpoint |
| Run duration fallback | 8 s / 90 s | `total_seconds` never set (see bug 3) |

---

## 3. Dashboard components that exist but aren't rendered

`AndonPhaseTracker`, `ImpactCard`, `IncidentStream`, `MachineCard`, `ProductionLine`, `RecoveryStreak`, `Report8DCard`, `RootCauseCard`, `SpcChart`. (`WhatIfCalculator` is now mounted on the Kaizen & Impact page.)

`RootCauseCard`, `ProductionLine` and `Report8DCard` have been updated but are still not mounted. Some of these already cover backend data from section 1. For example, `IncidentStream` shows all findings including verification ones, `Report8DCard` could show `documents.report_8d`, and `WhatIfCalculator` could use `/api/impact/*`.
