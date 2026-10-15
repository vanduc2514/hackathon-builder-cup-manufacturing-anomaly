# Technician App ↔ Backend Gap Report

Compares the technician mobile app (`apps/mobile/src`) with the FastAPI backend (`backend/`).

**Overall:** the live incident is its own work order at the top of the Work List (badge **Live**); the mock orders below it are badged **Demo** and never call the backend. The app reads the incident (SSE + snapshot), telemetry (`/api/telemetry/*`) and the Technician Copilot (`/api/gemini-live/*`), and writes back only through `POST /api/incidents/evidence`. The AI Helper, settings and the demo work orders are still local (`components/mobile/mobileData.ts`). Section 1 is resolved on the app side, except what needs a backend change (1c).

---

## ✅ What fits: connected and working

### Endpoints

| Endpoint | App usage | Where |
|---|---|---|
| `GET /api/incidents/current` | Snapshot on load and after every SSE reconnect | `hooks/useIncidentStream.ts` |
| `GET /api/incidents/stream` (alternates with `/events`) | Live updates, event `incident_update`; reconnect with backoff; state shown in the header (Live / Reconnecting / Offline) | `hooks/useIncidentStream.ts`, `MobileHeader.tsx` |
| `POST /api/incidents/evidence` (multipart `file`, `notes`) | Uploads the technician's real photo, only while `status == awaiting_evidence` | `MobileApp.tsx` `submitEvidence()` |
| `POST /api/incidents/handover` (`{"note": string}`) | Records technician shift handover note on the active incident | `MobileApp.tsx` `submitRepair()`, `MobileWorkStatus.tsx` `handleAddNote()` |
| `GET /api/telemetry/baseline` | Alert thresholds (`vibration_warning_threshold`, `current_warning_threshold`) and trend vs. baseline | `hooks/useTelemetry.ts` |
| `GET /api/telemetry/history?machine_id=` | Sensor tiles when `latest_telemetry` is null; vibration bars on the evidence screen | `hooks/useTelemetry.ts` |
| `GET /api/gemini-live/status` | Copilot availability, language (`default_language`), SIM/LIVE tag | `hooks/useGeminiLive.ts` |
| `POST /api/gemini-live/session` | Pre-allocates the session before opening the socket | `hooks/useGeminiLive.ts` |
| `WS /api/gemini-live/ws` | Live Fix copilot: sends one text turn per step, shows `input_transcription` / `output_transcription`, plays `audio_pcm_base64` (24 kHz PCM), handles `interrupted`, `turn_complete`, `resumption_handle` | `hooks/useGeminiLive.ts`, `MobileFixLive.tsx` |
| `GET /api/gemini-live/sessions` | On a dropped socket: resume the same session with the last `resumption_handle`, or create a new one | `hooks/useGeminiLive.ts` |

Vite proxies `/api` with `ws: true`, so the WebSocket goes through the same relative URL.

### `IncidentState` fields used (`buildLiveOrder()` in `mobileData.ts`)

| Field | Shown as |
|---|---|
| `incident_id` | Live work order id |
| `status` | Kind and stage, see the mapping below |
| `status_reason` | Escalation / dismissal notice, card and status screen |
| `defect_type`, `defect_rate`, `spc_ucl` | Title ("Investigate …"), defect-rate tile and its alert, priority (P1 when over UCL or escalated, else P2) |
| `suspect_machine`, `suspect_tool`, `root_cause` | Machine, suspect part, root cause, Fix title. Shown as "not identified yet" when null, no placeholder values |
| `latest_telemetry` | Vibration, motor current, spindle temp tiles (falls back to `/api/telemetry/history`; "No sensor data" when neither exists) |
| `telemetry_alerts[]` | One notification per new alert; "N sensor alerts" tile on the evidence screen |
| `diagnostic_request` | AI request text, evidence notification, guide card in the camera |
| `findings[]` | Confidence ring = latest `RCA` finding (`—` when none). "Why the AI flagged this" = RCA `finding`, `evidence`, `citation`, `five_whys`. Copilot repair finding and QA verification finding feed the processing notes |
| `visual_evidence` | "What the AI saw" card: `analysis`, `defect_detected`, `wear_measurement_mm`, `citation` |
| `repair_done` | Repair milestone, Live Fix finish text |
| `verification_count`, `verification_target` | Progress ring and bar (clamped at 100%) |
| `approved` | Completed stage and "Approved by" notification |
| `documents.work_order` | Scribe work order on the Repair brief |
| `documents.report_8d`, `documents.sop_proposal` | Collapsible reports on the status screen |
| `documents.approved_by` | Lead name when present (the backend never sets it today; falls back to profile `leadName`) |
| `impact` | Impact tiles (scrap, downtime, CO₂, savings) and the completed outcome |
| `updated_at` | Processing / completed time |

Status → work order mapping:

| Backend status | Kind / stage | Notes |
|---|---|---|
| `detecting`, `tracing`, `investigating`, `analyzing` | evidence / active | Card says "AI analysing"; submit disabled |
| `awaiting_evidence` | evidence / active | "Needs evidence"; the only status where upload is allowed |
| `repairing` | fix / active | Repair brief + Live Fix |
| `verifying` | fix / processing | "Verifying parts" |
| `closed`, `approved = false` | fix / processing | Parts verified, waiting for lead sign-off |
| `closed`, `approved = true` | fix / completed | |
| `escalated`, `error` | processing | Kind follows `repair_done`; red "Escalated" |
| `dismissed` | evidence / completed | |
| `normal` | no live order | |

### Type mirrors

`src/types/index.ts` mirrors `backend/core/models.py`, now including `VisualEvidencePayload`, `IncidentDocuments`, `EvidenceUploadResponse`, the telemetry baseline response, the Gemini Live status / session / server message models and `RepairCheckpoint`. Known near-miss: `SimulationStatusResponse.total_seconds` is never set by the backend.

### Rules both sides agree on

| Rule | Backend | App |
|---|---|---|
| Closes only after the verification target | `verification_gate` | Status screen: "N more good parts in a row before your lead can approve" |
| Lead (shift leader) approves, not the technician | `POST /api/incidents/approve` | No approve button; `closed` without `approved` stays in Processing |
| Relative API URLs only | Vite proxy `/api` → `:8000` (HTTP, SSE, WS) | No hardcoded hostnames |
| Copilot language | `gemini_live_language = "vi-VN"` | Taken from `/api/gemini-live/status` |
| Technician input enters through the API | `POST /api/incidents/evidence` → `blackboard.attach_field_evidence()` | Only the evidence upload writes; repair completion is left to the workflow |
| Evidence resets the workflow status | `attach_field_evidence()` always sets `status = analyzing` | Upload only while `awaiting_evidence`; never post repair results to the evidence endpoint |
| Image frames on the copilot socket count as evidence | `WS /api/gemini-live/ws` runs `attach_field_evidence()` on image frames | Live Fix sends text turns only; the camera stays local |

---

## 1. In the backend, missing from the app

### 1a. Endpoints

All technician-relevant endpoints are now called (see the table at the top). Still not called, on purpose:

| Endpoint | Why not |
|---|---|
| `POST /api/gemini-live/evidence` | Same handler as `/api/incidents/evidence`; the app uses the incident one |
| `GET /api/simulation/status`, `POST /inject`, `POST /reset` | Demo controls; the plant dashboard covers them |
| `POST /api/incidents/approve`, `/api/impact/*`, `/health` | Lead and dashboard functions |

### 1b. `IncidentState` fields

All fields are now shown (see the field table at the top).

### 1c. Computed in the backend but not exposed by any endpoint (needs a backend change)

- **Repair checkpoints:** Resolved via `GET /api/copilot/manuals/{machine_id}` (`OemRepairManual` + `RepairCheckpoint[]`). Dynamically loaded by `useOemManual`.
- **Copilot session:** `CopilotSessionTelemetry` (`checkpoints_passed`, `verified_metrics`, `transcript[]`, …).
- **Field-evidence checklist:** only the `diagnostic_request` string is exposed, so the live order asks for one photo.
- **Structured work order:** the `WorkOrder` model (`parts_required`, `priority`); the Scribe returns plain text, shown as-is.
- **RAG citations:** `RAGSearchResult` / `CitationReference` for the AI Helper.
- **Repair video:** `RepairVideoAnalysis`.

Testing note: with `AI_PROVIDER=mock` the RCA confidence is always ≥ 0.88, so the workflow never enters `awaiting_evidence` and the upload path cannot be reached from the simulator. It was checked with hand-built snapshots and a direct upload.

---

## 2. In the app, missing from the backend (hardcoded or fake)

### Work List (`INITIAL_WORK_ORDERS`)

| Data point | Hardcoded value | Backend has |
|---|---|---|
| Multiple work orders | Demo orders `INC-8924`, `8919`, `8927`, `8916`, `8902`, `8898`, `8890` (badged Demo); the live incident is added on top | One incident at a time; no list or history endpoint |
| Work order fields | Live: `location` (lookup table by machine) and `image` (stock photo) are still front-end only; priority is derived. Demo orders: everything | No per-technician work order; `WorkOrder.priority` model unused |
| Sensor tiles | Live: vibration, motor current, spindle temp, defect rate from the backend. Demo only: Runout, Coolant, Tool temp | No runout, coolant or tool temp sensors; no temperature threshold |
| Parts needed | Live: parts named in the OEM checkpoints (copy). Demo: fixed lists | `WorkOrder.parts_required` model only, not exposed |
| Machine names | `CNC Mill 04`, `CNC Lathe 02`, `Haas ST-10`, … in the mock orders | Backend uses `CNC-01/02/03`, `IM-05` |
| Completed outcome | Live: `n/target parts passed · Approved by <lead>`. Mock orders: fixed text | No approver name or close history |

### Evidence capture

| Data point | Hardcoded value | Backend has |
|---|---|---|
| Evidence checklist | Live: one photo for the `diagnostic_request` with generic camera tips. Demo: `e1`–`e5` | No evidence-request list (only the `diagnostic_request` string) |
| Photo/video capture | Real camera (`getUserMedia`) or file picker; video mode keeps a still frame | Upload endpoint takes one image |
| Submit evidence | Posts the photo while `awaiting_evidence` | Endpoint always sets the finding confidence to `0.92` and the status to `analyzing`, whatever the current status |

### Live Fix (repair)

| Data point | Hardcoded value | Backend has |
|---|---|---|
| Repair steps | Dynamically loaded via `useOemManual` hook | `GET /api/copilot/manuals/{machine_id}` returns `OemRepairManual` with `RepairCheckpoint[]` |
| Step verification | Confirmed by the technician (no auto-verify) | Copilot `validate_metric_measurement()` exists but isn't exposed |
| Copilot voice/camera | Live: `WS /api/gemini-live/ws` text turns + audio; camera stays local. Demo: scripted lines | The socket has no microphone transcription path the app can use yet (audio chunks are answered with a fixed probe) |
| Submit repair + handover note | Live: repair completion handled by copilot workflow; handover note posted to `POST /api/incidents/handover` | `POST /api/incidents/handover` records note via Orchestrator onto Blackboard & Firestore |

### Status / Processing

| Data point | Hardcoded value | Backend has |
|---|---|---|
| `processing.submittedAt`, `aiNote` | Live: `updated_at` and the latest copilot / QA finding. Demo: local | — |
| `processing.lead` | Profile `leadName` or `Shift Leader`; `documents.approved_by` when present | No approver identity before approval |
| "Remind lead" button | Toast only | No notify endpoint |


### Notifications

| Data point | Hardcoded value | Backend has |
|---|---|---|
| Notification list | Demo items (`n1`–`n5`), plus live ones from status changes, approval and `telemetry_alerts` | No notification or push endpoint |

### Settings / profile

| Data point | Hardcoded value | Backend has |
|---|---|---|
| Technician profile | `TECH-0427`, role, phone, email, `Shift A · 06:00–14:00`, `Bay 4`, `leadName` | Only the role comes from the login session; no user profile endpoint |
| Preferences | `language`, `voiceGuidance`, `pushAlerts`, `haptics` | Not saved anywhere (local state only) |

---

## 3. Missing on both sides (needed for the technician flow)

Technician evidence and handover notes now have endpoints. The rest of the technician flow still has none:

| Missing | Needed for |
|---|---|
| `POST` repair step / checkpoint result | Live Fix step verification |
| `POST` repair complete | Letting the technician, not the workflow, mark the repair done (`record_resolution()` sets `repair_done` by itself) |
| `GET` repair checkpoints for the incident | Live Fix steps |
| `GET` technician work orders / incident history | Work List tabs (Active / Processing / Completed) |
| `GET` structured evidence request (items + guidance) | Evidence checklist instead of fixed `e1`–`e5` |
| `POST` chat question → RAG answer + citation | AI Helper |
