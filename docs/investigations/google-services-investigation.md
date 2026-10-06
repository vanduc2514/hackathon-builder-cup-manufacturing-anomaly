# Kaizen Agent: Google Services Investigation & Deployment Guide

This document provides a comprehensive technical and operational breakdown of all Google services, platforms, frameworks, and AI models utilized in the **Kaizen Agent** system architecture, fully aligned with the codebase in `main` (see [`AGENTS.md`](../../AGENTS.md) and [`README.md`](../../README.md)).

It covers:
- What each service is, with **official homepage and pricing links**
- How it is used in the Kaizen Agent lifecycle (mapped to exact agent files in [`backend/agents/`](../../backend/agents))
- How to run/emulate it locally on development machines (using [`goccy/bigquery-emulator`](https://github.com/goccy/bigquery-emulator), in-memory blackboard, and [`mise`](../../mise.toml))
- How it runs in production after deployment (Cloud Run & Firebase)
- Pricing, free tiers, and operational cost estimations
- Seamless local-to-cloud switching strategy (Zero-code change via environment variables and ADK conventions)

---

> [!TIP]
> **Operational Agent Skills Available**: All procedural instructions, local setup commands, and troubleshooting runbooks have been transformed into modular Agent Skills in [`.agents/skills/`](../../.agents/skills/README.md). For step-by-step agent instructions, activate the respective skill package.

---

## 1. Quick Architecture & Service Matrix

| Service / Technology | Official Links & Pricing | Role in Architecture | Local Development | Cloud Production | Operational Skill |
|---|---|---|---|---|---|
| **Google ADK** | • [Homepage / Docs](https://google.github.io/agent-development-kit/)<br/>• [GitHub Repository](https://github.com/google/agent-development-kit) | Agent Team Orchestration ([`backend/agents/orchestrator.py`](../../backend/agents/orchestrator.py)) | Native Python runtime (`localhost:8000`) | Container on Cloud Run | [`google-adk`](../../.agents/skills/google-adk/SKILL.md) |
| **Gemma 3 Edge** | • [Gemma Homepage](https://ai.google.dev/gemma)<br/>• [Gemma Docs & Models](https://ai.google.dev/gemma/docs) | Edge Gateway Pre-filtering ([`backend/edge/`](../../backend/edge)) | Native local inference via Ollama / simulator | On-premise IPC / Industrial Gateway | [`gemma-edge`](../../.agents/skills/gemma-edge/SKILL.md) |
| **Gemini 2.0 (Vision & Reasoning)** | • [Vertex AI GenAI Homepage](https://cloud.google.com/vertex-ai/generative-ai)<br/>• [AI Studio Homepage](https://aistudio.google.com/)<br/>• [Vertex AI Pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing) | Defect classification, sensor correlation, RCA (5-Whys & Ishikawa) | Cloud API via AI Studio Key (`GEMINI_API_KEY`) | Vertex AI with IAM / Workload Identity | [`gemini-api`](../../.agents/skills/gemini-api/SKILL.md) |
| **Gemini Live API** | • [Multimodal Live Docs](https://ai.google.dev/gemini-api/docs/multimodal-live)<br/>• [Gemini API Pricing](https://ai.google.dev/pricing) | Real-time Vietnamese voice + camera repair guidance (**Technician Copilot**) | Local browser WebSocket / FastAPI endpoint | Cloud Run / Firebase WebSockets | [`gemini-live-api`](../../.agents/skills/gemini-live-api/SKILL.md) |
| **Gemini Video** | • [Video Understanding Docs](https://ai.google.dev/gemini-api/docs/video)<br/>• [Vertex AI Pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing) | Procedural extraction from expert videos (**Continuous Learning**) | Cloud API via Google AI Studio Key | Vertex AI with IAM | [`gemini-api`](../../.agents/skills/gemini-api/SKILL.md) |
| **Vertex AI Search / RAG** | • [Vertex Search Homepage](https://cloud.google.com/enterprise-search)<br/>• [App Builder Docs](https://cloud.google.com/generative-ai-app-builder/docs/builder-overview) | Manuals, 8D reports, SOP retrieval with citations ([`backend/tools/rag_search_tool.py`](../../backend/tools/rag_search_tool.py)) | Local ChromaDB / FAISS or in-memory mock | Vertex AI Search Engine | [`vertex-rag-search`](../../.agents/skills/vertex-rag-search/SKILL.md) |
| **Cloud Firestore** | • [Firestore Homepage](https://cloud.google.com/firestore)<br/>• [Firestore Pricing](https://cloud.google.com/firestore/pricing) | Shared Incident State (Blackboard) | In-memory reactive SSE Blackboard ([`backend/core/blackboard.py`](../../backend/core/blackboard.py)) | Cloud Firestore (Native mode) | [`firestore-blackboard`](../../.agents/skills/firestore-blackboard/SKILL.md) |
| **BigQuery** | • [BigQuery Homepage](https://cloud.google.com/bigquery)<br/>• [BigQuery Pricing](https://cloud.google.com/bigquery/pricing)<br/>• [goccy/bigquery-emulator](https://github.com/goccy/bigquery-emulator) | Traceability & sensor warehouse ([`data/schemas/bigquery_tables.sql`](../../data/schemas/bigquery_tables.sql)) | **`goccy/bigquery-emulator` on port 9050** + mock fallback | Managed BigQuery Dataset (`manufacturing`) | [`bigquery`](../../.agents/skills/bigquery/SKILL.md) |
| **Cloud Run** | • [Cloud Run Homepage](https://cloud.google.com/run)<br/>• [Cloud Run Pricing](https://cloud.google.com/run/pricing) | Serverless container runtime for backend & agents | Local Uvicorn / FastAPI server (`mise run backend`) | Managed Cloud Run service | [`cloud-run`](../../.agents/skills/cloud-run/SKILL.md) |
| **Firebase Hosting** | • [Firebase Hosting Homepage](https://firebase.google.com/products/hosting)<br/>• [Firebase Pricing](https://firebase.google.com/pricing) | Web dashboard (SPC charts, blackboard UI) | Local Vite dev server (`localhost:3000`, `mise run frontend`) | Global Firebase CDN | [`firebase`](../../.agents/skills/firebase/SKILL.md) |
| **gcloud CLI & Auth** | • [Google Cloud SDK](https://cloud.google.com/sdk) | Cloud CLI management & Application Default Credentials | Local `gcloud auth application-default login` | Cloud IAM Workload Identity | [`gcloud`](../../.agents/skills/gcloud/SKILL.md) |

---

## 2. Deep-Dive per Service & Codebase Mapping

---

### 2.1 Google Agent Development Kit (Google ADK)

* **Official Links:**
  * [Google ADK Documentation](https://google.github.io/agent-development-kit/)
  * [Google ADK GitHub Repository](https://github.com/google/agent-development-kit)
* **What is it?**
  Google's official framework for building, evaluating, and deploying production-grade AI agents and multi-agent systems with tool-calling capabilities.
* **How is it used in this project?**
  * Controls the **Orchestrator Agent** ([`backend/agents/orchestrator.py`](../../backend/agents/orchestrator.py)) managing the 4-phase incident lifecycle:
    1. **Phase A (Detection)**: [`quality_inspector.py`](../../backend/agents/quality_inspector.py) detects SPC UCL breach.
    2. **Phase B (Tracing & RCA)**: [`traceability.py`](../../backend/agents/traceability.py) runs first, followed by [`process_analyst.py`](../../backend/agents/process_analyst.py) and [`root_cause.py`](../../backend/agents/root_cause.py) with RAG.
    3. **Phase C (Resolution)**: [`technician_copilot.py`](../../backend/agents/technician_copilot.py) guides physical repair; [`incident_scribe.py`](../../backend/agents/incident_scribe.py) drafts 8D & SOPs; [`quality_inspector.py`](../../backend/agents/quality_inspector.py) gatekeeps 50 consecutive good parts.
    4. **Phase D (Learning)**: [`continuous_learning.py`](../../backend/agents/continuous_learning.py) computes sustainability metrics & updates knowledge library.
* **How to run locally?**
  Runs natively via Python:
  ```bash
  mise run backend  # Starts FastAPI + ADK agents on port 8000
  ```
* **How it runs after deployment?**
  Packaged in the backend container on **Google Cloud Run**, triggered asynchronously by HTTP requests or Pub/Sub push endpoints.
* **Pricing & Free Tier:**
  * **100% Free** (Open-source SDK). Charges are incurred solely on the underlying Gemini model token consumption.

---

### 2.2 Gemma 3 Edge (Open-Source Edge Model)

* **Official Links:**
  * [Gemma Official Homepage](https://ai.google.dev/gemma)
  * [Gemma Documentation & Models](https://ai.google.dev/gemma/docs)
* **What is it?**
  Google's lightweight open-source model family (Gemma 2B/9B, PaliGemma) running on edge computing hardware.
* **How is it used in this project?**
  * Implemented in [`backend/edge/gateway/`](../../backend/edge/gateway):
    * `gemma_classifier.py`: Real-time pass/fail defect pre-classification from inspection cameras.
    * `edge_filter.py`: Drops ~95%–99% of normal product frames so sensitive factory images never leave the on-premise network.
    * `mqtt_bridge.py`: Dispatches defect frames and telemetry anomalies over MQTT/PubSub.
* **How to run locally?**
  * **Option 1 (Simulated)**: Run the built-in edge simulator [`backend/edge/simulator/`](../../backend/edge/simulator) (zero installation required).
  * **Option 2 (Real Model)**: Run locally via Ollama:
    ```bash
    ollama run gemma:2b
    ```
* **Pricing & Free Tier:**
  * **$0 Cloud Cost**. 100% free open weights; executes purely on edge hardware.

---

### 2.3 Gemini 2.0 Multimodal Models (Vertex AI / Google AI Studio)

* **Official Links & Pricing:**
  * [Vertex AI Generative AI Homepage](https://cloud.google.com/vertex-ai/generative-ai)
  * [Google AI Studio Homepage](https://aistudio.google.com/)
  * [Vertex AI Pricing Page](https://cloud.google.com/vertex-ai/generative-ai/pricing)
  * [Google AI Studio Pricing Page](https://ai.google.dev/pricing)
* **What is it?**
  Google's state-of-the-art multimodal reasoning models (Gemini 2.0 Flash / Pro) supporting image, audio, video, and complex structured reasoning.
* **How is it used in this project?**
  * **Quality Inspector**: Fine-grained defect classification (scratches, burrs, short fills), coordinates, and severity metrology.
  * **Process Analyst**: Sensor correlation (vibration spikes, current drift).
  * **Root Cause Agent**: Formulates 5-Whys and Ishikawa fishbone diagrams with confidence scores.
  * **Incident Scribe**: Drafts formal 8D reports, Work Orders, and SOP proposals.
* **How to run locally?**
  Configure your free API key in `mise.local.toml` or environment:
  ```toml
  [env]
  GEMINI_API_KEY = "AIzaSy..."
  ```
* **How it runs after deployment?**
  On Cloud Run, authenticates with Vertex AI automatically using IAM Workload Identity without API keys (`GOOGLE_GENAI_USE_VERTEXAI="true"`).
* **Pricing & Free Tier:**
  * **Google AI Studio**: Free rate-limited tier (up to 15 RPM).
  * **Vertex AI**: Gemini 2.0 Flash at ~$0.075 – $0.15 / 1M input tokens. Running ~200 defect incidents/day costs **< $2.00 / month**.

---

### 2.4 Gemini Live API (Real-Time Audio + Video Streaming)

* **Official Links & Pricing:**
  * [Multimodal Live API Documentation](https://ai.google.dev/gemini-api/docs/multimodal-live)
  * [Gemini API Pricing Page](https://ai.google.dev/pricing)
* **What is it?**
  Gemini's low-latency, bidirectional WebSocket API for real-time conversational voice and video interactions.
* **How is it used in this project?**
  * Powers the **Technician Copilot** ([`backend/agents/technician_copilot.py`](../../backend/agents/technician_copilot.py) and [`backend/api/routes_gemini_live.py`](../../backend/api/routes_gemini_live.py)).
  * Technicians talk via smartphone in Vietnamese (*"Máy CNC-02 bị gì, sửa thế nào?"*).
  * Gemini watches the live camera feed and provides conversational, cited step-by-step guidance.
  * Facilitates the evidence-gathering loop: asks the technician for close-up photos when RCA confidence is < 70%.
* **How to run locally?**
  Connects via WebSocket to Google AI Studio's Live API endpoint using `GEMINI_API_KEY`.
* **How it runs after deployment?**
  Firebase Frontend establishes a WebSocket session proxied through Cloud Run or directly to the Vertex AI Live endpoint.
* **Pricing & Free Tier:**
  * Free during preview / AI Studio quotas. Production audio rate: ~$0.002/min audio, ~$0.002/min video. Typical repair session costs **< $0.05**.

---

### 2.5 Gemini Video Understanding

* **Official Links & Pricing:**
  * [Gemini Video Prompting Guide](https://ai.google.dev/gemini-api/docs/video)
  * [Vertex AI Pricing Page](https://cloud.google.com/vertex-ai/generative-ai/pricing)
* **What is it?**
  Native temporal multimodal processing of full video clips without manual frame extraction.
* **How is it used in this project?**
  * Powers the **Continuous Learning Agent** ([`backend/agents/continuous_learning.py`](../../backend/agents/continuous_learning.py)).
  * Ingests 2-minute expert technician repair demonstration videos from [`data/knowledge_base/expert_videos/`](../../data/knowledge_base/expert_videos), converting tacit physical skills into structured SOP documentation stored in the knowledge base.
* **Pricing & Free Tier:**
  * ~$0.002 per minute of video. 50 videos/month costs **~ $0.20**.

---

### 2.6 Vertex AI Search / RAG

* **Official Links & Pricing:**
  * [Vertex AI Search Homepage](https://cloud.google.com/enterprise-search)
  * [Vertex AI Agent Builder Overview](https://cloud.google.com/generative-ai-app-builder/docs/builder-overview)
  * [Vertex AI Search & App Builder Pricing](https://cloud.google.com/generative-ai-app-builder/pricing)
* **What is it?**
  Managed enterprise document search providing semantic retrieval over manuals, logs, and 8D reports with strict source citations.
* **How is it used in this project?**
  * Accessed through the ADK tool [`backend/tools/rag_search_tool.py`](../../backend/tools/rag_search_tool.py).
  * Root Cause Agent and Technician Copilot query this tool for verifiable citations (e.g., *"CNC manual p. 112"*, *"maint_log T07"*).
* **How to run locally?**
  * `rag_search_tool.py` includes local vector/mock retrieval over [`data/knowledge_base/manuals/`](../../data/knowledge_base/manuals) and [`past_8d_reports/`](../../data/knowledge_base/past_8d_reports).
* **How it runs after deployment?**
  Connects to the Vertex AI Search Data Store configured in GCP via `google-cloud-discoveryengine`.
* **Pricing:**
  * ~$1.50 – $2.00 per 1,000 queries. ~200 queries/month costs **~ $0.30 – $0.40**.

---

### 2.7 Google Cloud Firestore & In-Memory Blackboard

* **Official Links & Pricing:**
  * [Cloud Firestore Homepage](https://cloud.google.com/firestore)
  * [Cloud Firestore Pricing Page](https://cloud.google.com/firestore/pricing)
* **What is it?**
  Serverless real-time NoSQL document database used as the **Shared Incident State ("Blackboard")**.
* **How is it used in this project?**
  * Schema defined in [`data/schemas/firestore_blackboard.json`](../../data/schemas/firestore_blackboard.json) and Pydantic models in [`backend/core/models.py`](../../backend/core/models.py).
  * Implemented in [`backend/core/blackboard.py`](../../backend/core/blackboard.py). Every agent writes structured findings (`finding`, `evidence`, `confidence`, `citation`) to this board.
  * Streams changes to the frontend via Server-Sent Events (SSE) at `/api/incidents/stream`.
* **How to run locally?**
  * **Built-in Reactive Blackboard**: [`backend/core/blackboard.py`](../../backend/core/blackboard.py) runs an in-memory asynchronous queue with zero setup.
  * **Optional Docker Emulator**: If full Firestore SDK emulation is desired:
    ```bash
    docker run -d --name firestore-emulator -p 8080:8080 \
      google/cloud-sdk:emulators gcloud beta emulators firestore start --host-port=0.0.0.0:8080
    ```
* **Pricing & Free Tier:**
  * **Free Tier**: **50,000 reads, 20,000 writes/day free**. Operational cost: **$0.00 (within Free Tier)**.

---

### 2.8 Google BigQuery & `goccy/bigquery-emulator`

* **Official Links & Pricing:**
  * [Google BigQuery Homepage](https://cloud.google.com/bigquery)
  * [Google BigQuery Pricing Page](https://cloud.google.com/bigquery/pricing)
  * [goccy/bigquery-emulator on GitHub](https://github.com/goccy/bigquery-emulator)
* **What is it?**
  Serverless enterprise data warehouse storing discrete traceability topology, high-frequency machine sensors, and impact metrics.
* **How is it used in this project?**
  * DDL schema defined in [`data/schemas/bigquery_tables.sql`](../../data/schemas/bigquery_tables.sql):
    * `manufacturing.traceability`: Product ID, machine, tool, lot, operator.
    * `manufacturing.sensor_telemetry`: Vibration, temperature, current, RPM.
    * `manufacturing.sustainability_impact`: Avoided scrap, CO₂, energy, downtime.
  * Queried by [`backend/tools/bigquery_tool.py`](../../backend/tools/bigquery_tool.py).
* **How to run locally with `goccy/bigquery-emulator`?**
  Already integrated into [`docker-compose.yml`](../../docker-compose.yml) and [`mise.toml`](../../mise.toml):
  ```bash
  # Start emulator on port 9050
  mise run emulator
  # Or: docker compose up -d bigquery-emulator
  ```
  * **Automatic Mock Fallback**: As defined in Key Invariant 4 ([`AGENTS.md`](../../AGENTS.md#L206)), if neither the emulator nor GCP credentials exist, `bigquery_tool.py` automatically falls back to in-memory mock data from [`data/datasets/mock_traceability.csv`](../../data/datasets/mock_traceability.csv). Local dev never fails due to missing credentials.
* **How it runs after deployment?**
  Connects to production BigQuery dataset (`manufacturing`) using standard Cloud IAM credentials (ADC).
* **Pricing & Free Tier:**
  * **Free Tier**: **1 TB queries analyzed/month free**, 10 GB storage free. Scoped queries by machine and time window scan mere megabytes per incident (**$0.00 / month**).

---

### 2.9 Google Cloud Run

* **Official Links & Pricing:**
  * [Google Cloud Run Homepage](https://cloud.google.com/run)
  * [Google Cloud Run Pricing Page](https://cloud.google.com/run/pricing)
* **What is it?**
  Serverless container platform hosting the FastAPI backend, ADK multi-agent orchestrator, and WebSocket handlers.
* **How to run locally?**
  ```bash
  mise run backend  # Runs uvicorn on port 8000
  ```
* **How it runs after deployment?**
  Deployed directly from source via `gcloud run deploy`:
  ```bash
  gcloud run deploy kaizen-backend \
    --source . \
    --region asia-southeast1 \
    --allow-unauthenticated
  ```
* **Pricing & Free Tier:**
  * **Free Tier**: **2 million requests/month free**, 360,000 vCPU-seconds free. Pilot cost: **$0.00 / month**.

---

### 2.10 Firebase Hosting

* **Official Links & Pricing:**
  * [Firebase Hosting Homepage](https://firebase.google.com/products/hosting)
  * [Firebase Pricing Page](https://firebase.google.com/pricing)
* **What is it?**
  Fast and secure hosting for the React + Vite + TypeScript dashboard ([`frontend/`](../../frontend)).
* **How to run locally?**
  ```bash
  mise run frontend  # Runs Vite dev server on port 3000
  ```
* **How it runs after deployment?**
  Deployed via `firebase deploy --only hosting`. Rewrites `/api/**` calls directly to Cloud Run.
* **Pricing & Free Tier:**
  * **Free Tier**: **10 GB storage, 360 MB/day transfer free**.

---

## 3. Environment Configuration & Tooling (`mise`)

The project uses [`mise`](https://mise.jdx.dev) for managing toolchains (Python 3.11, Node 22) and local tasks.

### 3.1 Local Settings Override (`mise.local.toml`)
Create `mise.local.toml` at the project root for local development:

```toml
[env]
APP_ENV                  = "development"
GCP_PROJECT_ID           = "kaizen-local"
GCP_REGION               = "asia-southeast1"

# Target local BigQuery emulator on port 9050
BIGQUERY_EMULATOR_HOST   = "http://localhost:9050"
BIGQUERY_DATASET         = "manufacturing"

# Model access (Free AI Studio key for local testing)
GEMINI_API_KEY           = "AIzaSy..."
GOOGLE_GENAI_USE_VERTEXAI= "false"
```

### 3.2 Cloud Run Production Configuration
In Cloud Run, omit emulator variables; Google SDKs automatically use Application Default Credentials (ADC):

```bash
APP_ENV="production"
GCP_PROJECT_ID="kaizen-agent-prod"
GCP_REGION="asia-southeast1"
BIGQUERY_DATASET="manufacturing"

# Omit BIGQUERY_EMULATOR_HOST -> SDK connects to real BigQuery
# Omit GEMINI_API_KEY -> SDK uses Vertex AI with Cloud IAM
GOOGLE_GENAI_USE_VERTEXAI="true"
```

---

## 4. Key Developer Tasks (`mise`)

| Command | Action |
|---|---|
| `mise run install` | Installs Python backend packages & frontend npm dependencies |
| `mise run dev` | Runs backend (:8000) and frontend (:3000) in parallel |
| `mise run emulator` | Spawns `goccy/bigquery-emulator` Docker container on port 9050 |
| `mise run seed` | Seeds mock traceability data into BigQuery / emulator |
| `mise run demo` | Triggers synthetic defect injection to test the full 90s incident loop |
| `mise run test` | Executes backend test suite |
| `mise run docker:up` | Runs backend, frontend, and emulator via `docker-compose.yml` |

---

## 5. Cost Summary Projection

| Stage | Data Scale | Cloud Cost / Month |
|---|---|---|
| **Hackathon Demo** | Synthetic datasets (MVTec AD, AI4I, mock traceability) | **$0.00** (Fits 100% within Free Tiers & Emulators) |
| **Pilot Line (1 Line)** | ~10,000 parts/day, ~2% defects (~200 defect incidents/day) | **~$30 – $50 / month** |
| **Medium Factory (5 Lines)** | ~50,000 parts/day, continuous operations | **~$120 – $200 / month** |

*Cost Rationale*: Gemma 3 Edge pre-filters >95% of images locally; BigQuery queries are narrowly scoped to suspect machines and 30-minute time windows; and the Firestore Blackboard manages incident state transitions rather than raw high-frequency telemetry.
