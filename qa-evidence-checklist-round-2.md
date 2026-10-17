# Kaizen Round-2 Evidence-Capture Checklist (2026-10-18 04:14 ICT)

> **Source artefacts (no duplicate content, only references):**
> - TL canonical operator runbook: `<tl-workspace>/round-2-operator-runbook.md`
>   (originally posted as the **TL Round-2 kickoff comment on epic #75, comment id 6241185050**).
> - PM baseline dispatch: `<pm-workspace>/briefs/2026-10-18_0412_round1_kickoff_dispatch.md`
>   (gap matrix on epic #75 comment 6241132922; baseline list on #75 comment 6241131518).
> - Storyboard (60–90 s demo pacing + Invariant #3 reference):
>   `docs/wireframes/05_demo_storyboard_90s.md` (beats 1–6).
> - DESIGN.md tokens / Tone / Single JTBD: `docs/DESIGN.md` (Lumina Slate, light).
> - Round-1 verdict: `<tl-workspace>/round-1/tl-verdict.md` (PASS overall; Cloud-parity gated on user).
>
> **Scope of this file:** a single, cross-referenced evidence-capture checklist for Round-2
> live verification of `factory → web ↔ mobile`. It merges
> (a) the PM baseline, (b) the Designer-added items,
> (c) the StreakGate 50/50 timestamp trio, (d) the StepRail 5-state trio,
> and (e) the AnomalyBanner live-copy `Open {incident_id}` expectation.
> Items are tagged **READY-NOW**, **USER-GATED**, or **PRE-DEV**.
> Execution of any USER-GATED item is held until PM pings back with user approval.

---

## 0. Live Infra Snapshot (captured at 04:08 ICT 2026-10-18, Asia/Saigon)

| Surface                         | URL                                                  | State                                                                  |
|---------------------------------|------------------------------------------------------|------------------------------------------------------------------------|
| Web dashboard (Plant Ops)       | https://kaizen-lab-web.web.app                        | HTTP 200, 1073 bytes. `/api/auth/accounts` 200; `/api/incidents/current` (no token) 401. |
| Mobile app (Technician)         | https://kaizen-lab-mobile.web.app                     | HTTP 200, 899 bytes; **bundle is pre-PR-#289** (SHA-256 `c3c6dd0ec24…`, last-modified 17:29:49 GMT). Cache header `public, max-age=31536000, immutable` — recovery needs redeploy, not reload. |
| 3D system topology demo         | https://kaizen-lab-demo.web.app                       | HTTP 200, 1068 bytes.                                                   |
| Factory simulator UI            | https://kaizen-lab-factory.web.app                    | HTTP 200. `/api/factory/status` → `{running: true, tick_index: 28, machines: [CNC-01, CNC-02, CNC-03, IM-05], edge_drop: 95.5%}`. |
| Backend (Cloud Run via Firebase) | https://kaizen-lab-backend-907005738171.asia-southeast1.run.app | Live. `/healthz` → `{status: healthy, gcp_project: kaizen-lab-2026, pubsub_available: true}`. |

> Sanitisation: cloud service host names kept in this checklist only because the runbook
> uses them as factual target URLs; PR comments and issue comments will reference these
> surfaces by `kaizen-lab-{web,mobile,factory,demo}.web.app` patterns (no raw host paths).
> See `<shared-team-memory>/2026-10-15-sanitize-host-paths.md`.

---

## 1. Capture Surface ↔ Tool ↔ Output ↔ Ticket Cross-Reference

Legend:
- **Surface** = the user-visible origin (one of `kaizen-lab-{web,mobile,factory,demo}.web.app`
  or the backend Cloud Run URL).
- **Tool** = Built-in Browser screenshot, curl, Cloud Logging, SSE log file, factory write API.
- **Output** = expected payload / assertion we want to be able to attach to the ticket.
- **Issue #** = the GitHub issue the evidence is posted on.
- **State:** `READY-NOW` = local emulator or read-only live probe can already produce the evidence;
  `USER-GATED` = requires deploy / seed / kb:import / live Pub-Sub publish that cost money or
  affect prod; `PRE-DEV` = depends on a Dev lane PR (e.g. StreakGate grid columns fix).

| #   | Capture Item                                                                                          | Surface                  | Exact URL / probe                                                                            | Capture tool                                              | Expected output (assertion)                                                                                                                  | Where to comment (GitHub) | State          |
|-----|-------------------------------------------------------------------------------------------------------|--------------------------|---------------------------------------------------------------------------------------------|------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|--------------------------|----------------|
| C-01 | Web hosting target 200                                                                                | web                      | `GET https://kaizen-lab-web.web.app`                                                         | curl                                                       | `HTTP 200`, `Content-Type: text/html`, bytes ~1073                                                                                            | #79                       | READY-NOW      |
| C-02 | Web `/api/incidents/current` auth-gate 401                                                            | web                      | `GET https://kaizen-lab-web.web.app/api/incidents/current`                                   | curl                                                       | `HTTP 401 {"detail":"Missing token"}`                                                                                                         | #79                       | READY-NOW      |
| C-03 | Web `/api/auth/accounts` demo accounts 200                                                            | web                      | `GET https://kaizen-lab-web.web.app/api/auth/accounts`                                       | curl                                                       | `HTTP 200` + JSON array with `shiftleader`, `technician`                                                                                      | #79, #154                | READY-NOW      |
| C-04 | Mobile hosting target 200 (current stale build)                                                      | mobile                   | `GET https://kaizen-lab-mobile.web.app`                                                      | curl                                                       | `HTTP 200`, 899 bytes; bundle hash `CTq__j46` (pre-PR-#289)                                                                                   | #151, #307                | READY-NOW      |
| C-05 | Demo hosting target 200                                                                               | demo                     | `GET https://kaizen-lab-demo.web.app`                                                         | curl                                                       | `HTTP 200`, 1068 bytes                                                                                                                        | #79                       | READY-NOW      |
| C-06 | Factory hosting target + `/api/factory/status`                                                        | factory                  | `GET https://kaizen-lab-factory.web.app/api/factory/status`                                  | curl                                                       | `HTTP 200`, `running=true`, non-decreasing `tick_index`, 4 machines, `edge_drop ~95%`                                                         | #76                       | READY-NOW      |
| C-07 | Backend `/healthz` readiness payload                                                                   | backend Cloud Run        | `curl https://kaizen-lab-backend-907005738171.asia-southeast1.run.app/healthz`               | curl                                                       | `HTTP 200 {status: healthy, pubsub_available: true, …}`                                                                                      | #76                       | READY-NOW      |
| C-08 | Pub/Sub topics exist                                                                                  | GCP project              | `gcloud pubsub topics list --project kaizen-lab-2026 --format='value(name)'`                | shell (gcloud)                                             | Output contains exactly: `kaizen-telemetry`, `kaizen-traceability`, `kaizen-quality-events`                                                   | #76                       | READY-NOW (env) |
| C-09 | Cloud Run min-instances (backend = 1, factory = 0)                                                     | GCP project              | `gcloud run services describe kaizen-backend --region=asia-southeast1 --project=kaizen-lab-2026 --format='get(spec.template.scaling.minInstanceCount,spec.template.scaling.maxInstanceCount)'` | shell (gcloud) + terraform plan diff                | backend: `minInstanceCount=1, maxInstanceCount=<var>`; factory: `minInstanceCount=0`                                                          | #76                       | READY-NOW (env) |
| C-10 | Auth login success + bad-password 401 + 6x bad-password 429                                            | web                      | 3 curl variants against `https://kaizen-lab-web.web.app/api/auth/login`                       | curl                                                       | (a) `HTTP 200` + JWT; (b) `HTTP 401 {"detail":…}`; (c) at least one `HTTP 429` with `Retry-After`                                              | #154                       | READY-NOW      |
| C-11 | Asset cache headers (immutable)                                                                       | web                      | `curl -sI https://kaizen-lab-web.web.app/assets/index-*.js`                                  | curl                                                       | `Cache-Control: public, max-age=31536000, immutable`                                                                                          | #79                       | READY-NOW      |
| C-12 | SSE stream frames during a real incident                                                              | backend Cloud Run        | `curl -sN -H "Authorization: Bearer $TOKEN" https://kaizen-lab-backend-907005738171.asia-southeast1.run.app/api/incidents/stream  > /tmp/sse-<ts>.log`; run for ≥ 30 s | curl + file attachment                                | Log contains ≥ 4 distinct `data:` frames; status transitions `open` → `verifying` → `closed`; agent findings visible                            | #79, #80                | USER-GATED     |
| C-13 | Factory inject via web UI login flow (not deprecated endpoint)                                        | web                      | Click **Inject Defect** as `shiftleader` on https://kaizen-lab-web.web.app                   | Built-in Browser (mouse + screenshot evidence)             | Screenshot of AnomalyBanner appearing, default scenario `cnc_tool_wear`, machine CNC-02, defect rate 0.2 → 8%                                | #80, #76                 | USER-GATED     |
| C-14 | 4-phase incident lifecycle visible on dashboard (SSE timeline + Incident page)                        | web                      | Incidents tab + Incident page + Step rail on https://kaizen-lab-web.web.app                 | Built-in Browser screenshot sequence (every ~10 s)        | 3–5 screenshots capturing Detect → Diagnose → Repair + Gatekeeper → Document + Learn                                                       | #80                       | USER-GATED     |
| C-15 | Mobile bundle SHA-256 diff after redeploy (#307)                                                      | mobile                   | `NEW=$(curl -s https://kaizen-lab-mobile.web.app/ \| grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' \| head -1); curl -s "https://kaizen-lab-mobile.web.app/$NEW" \| grep -c 'pwd'` | curl + jq                                            | Bundle hash ≠ `CTq__j46`; `grep -c 'pwd'` ≥ 1; `grep -c 'searchParams'` ≥ 1; `HTTP 200` for `?pwd=test123`                                   | #307, #151                | USER-GATED     |
| C-16 | Mobile login prefill on `?pwd=red-panda-2026` (post-PR-#289 bundle)                                   | mobile                   | https://kaizen-lab-mobile.web.app/?pwd=red-panda-2026                                       | Built-in Browser screenshot                               | Password input field shows `••••••••••••••••` (placeholder/length or actual value); submit signs in as `technician`                             | #307, #151                | USER-GATED     |
| C-17 | Demo iframe / split-screen chord capture (Beat 4 in storyboard)                                       | demo + web + mobile      | https://kaizen-lab-demo.web.app (use its iframe/wrapper if it loads web + mobile)            | Built-in Browser full-page screenshot OR screen-recording | Screenshot showing both web dashboard (left) and mobile web view (right) side-by-side OR a recording that briefly overlays both                | #76 (Storyboard)         | READY-NOW (page-load) / USER-GATED (active pane) |
| C-18 | StreakGate trio — 17/50 mid-flight, 31/50 mid-flight, 50/50 release                                    | web (Incident page)      | After `#80` inject, refresh incident page periodically (or wait on SSE)                       | Built-in Browser screenshot triptych                      | **17/50.png** → cell count `17/50` + "Live" chip + reset notice count          | #80                       | USER-GATED     |
|       |                                                                                                       |                          |                                                                                             |                                                            | **31/50.png** → cell count `31/50` + "Live" chip + reset notice count             |                          |                |
|       |                                                                                                       |                          |                                                                                             |                                                            | **50/50.png** → cell count `50/50` + "Passed" chip (green) + "Approved" button un-locked                                                     |                          |                |
| C-19 | StepRail 5-state trio — captures one screenshot per **state** of a step                                | web (Incident page)      | Force-render the incident with different status / approved states via debug parameter or by waiting through phases | Built-in Browser screenshot quintuplet                | 5 screenshots covering: (a) all `pending`; (b) step-N `active` + others `pending`; (c) mix `done/active/pending`; (d) all except last `done`; (e) all `done` (post-approve) | #80 | USER-GATED    |
| C-20 | AnomalyBanner live copy `Open {incident_id}` (button label)                                           | web (Line Overview)      | Inject via UI, verify banner immediately                                                    | Built-in Browser screenshot + DevTools readable text       | Banner title `CNC-02: …`; button label literally `Open INC-<hex>` matching `incident.incident_id` returned by `/api/incidents/current`            | #80                       | USER-GATED     |
| C-21 | Factory UI scenario chips visible (`Trigger Scenario 1: CNC Tool Wear`, `Trigger Scenario 2: IM Damp Material`) | factory             | https://kaizen-lab-factory.web.app                                                           | Built-in Browser screenshot                               | Two pills / buttons visible with the exact labels above; pressing one triggers the matching `activeAnomaly.scenario`                            | #80                       | USER-GATED (label render) / READY-NOW (URL load) |
| C-22 | Mobile Gemini Live Waveform (MobileFixLive component / Gemini Live WebSocket round-trip)             | mobile                   | Open the Live co-pilot session, start audio, observe waveform visual                        | Built-in Browser screenshot + phone screencap (mobile web) | Waveform is moving in both directions (capture bar); status dot `live`; transcript shows round-trip                                               | #78                       | USER-GATED     |
| C-23 | BigQuery row counts after `mise run infra:seed`                                                       | GCP project              | `bq query --use_legacy_sql=false --format=pretty "SELECT (SELECT COUNT(*) FROM \`kaizen-lab-2026.manufacturing.competition_telemetry\`) AS ct, (SELECT COUNT(*) FROM \`kaizen-lab-2026.manufacturing.traceability\`) AS tr, (SELECT COUNT(*) FROM \`kaizen-lab-2026.manufacturing.sensor_telemetry\`) AS st"` | shell (bq)                                       | `ct ~2000, tr=10, st=12`                                                                                                                  | #77                       | USER-GATED     |
| C-24 | Vertex AI Search snippets                                                                             | GCP project              | `curl -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "Content-Type: application/json" "https://discoveryengine.googleapis.com/v1/projects/kaizen-lab-2026/locations/global/collections/default_collection/dataStores/kaizen-knowledge-store/servingConfigs/default_search:search" -d '{"query":"spindle vibration","pageSize":3}' \| python -m json.tool` | shell (curl + python)                            | HTTP 200 + ≥ 1 result with snippet text                                                                                                       | #77                       | USER-GATED     |
| C-25 | Gemini Live WebSocket upgrade probe                                                                   | backend Cloud Run + web  | DevTools → Network → filter `ws` → open the live-co-pilot, observe 101 Switching Protocols; onmessage fires | Built-in Browser DevTools Network panel screenshot  | `Status 101`; `Response Headers` include `Upgrade: websocket`                                                                                  | #78                       | USER-GATED     |
| C-26 | Mobile SSE stream reaches technician UI                                                                | mobile                   | Open incident on https://kaizen-lab-mobile.web.app and verify live updates                  | Built-in Browser screenshot + Network panel                | SSE frames visible in mobile bundle's Network panel under `/api/incidents/stream`                                                             | #151                       | USER-GATED     |
| C-27 | Cloud Logging excerpt of incident creation                                                             | GCP project              | `gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"kaizen-backend\" AND severity>=WARNING AND jsonPayload.message=~\"Incident\" --project=kaizen-lab-2026 --limit=20 --format=json` | shell (gcloud)                                    | ≥ 5 log records with `Incident created`, `Incident status changed`, `Workflow complete`                                                       | #76, #80                 | USER-GATED     |

---

## 2. StreakGate 50/50 timestamp trio (item C-18 detail)

Per the runbook, the only way the Shift Leader's approval is allowed to flip from
`disabled (locked)` → `enabled` is **Invariant #3**: `verification_count >= verification_target`.
The trio captures concrete proof:

| File name                | Wait/interval           | What the screenshot must show                                                                                                                                                                                                                                                                                       |
|--------------------------|-------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `streak-17-of-50.png`    | ~3–5 s after `verifying` starts | Proof grid shows `17` filled green cells + `8` empty cells; right-side counter `17/50`; "Live" chip visible; "Starts after repair" or "Defect at HH:MM:SS reset…" copy depending on history                                                                                                                       |
| `streak-31-of-50.png`    | additional ~5–10 s      | Proof grid `31` filled green cells; counter `31/50`; "Live" chip; counter-tariff ratio visibly closer                                                                                                                                                                                                                |
| `streak-50-of-50.png`    | when count reaches 50  | Proof grid fully green; counter `50/50`; "Passed" `chip-green` visible; "Approve 8D & Release Line" button **un-locked**; module `tone-green` class applied                                                                                                                                                       |
| `streak-reset-event.png` | (optional, on a defect)  | "Defect at HH:MM:SS reset the streak from N to 0" copy visible                                                                                                                                                                                                                                                       |

**Capture protocol** (for the operator of the walk-through):
1. Trigger inject via web UI as `shiftleader` (C-13).
2. Open the Incident Command page (C-14) and scroll to the `StreakGate` component
   (`apps/web/src/components/incident/StreakGate.tsx`, source location for review).
3. Capture screenshots in chronological order; save under
   `qa-evidence/round-2/streak-<NN>-of-50.png` (relative path only; see §5).
4. Attach each as a single GitHub comment under #80 (do not collapse into one comment).

---

## 3. StepRail 5-state trio (item C-19 detail)

`StepRail` (`apps/web/src/components/incident/StepRail.tsx`) renders five step dots based
on the `stepState(step, incident, hasFindings)` helper (`apps/web/src/lib/incident.ts:142`),
which returns `'done' | 'active' | 'pending'`. Five states are needed because the helper
produces different combinations across the 5 incident phases
(STEP_LABELS = `Inspection / Traceability / Analysis / Repair & Proof / Sign-off`,
`apps/web/src/components/views/IncidentCommandView.tsx:43`):

| Screenshot               | When to capture                                              | Expected dot colours (top→bottom)                                                |
|--------------------------|--------------------------------------------------------------|----------------------------------------------------------------------------------|
| `steprail-all-pending.png` | Brand-new incident, no findings                               | `pending, pending, pending, pending, pending`                                    |
| `steprail-step-N-active.png` | Active phase — agent running, no findings past that step       | e.g. `done, done, active, pending, pending` for status `analyzing`              |
| `steprail-mixed-states.png` | Mid-flight with parallel completed steps (e.g. RCA + Copilot) | mix of `done / active / pending` reflecting `hasStepFindings` boolean array     |
| `steprail-near-close.png` | Just before approval gate releases                            | `done, done, done, done, pending` (Step 5 still `pending`)                       |
| `steprail-all-done.png`  | Post-approve                                                 | `done, done, done, done, done`; **handover signature** visible in copy          |

**Capture protocol**:
1. Use the **same** triggered incident as C-18 (StreakGate screenshots).
2. Capture the rail at each natural phase boundary.
3. Also verify the **CSS bug fix** in Dev lane `fix/streakgate-grid-target-columns`:
   when `target = 50`, the proof grid renders **exactly 50 cells** and **does not** wrap to a second row.
4. Attach all 5 screenshots as a single checklist comment on #80.

---

## 4. AnomalyBanner live copy `Open {incident_id}` (item C-20 detail)

Source: `apps/web/src/components/overview/AnomalyBanner.tsx:64-68`.

```tsx
<button id="banner-open-incident" type="button" className="btn btn-dark btn-sm"
        onClick={onOpenIncident}>
  Open {incident.incident_id}
  <span className="material-symbols-outlined">arrow_forward</span>
</button>
```

Cross-reference assertion:
1. Read `/api/incidents/current` and capture `incident_id` (e.g. `INC-ABCDEF`).
2. Screenshot Line Overview with the banner mounted.
3. Verify the button text matches `^Open INC-[0-9A-F]{6}$` exactly (regex; either case).
4. Click the button → Incident Command page must open with that incident_id in the URL.

Post to #80 with `@-mention` references to `apps/web/src/components/overview/AnomalyBanner.tsx:66`
(no host paths; relative repo paths only).

---

## 5. Designer 4 added items (mapped into C-XX)

| Designer item                                | Maps to checklist ID | Note                                                                                                                                |
|----------------------------------------------|----------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| (a) factory UI scenario chips                | C-21                 | Two buttons labelled `Trigger Scenario 1: CNC Tool Wear` and `Trigger Scenario 2: IM Damp Material` on factory UI                  |
| (b) MobileFixLive Gemini Waveform            | C-22                 | Audio waveform visual proves Live session is duplex; pair with C-25 WS handshake                                                  |
| (c) post-#307 login prefill                  | C-16                 | Bundled with C-15 (mobile bundle SHA diff); both depend on USER-GATED `mise run deploy:mobile`                                      |
| (d) `kaizen-lab-demo` iframe capture         | C-17                 | The demo origin itself is a web app which can hold an iframe/pointer to the live factory streaming feed                            |

All four are inside the **#76 / #80 / #78 / #307** ticket stack; no separate ticket is required.

---

## 6. Cross-cutting regression capture after each round

Per TL runbook Part 4, after **every** ticket closure the regression battery must pass:

```bash
# R-1: all hosting targets still 200
for url in https://kaizen-lab-web.web.app https://kaizen-lab-mobile.web.app \
           https://kaizen-lab-demo.web.app https://kaizen-lab-factory.web.app; do
  curl -sS -o /dev/null -w "$url  HTTP %{http_code}\n" "$url"
done

# R-2: factory simulator still ticking
curl -sS https://kaizen-lab-factory.web.app/api/factory/status | python -c \
  "import json,sys;d=json.load(sys.stdin);print('tick:',d['tick_index'],'running:',d['running'],'machines:',d['machine_count'])"

# R-3: backend pubsub still subscribed
curl -sS https://kaizen-lab-backend-907005738171.asia-southeast1.run.app/healthz
# Expected: pubsub_available=true
```

Each regression run is captured to `/tmp/regression-<ts>.log` and attached to the
ticket whose closure just succeeded. **If any of R-1 / R-2 / R-3 fail → STOP, post
blocker to PM, do not start the next ticket.**

---

## 7. Evidence format requirements (every ticket)

Per runbook Part 5, every ticket close attaches:

1. **Curl outputs** (status codes + JSON payloads) — copy-pasted verbatim, not paraphrased.
2. **Cloud Logging excerpts** — filter `severity>=WARNING` or
   `resource.type="cloud_run_revision" AND serviceName=kaizen-backend`.
3. **SSE evidence** — full log file (`/tmp/sse-<timestamp>.log`) as a file attachment.
4. **Mobile evidence** — device/browser console log + a screenshot from the technician UI
   (saved under `qa-evidence/round-2/...`).
5. **Commit-style changelog** — 1–3 bullets on what changed in the deploy since the last
   verification round.

All evidence must come from a real running flow. Mock / simulator outputs are only valid in dev; Round-2 captures must be against live infra (`kaizen-lab-{web,mobile,factory,demo}.web.app`).

---

## 8. Sanitisation + path policy (mandatory)

- Never post raw absolute host paths (`/Users/nqdd/...`, `~/.openmausbot/...`) into GitHub
  comments, screenshots, or chat. Use relative repo paths or `<qa-workspace>/...`.
- No credentials in comments; use `$TOKEN` and redact API keys (`FACTORY_API_KEY`).
- No bot persona names (Kaizen PM, Kaizen Dev, Kaizen Tech Lead, Kaizen QA, Chief)
  in PR comments or ticket bodies. GitHub artifacts are 100% English.
- Commit identity must be `nqdd <datnq1210@gmail.com>` only — fallback to global
  `git config user.email` if `--local` is unset in this worktree (verified at
  04:17 ICT: `git config --local --get user.email` returns empty).

---

## 9. OPEN / USER-GATED items that block the walk-through

The following items cannot be captured without explicit user approval via Chief:
- `mise run deploy:mobile` — needed for C-15, C-16
- `mise run infra:seed` and `mise run kb:import` — needed for C-23, C-24
- Real Pub/Sub publish to `kaizen-quality-events` (a defect inject via the
  non-deprecated path is needed for C-12, C-13, C-14, C-18, C-19, C-20, C-21)
- Real Gemini Live against Vertex (cost + rate-limit) — needed for C-22, C-25

When PM pings back with user approval, the walk-through executes in the order
C-13 → C-14 → C-18 → C-19 → C-20 → C-12 → C-21 → C-22 → C-25, then the
mobile bundle redeploy C-15 / C-16 / C-26, then BQ C-23 / Vertex C-24, then the
full regression sweep §6.

---

## 10. Cross-references to source files (no host paths, only repo-relative)

- `apps/web/src/components/incident/StreakGate.tsx` — StreakGate component (C-18).
- `apps/web/src/components/incident/StepRail.tsx` — StepRail component (C-19).
- `apps/web/src/lib/incident.ts` — `STEP_OF_STATUS` + `stepState()` helper (C-19).
- `apps/web/src/components/views/IncidentCommandView.tsx` — `STEP_LABELS`
  (Inspection / Traceability / Analysis / Repair & Proof / Sign-off) + `hasStepFindings`.
- `apps/web/src/components/overview/AnomalyBanner.tsx` — AnomalyBanner + `Open {incident.incident_id}` button (C-20).
- `apps/web/src/components/DemoController.tsx` — DemoController with `SCENARIOS` catalog
  and `factory-scenario-${idx}` element ids (C-21).
- `simulator/ui/src/components/AnomalyConsole.tsx` — factory UI scenario chips (C-21).
- `apps/mobile/src/api/kaizenApi.ts` — mobile StreamOrigin wiring (C-26).
- `backend/core/pubsub_manager.py` (`_handle_quality_event_message`, lines 262–379) —
  sole prod entry to Orchestrator (architecture check #1.2 in TL runbook Part 1).
- `simulator/server.py:EdgePubSubDispatcher` (lines 290, 292) — the prod factory → Pub/Sub path.
- `docs/DESIGN.md` — Lumina Slate tokens (no dark canvases, Indigo accent, JetBrains Mono
  for incident_id, ≥ 44 px tap targets).
- `docs/wireframes/05_demo_storyboard_90s.md` — 90 s beat table; Beat 4 confirms 25 s
  StreakGate 0→50 climb + parallel technician co-pilot / hard-locked approval.

---

## 11. Local-emulator-only dry-run (no cost, no live side-effects)

Items **READY-NOW** (C-01 through C-11) can already be captured against the live infra
because they are read-only and idempotent. QA may run this subset at any time without
triggering cost gates:

```bash
# Local dry-run preview (read-only — produces the artifact list before the live walk-through)
TS=$(date +%s)
mkdir -p "qa-evidence/round-2/dry-run/${TS}"
{
  curl -sS -o /dev/null -w "C-01 web:        %{http_code}\n"        https://kaizen-lab-web.web.app
  curl -sS -o /dev/null -w "C-04 mobile:     %{http_code}\n"        https://kaizen-lab-mobile.web.app
  curl -sS -o /dev/null -w "C-05 demo:       %{http_code}\n"        https://kaizen-lab-demo.web.app
  curl -sS -o /dev/null -w "C-06 factory:    %{http_code}\n"        https://kaizen-lab-factory.web.app
  curl -sS -o /dev/null -w "C-02 web-gate:   %{http_code}\n"        https://kaizen-lab-web.web.app/api/incidents/current
  curl -sS -o /dev/null -w "C-03 accounts:   %{http_code}\n"        https://kaizen-lab-web.web.app/api/auth/accounts
} | tee "qa-evidence/round-2/dry-run/${TS}/regression-r1.log"
```

Each dry-run log goes into a PR comment on **#75** (the umbrella epic) — NOT on the
individual tickets, since this dry-run is a precondition check and not a closure
evidence.

---

## 12. Where in the comment thread the evidence lands

| Surface              | GitHub ticket                 | Comment style                                                                                                                       |
|----------------------|-------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| Hosting + API gateway| #79                           | One comment per curl probe (C-01, C-02, C-03, C-04, C-05, C-11); regression sweep §6 as a single trailing block.                   |
| Backend Cloud Run    | #76                           | C-06, C-07, C-09, C-27 (Cloud Logging excerpt).                                                                                    |
| BigQuery + RAG       | #77                           | C-23, C-24 + the canonical 9-step re-seed runbook diff.                                                                            |
| Gemini Live          | #78                           | C-22, C-25 (DevTools screenshot).                                                                                                  |
| 4-phase lifecycle    | #80                           | All step / streak / banner captures: C-13, C-14, C-18, C-19, C-20, C-21 + SSE log file (C-12).                                     |
| Mobile bundle        | #307 + cross-link to #151     | C-15, C-16 (USER-GATED).                                                                                                           |
| Mobile live          | #151                          | C-26 (SSE reach into technician UI).                                                                                                |
| Auth + rate limit    | #154                          | C-10.                                                                                                                               |
| Round-2 umbrella     | #75 (epic)                    | Reference comments: each ticket close leaves a `Refs #75` cross-link; this checklist is committed in PR comment / branch as a single source. |

---

## 13. Reviewer checklist (before posting each capture comment)

- [ ] Capture is taken from a real running flow (not emulator / mock).
- [ ] HTTP status, JSON excerpt, or Cloud Logging excerpt is verbatim — no paraphrase.
- [ ] Paths in the comment are repo-relative or sanitised; no `/Users/nqdd/...`,
      no `~/.openmausbot/...`, no cloud-Run host names.
- [ ] No bot persona names (Kaizen PM/Dev/TL/QA, Chief) anywhere in the comment.
- [ ] No `Co-authored-by` trailer in any commit author.
- [ ] Cross-link `Refs #<ticket-number>` used for every comment.
- [ ] Sequence number (`step N`) cited from Built-in Browser tool output, if available.
- [ ] Screenshots saved under `qa-evidence/round-2/<ticket>/...` (gitignored) and
      attached via the GitHub comment uploader.

---

End of checklist. Owner: Kaizen QA. Co-owner (sign-off on every USER-GATED capture):
Kaizen Tech Lead + Kaizen PM.
