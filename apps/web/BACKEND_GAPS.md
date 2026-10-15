# Backend Gaps for the Plant Ops Dashboard

What the dashboard (`dashboard_frontend/`) needs from the backend that doesn't exist yet, and what the frontend fakes or estimates in the meantime.

_Checked against `backend/` on 2026-10-14. This replaces section 2 ("missing from the backend") of `BACKEND_FRONTEND_GAPS.md`, which is out of date in places (it says `/api/telemetry/history` isn't called, and it describes components that have since been removed)._

**Priority:** **P1** means the number on screen is a frontend estimate, so a judge or operator could be shown something wrong. **P2** means it works but breaks on reload or with real data. **P3** is nice to have.

---

## Summary

| # | Gap | Priority | Frontend workaround today |
|---|---|---|---|
| 1 | No OEE data (availability, performance, quality, losses) | P1 | Schemas in `backend/core/models.py`; UI displays "Modeled Estimate" badges; modelled in `src/lib/oee.ts` |
| 2 | `/api/telemetry/history` hardcodes the onset and window, has no relative range, and holds 1 h of seed data | P1 | Client-side range filter (15m / 30m / 1h / All) over whatever is loaded |
| 3 | No line / station registry | P2 | `FLEET_REGISTRY` and line constants hardcoded in `src/lib/fleet.ts` |
| 4 | Incident metadata (opened_at, severity, line, product, mttr_target) | Resolved (P2) | `opened_at`, `severity`, `line_id`, `product`, `mttr_target_minutes` added to `backend/core/models.py` & workflow nodes; SLA timer persists across reloads |
| 5 | No incident history or ESG ledger | P2 | ESG ledger stored in browser `localStorage` |
| 6 | Only one incident at a time; no list endpoint | P2 | Dashboard supports several tabs but only ever gets one |
| 7 | `POST /api/incidents/approve` ignores which incident is approved | P2 | Dashboard re-checks `/current` before approving |
| 8 | No per-sample SPC series or SPC centerline | P2 | SPC run chart on the incident page is synthetic |
| 9 | `SimulationStatusResponse.total_seconds` is never set | P3 | Falls back to the inject response, then hardcoded 8 s / 90 s |
| 10 | Ishikawa output has no causal flag | P3 | Keyword heuristic |
| 11 | No users / auth / shift schedule | P3 | "John Tran, Shift Leader" hardcoded; shift derived from the clock |
| 12 | No SOP, walkthrough or scenario list endpoints | P3 | Static data in `src/lib/knowledge.ts` and the Demo Controller |

---

## 1. OEE data (P1)

The Line Overview now leads with OEE: a headline value, Availability / Performance / Quality, a trend per line or machine, and a "Where OEE Is Lost" breakdown. **The backend has no OEE concept**, so all of it is estimated in `src/lib/oee.ts` and `computeOee()` in `src/lib/fleet.ts`.

### What the frontend assumes today

| Factor | Current estimate | Why it's wrong |
|---|---|---|
| Availability | Constant `PLANNED_AVAILABILITY = 0.92`. A machine counts as 0% while the incident `status == "repairing"` | No run / idle / down state log, so real stops are invisible |
| Performance | Latest spindle RPM ÷ that machine's median RPM | RPM isn't throughput. Needs ideal cycle time and part counts |
| Quality | `1 − incident.defect_rate`, charged entirely to `incident.suspect_machine` | Only one line-level defect rate exists; healthy machines always show 100% |
| Quality history | Straight line from `anomaly_onset_time` to the current defect rate | No per-interval good / scrap counts |
| Loss split | `1 − OEE = (1 − A) + A(1 − P) + AP(1 − Q)`, with planned stops fixed at 8 pts | No downtime reasons (planned vs unplanned) |
| Target | `OEE_TARGET = 0.85` | No configured target per line |

### What's needed

Source data, ideally from the simulator into BigQuery (the simulator already generates machine and conveyor packets):

- **Machine state events:** `machine_id`, `state` (`running | idle | down | planned_stop`), `reason`, `start`, `end`.
- **Part counts:** `machine_id`, interval, `total_parts`, `good_parts` (EOL inspection already serialises parts, so scrap can be attributed back to the station through traceability).
- **Ideal cycle time** per machine and operation.
- **Planned production time** per shift, and the OEE target per line.

Proposed endpoint, with the models added to `backend/core/models.py`:

```
GET /api/oee?line_id=cell-line-1&start_time=…&end_time=…&bucket_minutes=2
```

```python
class OeeFactors(BaseModel):
    availability: float          # 0..1
    performance: float           # 0..1
    quality: float               # 0..1
    oee: float                   # A × P × Q

class OeePoint(OeeFactors):
    timestamp: str               # ISO 8601, bucket end

class OeeLoss(BaseModel):
    kind: Literal["planned_stop", "unplanned_downtime", "speed", "quality"]
    points: float                # OEE points lost, 0..1
    machine_id: Optional[str]
    reason: Optional[str]        # e.g. "CNC-02 stopped for repair"
    incident_id: Optional[str]

class MachineOee(OeeFactors):
    machine_id: str
    good_parts: int
    total_parts: int
    series: List[OeePoint]

class LineOeeResponse(OeeFactors):
    line_id: str
    target: float
    series: List[OeePoint]
    machines: List[MachineOee]
    losses: List[OeeLoss]        # must sum to 1 − oee
```

> **Implemented:** The Pydantic models above (`OeeFactors`, `OeePoint`, `OeeLoss`, `MachineOee`, `LineOeeResponse`) are defined in `backend/core/models.py`. UI components (`OeeTrendCard`, `OeeLossCard`) display visible "Modeled Estimate" and "Modeled Loss Attribution" chips so operators and judges understand the distinction from raw sensor feeds.


With this endpoint, the frontend deletes `machineOee`, `oeeTrend`, `oeeLosses` and `computeOee` and renders the response directly.

---

## 2. `GET /api/telemetry/history` (P1)

`backend/api/routes_telemetry.py`:

- **`anomaly_onset_time` is hardcoded** to `"2026-10-05T09:30:00Z"` and **`time_window` to `"09:00-10:00"`**, even when `source == "bigquery"`. The red "DEFECT ONSET" band on the OEE chart and the sensor chart is drawn from this value, so with live data it points at the wrong time. Derive it from the first anomalous sample or the incident.
- **No relative range.** The dashboard's time picker (15m / 30m / 1h / All) can only filter what one call returns. Add `minutes=` (or `since=`) so the backend returns the last N minutes, and `bucket_seconds=` for server-side downsampling when the range grows to a shift or a day.
- **Seed data covers one hour.** Shift or 24 h ranges would come back empty, which is why the picker stops at 1 h.
- **`start_time` / `end_time` filter by string comparison** (`str(p["timestamp"]) >= start_time`). This breaks on mixed formats or timezone offsets. Parse to `datetime`.
- **The mock buffer is mixed with the canonical seed.** In-memory simulator points (today's timestamps) are appended to seed points dated 2026-10-05, so one series can span two days with a gap. Pick one source per response.
- `spindle_speed_rpm` defaults to `12000` when missing. The performance estimate treats that as a real reading.

---

## 3. Line and station registry (P2)

Hardcoded in `src/lib/fleet.ts` and `src/lib/incident.ts`:

| Constant | Value | Used for |
|---|---|---|
| `LINE_NAME` / `LINE_LABEL` | `Cell Line 1` / `Cell Line 1: Turning & Milling` | Titles, dropdown, export |
| `FLEET_REGISTRY` | CNC-01 Bay 2 Op-10 Rough turn · CNC-02 Bay 4 Op-20 Face mill · CNC-03 Bay 5 Op-30 Drill & tap | Station order, bay, operation in the table, dropdown and incident genealogy route |
| `ACTIVE_PRODUCT` | `Gearbox Casing` | Part model column, every incident |
| `RATED_SPINDLE_CURRENT_A` | `25` | "Spindle Load %" = current ÷ 25 A |

Needed: `GET /api/lines/{line_id}` returning the line name, the product currently running, and the ordered stations (`machine_id`, `bay`, `operation`, `sequence`, `rated_current_a`, `ideal_cycle_time_s`). This also fixes the `IM-05` route for the `im_damp_material` scenario, which has no station list today.

---

## 4. Incident metadata (Resolved)

`IncidentState` in `backend/core/models.py` now includes all required tracking fields:

| Field | Description / Binding | Resolution Status |
|---|---|---|
| `opened_at` (ISO 8601 UTC) | Persisted incident start timestamp emitted by `workflow_nodes.open_incident` | Wired in `App.tsx` so the SLA countdown persists across browser reloads |
| `severity` | Severity level: `low`, `medium`, `high`, `critical` | Sourced from `DefectInjectionRequest.severity` and prioritized in `fleet.ts:incidentSeverity` |
| `line_id` | Production line identifier (default: `"cell-line-1"`) | Added to `IncidentState` model & TypeScript interface |
| `product` | Part name (default: `"Gearbox Casing"`) | Added to `IncidentState` model & TypeScript interface |
| `mttr_target_minutes` | Target MTTR in minutes (default: `15`) | Used dynamically in `ActiveIncidentsCard.tsx` SLA target calculation |

---

## 5. Incident history and ESG ledger (P2)

The CO₂e KPI sums `impact` over every approved incident. The backend only exposes the current incident, so `App.tsx` keeps its own ledger in `localStorage` (`kaizen.esgLedger.v1`). Different browsers show different totals, and clearing site data resets them.

Needed: `GET /api/incidents?status=approved` (or `GET /api/impact/ledger`) returning past incidents with `impact` and approval time. `core/firestore_adapter.py` already orders by `updated_at`, so the storage side partly exists.

---

## 6. One incident at a time (P2)

The Blackboard holds a single incident and `/api/incidents/current` is the only read endpoint. The dashboard supports several incident tabs and an "Anomaly / Nominal / All" fleet filter, but there can never be more than one open incident. Needed: a list endpoint (`GET /api/incidents?open=true`) and SSE events that carry `incident_id`.

---

## 7. Approval doesn't say which incident (P2)

`POST /api/incidents/approve` takes no body and approves whatever is current. If a new incident replaces the closed one between the shift leader's click and the request, the wrong incident is approved. The dashboard re-checks `/current` first, but a small race window remains. Accept `{ "incident_id": … }` and return 409 on a mismatch. Recording `approved_by` and `approved_at` would also remove the hardcoded approver name.

---

## 8. SPC series (P2)

The incident page's SPC run chart (`components/incident/SpcRunChart.tsx`) builds a **synthetic** 60-part curve from the peak, UCL and a noise function. The backend computes `SpcEvaluationResult` (`sample_size`, `defect_count`, `limits{centerline, ucl, lcl, sigma}`, `violations[]`) inside the Quality Inspector, but no endpoint returns it. Needed: the per-sample defect-rate series plus `centerline` and `lcl`, either on the incident or via `GET /api/spc?line_id=…`.

---

## 9–12. Smaller gaps (P3)

- **`total_seconds`:** declared on `SimulationStatusResponse` (`models.py`) and never set in `routes_simulation.py`. After a reload the Demo Controller's progress falls back to hardcoded durations.
- **Ishikawa causal flag:** RCA output is `Dict[str, List[str]]`. The `IshikawaFactor` model (`is_causal`, `detail`) exists but isn't used, so the dashboard highlights causal categories by keyword matching.
- **Users and shifts:** no auth or user endpoint. The sidebar shows a hardcoded "John Tran, Shift Leader", and the shift (A / B / C) is derived from the browser clock with fixed 06 / 14 / 22 h boundaries.
- **Knowledge pages and scenarios:** no endpoints for SOPs, tech walkthroughs or simulation scenarios. SOPs and walkthroughs are static in `src/lib/knowledge.ts`; scenario cards duplicate the backend defaults (`cnc_tool_wear` → CNC-02 / T07, `im_damp_material` → IM-05 / MOLD-03).
- **Images:** the end-of-line camera frame on the incident page is a static file (`public/incident/cam-eol-frame.jpg`). `image_token` and `bounding_box` exist on inspection frames (`core/models.py`, edge gateway) but no endpoint serves them.

---

## Already connected (no action)

`GET /api/incidents/current`, `GET /api/incidents/stream` (SSE `incident_update`), `GET /api/telemetry/history`, `GET /api/telemetry/baseline`, `GET /api/impact/benchmarks`, `POST /api/impact/calculate`, `GET /api/simulation/status`, `POST /api/simulation/inject`, `POST /api/simulation/reset`, `POST /api/incidents/approve`, `GET /api/gemini-live/status`, `GET /api/gemini-live/sessions`, `GET /health`.
