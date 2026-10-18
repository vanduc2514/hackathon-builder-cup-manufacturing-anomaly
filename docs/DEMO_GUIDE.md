# Kaizen Agent: Three-Window Decoupled Industrial Demonstration Guide

> **Authoritative Demo Guide for Hackathon Presentations & Video Pitch**  
> **Architecture Standard:** Three-Window Decoupled Model (Window 1: Factory Floor Client, Window 2: Cloud AI Control Plane, Window 3: Technician Mobile Copilot)  
> **Design Compliance:** [`docs/DESIGN.md`](./DESIGN.md) (Lumina Slate liquid glass, light)  
> **Automated E2E Test Suite:** [`tests/test_decoupled_flow.py`](../tests/test_decoupled_flow.py), [`tests/test_pubsub_pipeline.py`](../tests/test_pubsub_pipeline.py)

---

## 1. Executive Summary & Architecture Overview

Kaizen Agent demonstrates an enterprise-grade industrial AI architecture solving high-speed manufacturing defects. The system is split across three planes communicating over **Google Cloud Pub/Sub**, **Firestore**, and **Gemini Multimodal APIs**:

```text
┌─────────────────────────────────┐      ┌─────────────────────────────────┐      ┌─────────────────────────────────┐
│  WINDOW 1: FACTORY FLOOR CLIENT │      │   WINDOW 2: CLOUD CONTROL PLANE │      │  WINDOW 3: TECHNICIAN COPILOT   │
│     (:3002 UI / :8010 Service)  │      │    (:3000 Dashboard / :8000 API)│      │           (:3001 Mobile App)    │
├─────────────────────────────────┤      ├─────────────────────────────────┤      ├─────────────────────────────────┤
│ • Multi-CNC Telemetry & Conveyor│      │ • ADK Multi-Agent Orchestrator  │      │ • Scripted Prompt Chips (EN)    │
│ • Gemma 3 Edge Optical Metrology│      │ • Quality Inspector (Vision+SPC)│      │ • Real Gemini Streaming Replies │
│ • Pneumatic Scrap Diverter      │      │ • Traceability, Process Analyst │      │ • Browser Speech Synthesis (EN) │
│ • Pub/Sub Dispatcher + Delivery │      │ • Root Cause Agent (RAG Search) │      │ • Macro Insert Preset Evidence  │
│ • Direct BQ Pub/Sub Subscription│      │ • StreakGate 50/50 Verification │      │ • "Repair Done" Gate Trigger    │
│ • Zero coupling to Control Plane│      │ • ESG Sustainability Impact Card│      │ • Shift Handover Note Sign-Off  │
└────────────────┬────────────────┘      └───────────────▲─────────────────┘      └────────────────▲────────────────┘
                 │                                       │                                         │
                 │   Google Cloud Pub/Sub:               │   Firestore + SSE / REST                │
                 ├──► kaizen-quality-events ─────────────┘◄────────────────────────────────────────┘
                 ├──► kaizen-telemetry ────► BigQuery (direct subscription)
                 └──► kaizen-traceability ─► BigQuery (direct subscription)
```

### Key Architectural Invariants
1. **Zero Direct Coupling:** The Cloud Control Plane (Window 2) never triggers defects on the factory floor, and the factory floor never invokes `/api/simulation/inject`. All anomaly signals flow asynchronously through Google Cloud Pub/Sub.
2. **On-Premise Edge Boundary (Invariant #8):** Gemma 3 edge classification runs on-premise (simulated locally). Defect frames are diverts immediately in sub-50ms; >95% of normal PASS frames are dropped at the edge, reducing cloud ingress bandwidth by >95%.
3. **Evidence-Gated Line Release (Invariant #3):** Incidents cannot be marked resolved or approved on promises. The line release remains strictly locked until StreakGate verifies **50 consecutive defect-free parts** passing optical inspection.
4. **Physical Confirmation Before Release:** The orchestrator will not begin post-repair verification until the frontline technician submits a physical "Repair Done" signal from Window 3.
5. **Deterministic Scripted Guard (`DEMO_SCRIPTED`):** All vision inspection and agent reasoning steps query real Gemini models. When running with `DEMO_SCRIPTED=true`, results that drift from the curated scenario are retried once and transparently fall back to catalog expectations, tagged with `source="fallback"`.

---

## 2. Screen Setup & Display Layout

### Three-Window Presentation Layout
For optimal live pitching or screen recording, position the Factory Floor and Cloud Control Plane side-by-side on a desktop display, with the Technician Mobile App docked or captured on an accompanying device / simulator window:

```text
╭────────────────────────────────────────────────────────────────────────────────────────────╮
│  1920 × 1080 DEMONSTRATION CANVAS                                                          │
│  ╭─ LEFT (45% / 864px) ───────────────╮ ╭─ CENTER (40% / 768px) ──────╮ ╭─ RIGHT (15% / 288px) ───╮│
│  │ WINDOW 1: FACTORY FLOOR CLIENT     │ │ WINDOW 2: CLOUD AI CONTROL  │ │ WINDOW 3: MOBILE COPILOT││
│  │ URL: http://localhost:3002         │ │ URL: http://localhost:3000  │ │ URL: http://localhost:3001│
│  │ • CNC Fleet Status & Telemetry HUD │ │ • Executive Ops Dashboard   │ │ • Prompt Chips          ││
│  │ • Conveyor Optical Stream          │ │ • StepRail Multi-Agent Flow │ │ • Gemini Streaming Text ││
│  │ • Defect Injection Console         │ │ • RCA 5-Whys & Ishikawa     │ │ • Browser Speech Synthes││
│  │ • Pub/Sub Delivery HUD             │ │ • StreakGate (0/50 Locked)  │ │ • Worn / New Insert Evid││
│  │ • Real-time Diverter Status        │ │ • Pending Approval Gate     │ │ • "Finish Repair" Button││
│  ╰────────────────────────────────────╯ ╰─────────────────────────────╯ ╰─────────────────────────╯│
╰────────────────────────────────────────────────────────────────────────────────────────────╯
```

### Service Startup Commands (Local Development)

Launch all services via `mise`:

```bash
# Terminal 1: Start Factory Floor Simulator (Backend :8010 & UI :3002)
mise run factory:server
mise run factory:dev

# Terminal 2: Start Cloud AI Control Plane (Backend :8000 & React Dashboard :3000)
mise run backend
mise run web

# Terminal 3: Start Technician Mobile App (:3001)
mise run mobile
```

*Note: Alternatively, running `mise run dev` boots the entire multi-service suite in parallel.*

---

## 3. Demo Image Mapping per Beat

All image assets are curated, licensed, normalized to long edge $\le 1024\text{ px}$ (JPEG q90), and stored under `data/datasets/preset_evidence/cnc02/` and `apps/{web,mobile}/public/presets/evidence/cnc02/`. Provenance and full attribution are recorded in [`data/datasets/preset_evidence/README.md`](../data/datasets/preset_evidence/README.md).

| Beat | Screen | Preset Identifier | Asset Filename | Expected Class |
|---|---|---|---|---|
| **Beat 2 (EOL Camera)** | Window 1 & 2 | `preset-cnc02-defect-scratch-vertical-flickr-ansik` | `defect_scratch_vertical_flickr_ansik.jpg` | `scratch_vertical` |
| **Beat 3b (Field Evidence)** | Window 3 | `preset-cnc02-tool-worn-insert-commons-bautsch-cc0` | `tool_worn_insert_commons_bautsch_cc0.jpg` | `replace` |
| **Beat 4a (Tool Verification)** | Window 3 | `preset-cnc02-tool-new-insert-commons-raizy-1` | `tool_new_insert_commons_raizy_1.jpg` | `ok` |
| **Beat 4b (StreakGate Sample)** | Window 2 | `preset-cnc02-good-parts-flickr-theleadsa` | `good_parts_flickr_theleadsa.jpg` | `none` |
| **Beat 4b (StreakGate Sample)** | Window 2 | `preset-cnc02-good-housing-commons-mitrpak` | `good_housing_commons_mitrpak.jpg` | `none` |
| **Beat 4b (StreakGate Sample)** | Window 2 | `preset-cnc02-good-part-commons-lampin-components` | `good_part_commons_lampin_components.jpg` | `none` |

---

## 4. Step-by-Step 90-Second Demonstration Script

| Beat | Time | Window 1: Factory (:3002) | Window 2: Cloud Control (:3000) | Window 3: Mobile (:3001) | Presenter Narrative / Pitch Script |
|---|---|---|---|---|---|
| **1. Cold Open: Calm Nominal State** | `00:00–00:15` (15s) | All 5 CNC machines green `(●) Nominal`. Conveyor moves clean aluminum parts. Edge HUD: 96.4% PASS dropped, 0 defects. | Executive dashboard: OEE 88.4%, defect rate 0.50% (under 2.5% UCL), zero active incidents. Clean Lumina Slate UI. | Standby / viewing nominal line. | *"Modern factories generate gigabytes of sensor data every second, yet root-cause diagnosis still takes hours of downtime. Today we present Kaizen Agent — an autonomous multi-agent industrial intelligence system built on Google Cloud ADK and Gemini."* |
| **2. Physical Anomaly & Edge Diverter** | `00:15–00:30` (15s) | Click **`Inject Defect (CNC Tool Wear)`**. CNC-02 vibration spikes. Optical camera detects vertical scratch on aluminum part. Edge Gemma 3 fires in 38ms, actuating scrap diverter. Pub/Sub delivery card flashes green. | Passively listens to Pub/Sub. SPC defect rate jumps to 7.7% crossing UCL. Red `AnomalyBanner` slides in. Quality Inspector classifies scratch with Gemini Vision. | Idle alert notification appears. | *"On the shop floor, CNC-02 suffers tool wear. At the edge, our local Gemma 3 model detects the defect in under 50 milliseconds, immediately actuating a physical scrap diverter. It dispatches a lightweight quality event to Google Cloud Pub/Sub while telemetry and traceability stream directly to BigQuery."* |
| **3. Agent Swarm & Diagnostic Loop** | `00:30–00:50` (20s) | Factory continues running. Continuous sensor telemetry streams directly to BigQuery via Pub/Sub subscription. | StepRail advances: **Quality Inspector** flags breach. **Traceability** isolates lot `AL-5083-B4` and tool `T07`. **Process Analyst** identifies 34% vibration spike on CNC-02. **Root Cause Agent** queries Vertex AI Search RAG and requests physical tool evidence. | Prompt received: *RCA requests close-up inspection of tool T07 edge.* | *"In the cloud, Google Cloud Pub/Sub awakens our ADK multi-agent swarm. Quality Inspector, Traceability, and Process Analyst run sequentially to isolate CNC-02 and Tool T07. Because initial confidence requires physical confirmation, the Root Cause Agent requests frontline verification."* |
| **4. Technician Copilot & Evidence Gate** | `00:50–01:10` (20s) | CNC-02 paused for tool swap. | Status updates to `awaiting_evidence`. | Technician taps prompt chip: *Show removed T07 insert*. Selects worn insert preset. Real Gemini analyzes image; browser speaks repair guidance via SpeechSynthesis. Technician swaps insert, selects new insert preset, and taps **`Finish Repair`**. | *"On the shop floor, our Technician Copilot guides the mechanic in English using Gemini streaming and browser speech synthesis. The technician uploads a photo of the worn insert, receives torque specs from OEM manuals, verifies the fresh insert, and confirms physical repair completion."* |
| **5. Line Recovery & Shift Leader Sign-Off** | `01:10–01:25` (15s) | Machine resumes. Conveyor feeds clean parts past optical inspection. | Incident enters `verifying`. StreakGate counts up: `12/50` → `34/50` → `50/50` (sampling real camera frames with Gemini Vision). Status transitions to **`Pending Approval`**. Shift Leader clicks **`Approve 8D & Release Line`**. | Status shows *Awaiting Shift Leader Sign-Off*. | *"With repair confirmed, the line enters verification. But Kaizen Agent enforces a strict engineering invariant: lines are never released on promises. StreakGate verifies 50 consecutive defect-free parts using Gemini Vision before enabling the Shift Leader to sign off on the 8D report."* |
| **6. Continuous Learning & Export** | `01:25–01:30` (5s) | Factory operating at nominal capacity (OEE 89.1%). | Shift leader approval records user identity. Incident status becomes `closed`. 8D report, work order, SOP revision, and impact card export to Cloud Storage (`gs://kaizen-lab-kb/incidents/`). ESG Ledger books 240 scrap avoided directly to BigQuery. | Final closed confirmation. | *"Upon sign-off, approved 8D documents export to Cloud Storage, avoided scrap is committed to BigQuery, and Continuous Learning indexes the preventative rule into Vertex AI Search. Kaizen Agent: from edge optical detection to cloud resolution in 90 seconds."* |

---

## 5. Architectural Invariants & Decoupling Guarantees

| Invariant | Specification | Verification Mechanism |
|---|---|---|
| **Pub/Sub Exclusivity** | Factory Floor Client and Cloud AI Control Plane communicate strictly through Google Cloud Pub/Sub topics (`kaizen-quality-events`, `kaizen-telemetry`, `kaizen-traceability`). Zero direct calls to `/api/simulation/inject` in production. | Automated in [`tests/test_decoupled_flow.py`](../tests/test_decoupled_flow.py) with a mock spy asserting `call_count == 0`. |
| **Direct BigQuery Ingestion (#331)** | High-frequency telemetry and discrete traceability are ingested directly into BigQuery tables via native Pub/Sub subscriptions (`kaizen-telemetry-bq`, `kaizen-traceability-bq`), completely bypassing backend CPU overhead. | Enforced in `infra/terraform/pubsub.tf` with IAM `roles/bigquery.dataEditor`. |
| **Physical Repair Gate (#321)** | The orchestrator holds incident status in `repairing` and refuses to begin conveyor verification until the technician explicitly calls `POST /api/incidents/repair-done`. | Enforced in `backend/agents/workflow_nodes.py` (`wait_for_repair_node`) and tested in `tests/test_repair_confirmation.py`. |
| **Evidence-Gated Closure (#3 / #322)** | Incident transitions to `pending_approval` only after StreakGate verifies **50 consecutive defect-free parts**, sampling real part images through the Gemini Vision guard. | Enforced in `backend/agents/agent_quality_inspector.py` and validated across E2E test suites. |
| **Audited Human Sign-Off (#332)** | Shift Leader approval transitions status to `closed`, records `approved_by` and `approved_at`, and triggers document export and institutional learning. | Enforced in `backend/agents/orchestrator.py` (`approve`) and tested in `tests/test_document_approvals.py`. |
| **Transparent Fallback Attribution (#319 / #320)** | Every finding, vision result, and impact ledger entry exposes `source="gemini"`, `"fallback"`, or `"mock"`, guaranteeing audit transparency for competition judges. | Validated in `tests/test_gemini_vision_guard.py` and `tests/test_orchestrator_validation.py`. |
