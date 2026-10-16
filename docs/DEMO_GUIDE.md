# Kaizen Agent: Two-Window Decoupled Industrial Demonstration Guide

> **Authoritative Demo Guide for Hackathon Presentations & Video Pitch**  
> **Architecture Standard:** Two-Window Decoupled Model (Window 1: Factory Floor Client, Window 2: Cloud AI Control Plane)  
> **Design Compliance:** [`docs/DESIGN.md`](./DESIGN.md) (Lumina Slate liquid glass, light)  
> **Automated E2E Test Suite:** [`tests/test_decoupled_flow.py`](../tests/test_decoupled_flow.py), [`tests/test_pubsub_pipeline.py`](../tests/test_pubsub_pipeline.py)

---

## 1. Executive Summary & Architecture Overview

Kaizen Agent demonstrates an enterprise-grade industrial AI architecture solving high-speed manufacturing defects. The system is split into two physically decoupled planes communicating exclusively over **Google Cloud Pub/Sub**:

```text
┌─────────────────────────────────────────────────────────┐      ┌─────────────────────────────────────────────────────────┐
│              WINDOW 1: FACTORY FLOOR CLIENT             │      │             WINDOW 2: CLOUD AI CONTROL PLANE            │
│         (:3002 Web UI / :8010 Factory API Server)       │      │         (:3000 Web Dashboard / :8000 FastAPI Backend)   │
├─────────────────────────────────────────────────────────┤      ├─────────────────────────────────────────────────────────┤
│ • Multi-CNC Telemetry & Conveyor Serialization           │      │ • ADK Multi-Agent Orchestrator (7 Agent Swarm)          │
│ • Gemma 3 Edge Vision Metrology (<50ms inference)        │      │ • Quality Inspector (SPC 3-Sigma Breach Detection)      │
│ • On-Premise Pneumatic Scrap Diverter Actuation         │      │ • Traceability, Process Analyst, Root Cause (5-Whys/RAG)│
│ • Edge Noise Filter: drops >95% normal PASS frames       │      │ • Technician Copilot (Gemini Live Audio & Multimodal)   │
│ • Pub/Sub Dispatcher with Live Delivery HUD             │      │ • Invariant #3 StreakGate (Evidence-Gated Lock 50/50)   │
│ • Zero Dependency on Backend Core or Blackboard          │      │ • ESG Sustainability Impact Ledger & 8D Scribe          │
└────────────────────────────┬────────────────────────────┘      └────────────────────────────▲────────────────────────────┘
                             │                                                                │
                             │   Google Cloud Pub/Sub Topics:                                 │
                             │   • kaizen-quality-events   (defect alerts & edge frames)      │
                             └───► kaizen-telemetry        (spindle vibration & currents) ────┘
                                 • kaizen-traceability     (discrete part lot serials)
                                 (NO DIRECT HTTP CALLS TO /api/simulation/inject)
```

### Key Architectural Invariants
1. **Zero Direct Coupling:** The Cloud Control Plane (Window 2) never triggers defects on the factory floor, and the factory floor never invokes `/api/simulation/inject`. All anomaly signals flow asynchronously through Google Cloud Pub/Sub.
2. **On-Premise Edge Boundary (Invariant #8):** Gemma 3 edge classification runs on-premise (simulated locally). Defect frames are diverts immediately in sub-50ms; >95% of normal PASS frames are dropped at the edge, reducing cloud ingress bandwidth by >95%.
3. **Evidence-Gated Line Release (Invariant #3):** Incidents cannot be marked resolved or approved on promises. The line release remains strictly locked until the StreakGate verifies **50 consecutive defect-free parts** passing optical inspection.

---

## 2. Screen Setup & Display Layout

### Side-by-Side Presentation Layout
For optimal live pitching or screen recording, position both windows side-by-side on a single 1920×1080 display (50% split) or across dual monitors:

```text
╭────────────────────────────────────────────────────────────────────────────────────────────╮
│  1920 × 1080 DEMONSTRATION CANVAS                                                          │
│  ╭─ LEFT WINDOW (50% / 960px) ────────────────────────╮ ╭─ RIGHT WINDOW (50% / 960px) ───────────────────────╮│
│  │  WINDOW 1: FACTORY FLOOR CLIENT                    │ │  WINDOW 2: CLOUD AI CONTROL PLANE                   ││
│  │  URL: http://localhost:3002                        │ │  URL: http://localhost:3000                         ││
│  │  (or Cloud Run factory service)                    │ │  (or Firebase Hosting production URL)               ││
│  │  • CNC Fleet Status & Telemetry HUD                │ │  • Plant Ops Executive Dashboard                    ││
│  │  • Conveyor Optical Inspection Stream              │ │  • Anomaly Banner & StepRail Multi-Agent Flow       ││
│  │  • Defect Injection Console                        │ │  • RCA 5-Whys / Ishikawa Fishbone Analysis           ││
│  │  • Pub/Sub Delivery Status (ACK & Latency)         │ │  • StreakGate (0/50 Locked) & ESG Sustainability    ││
│  ╰────────────────────────────────────────────────────╯ ╰─────────────────────────────────────────────────────╯│
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

# Optional Terminal 3: Start Technician Mobile App (:3001)
mise run mobile
```

*Note: Alternatively, running `mise run dev` boots the entire multi-service suite in parallel.*

---

## 3. Step-by-Step 90-Second Demonstration Script

| Beat | Time | Window 1: Factory Floor (:3002) | Window 2: Cloud AI Control (:3000) | Presenter Narrative / Pitch Script | Rubric Pillar |
|---|---|---|---|---|---|
| **1. Cold Open: Calm Nominal State** | `00:00–00:15` (15s) | All 5 CNC machines green `(●) Nominal`. Conveyor smoothly moves parts. Edge filter HUD shows 96.2% PASS frames dropped, 0 defects. | Executive dashboard displays OEE 88.4%, defect rate 0.50% (under 2.5% UCL), zero active incidents. Calm Lumina Slate light UI. | *"Modern factories generate gigabytes of sensor data every second, yet root-cause diagnosis still takes hours of downtime. Today we present Kaizen Agent — an autonomous multi-agent industrial intelligence system built on Google Cloud ADK and Gemini."* | **Impact (25%) & UX (10%)** |
| **2. Physical Anomaly & Edge Diverter** | `00:15–00:30` (15s) | Click **`Inject Defect (CNC Tool Wear)`**. Spindle vibration on CNC-02 spikes. Optical camera detects vertical scratch. Gemma 3 edge classifier fires in **38ms**, pneumatically actuating the scrap diverter. Pub/Sub delivery card flashes green: `sim-ack-1792...` (latency 2.1ms). | **Zero direct HTTP calls.** Window 2 passively listens to Cloud Pub/Sub. Within 200ms, the SPC defect chart jumps to 7.7% crossing the UCL. Red `AnomalyBanner` slides in. | *"On the shop floor, CNC-02 suffers tool wear. At the edge, our local Gemma 3 model detects the defect in under 50 milliseconds, immediately actuating a physical scrap diverter. Instead of flooding the cloud with raw video, it drops 96% of normal frames and dispatches a lightweight quality event to Google Cloud Pub/Sub."* | **Technical (40%) & Innovation (25%)** |
| **3. Cloud Pub/Sub Ingress & Agent Swarm** | `00:30–00:50` (20s) | Factory floor continues running. Delivery HUD logs continuous telemetry and traceability events. | StepRail activates: **Quality Inspector** flags SPC breach. **Traceability** isolates lot `AL-5083-B4` and tool `T07`. **Process Analyst** identifies 35% vibration spike at 10.4 kHz. **Root Cause Agent** queries Vertex AI Search RAG and outputs 5-Whys and Ishikawa fishbone: **Tool T07 Flank Wear (87% confidence)**. | *"In the cloud, Google Cloud Pub/Sub awakens our ADK multi-agent swarm. Quality Inspector, Traceability, Process Analyst, and RAG search execute in parallel. Within seconds, the Root Cause Agent synthesizes an Ishikawa fishbone analysis: Tool T07 flank wear on CNC-02 with 87% confidence."* | **Technical (40%)** |
| **4. Technician Copilot & Evidence Gate** | `00:50–01:15` (25s) | Physical line stopped for tool insert replacement. Operator replaces insert and resumes conveyor. Clean parts begin moving past inspection camera. | Technician Copilot provides multimodal voice guidance via Gemini Live. **Crucial Invariant #3:** The `Approve 8D & Release Line` button is **visibly locked (`🔒`)**. StreakGate progress bar climbs in real time: `12/50` → `34/50` → `50/50`. | *"Our Technician Copilot guides the mechanic hands-free via Gemini Live. But here is Kaizen Agent's core engineering invariant: lines are never released on agent promises. The release button remains strictly locked until StreakGate verifies 50 consecutive defect-free parts passing optical inspection."* | **Innovation (25%) & UX (10%)** |
| **5. Shift Leader Sign-Off & ESG Ledger** | `01:15–01:25` (10s) | All conveyor parts passing inspection. Conveyor status returns to nominal green. | StreakGate hits `50/50`. The lock disengages. Shift Leader taps **`Approve 8D & Release Line`**. Incident Scribe generates completed 8D report. ESG Ledger updates: **48 kg scrap avoided, 18 min downtime prevented, 14.2 kWh saved ($1,420 total economic savings)**. | *"The 50th part passes. The lock disengages. The Shift Leader signs off on the automated 8D report. Our ESG Sustainability Ledger credits 48 kilograms of avoided scrap and $1,420 in downtime savings directly to plant accounting."* | **Impact (25%)** |
| **6. Continuous Learning & Outro** | `01:25–01:30` (5s) | Factory running at full capacity (OEE 89.1%). | Continuous Learning Agent commits preventative maintenance rule for CNC-02 tool life to knowledge base. Full-bleed closing brand card. | *"Autonomous continuous learning commits preventative rules to stop future occurrences. Kaizen Agent: from edge optical detection to cloud resolution in 90 seconds."* | **Impact (25%)** |

---

## 4. Architectural Invariants & Decoupling Guarantees

The following table summarizes the architectural invariants enforced and verified in the codebase:

| Invariant | Specification | Verification Mechanism |
|---|---|---|
| **Pub/Sub Exclusivity** | Factory Floor Client and Cloud AI Control Plane communicate strictly through Google Cloud Pub/Sub topics (`kaizen-quality-events`, `kaizen-telemetry`, `kaizen-traceability`). Zero direct calls to `/api/simulation/inject`. | Automated in [`tests/test_decoupled_flow.py`](../tests/test_decoupled_flow.py) with a mock spy asserting `call_count == 0`. |
| **API Deprecation Notice** | Legacy `/api/simulation/inject` returns HTTP 200 with `Deprecation: true` and `Link: </api/factory/inject>; rel="successor-version"` headers, warning developers to use the decoupled Pub/Sub pipeline. | Validated in [`tests/test_pubsub_exclusivity_debounce.py`](../tests/test_pubsub_exclusivity_debounce.py). |
| **Evidence-Gated Closure (#3)** | Incident status transitions to `closed` only after optical inspection confirms `verification_count >= 50` consecutive defect-free parts. Shift leader approval is rejected if not closed. | Enforced in `backend/agents/orchestrator.py` and validated across E2E test suites. |
| **Gemma 3 Edge Boundary (#8)** | Gemma 3 runs on-premise at the edge. Camera video frames never stream to Cloud Run; only filtered defect frames and edge statistics are sent to Pub/Sub. | Verified in [`tests/test_pubsub_pipeline.py`](../tests/test_pubsub_pipeline.py) and `simulator/edge/`. |
| **Single-Flight & Debounce** | Debounce window (10.0s) prevents multiple incidents for the same machine ID. While an incident is active, subsequent quality events are safely acknowledged and suppressed. | Validated in `tests/test_pubsub_exclusivity_debounce.py` and `tests/test_pubsub_pipeline.py`. |

---

## 5. Verification & Testing Playbook

### Running the Decoupled E2E Integration Suite

Execute the automated tests to verify the two-window decoupled loop:

```bash
# 1. Run the full decoupled flow test suite
python -m pytest tests/test_decoupled_flow.py -v

# 2. Run the Pub/Sub ingestion pipeline contract test suite
python -m pytest tests/test_pubsub_pipeline.py -v

# 3. Run Pub/Sub exclusivity and debounce tests
python -m pytest tests/test_pubsub_exclusivity_debounce.py -v

# 4. Run the complete test suite
mise run test
```

### Manual Verification Checklist
- [ ] Window 1: Opening `http://localhost:3002` displays the Factory Floor UI with 5 CNC machines and live conveyor.
- [ ] Window 1: Clicking `Inject Defect` on CNC-02 causes the edge vision HUD to register a defect frame and display a green Pub/Sub delivery card with latency <10ms.
- [ ] Window 2: Opening `http://localhost:3000` shows the Anomaly Banner appear **without refreshing or clicking any button in Window 2**.
- [ ] Window 2: The StepRail advances autonomously through Inspection → Traceability → Analysis → RCA.
- [ ] Window 2: The `Approve 8D & Release Line` button is visibly disabled and locked with `🔒` while StreakGate counts up to 50/50.
- [ ] Window 2: At 50/50, the button unlocks, shift-leader approval succeeds, and the ESG Impact Card is displayed.
