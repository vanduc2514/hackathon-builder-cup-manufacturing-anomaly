---
name: firestore-blackboard
metadata:
  version: "1.0.0"
  category: StateManagement
description: >-
  Guides setup, reactive state management, and troubleshooting for the Blackboard architecture
  and Cloud Firestore in Kaizen Agent. Use when modifying backend/core/blackboard.py, updating
  incident schemas (firestore_blackboard.json), debugging SSE stream latency (/api/incidents/stream),
  or running the local Firestore emulator.
---

# Firestore & Reactive Blackboard State Skill

The Blackboard is the shared reactive state bus of the Kaizen Agent multi-agent system. Agents communicate exclusively by publishing findings to and observing updates from this shared memory.

## Cloud Firestore Architecture & Client SDK

- **Service Overview**: Serverless NoSQL document database in Native Mode used as the real-time shared incident state bus.
- **Python Client SDK**: `google-cloud-firestore` (`pip install google-cloud-firestore`).
- **Data Model**: Hierarchical document model with root `/incidents/{incident_id}` and nested `/findings` collections.
- **Local Emulator**: Starts via Google Cloud SDK (`gcloud beta emulators firestore start --host-port=0.0.0.0:8080`) targeting `FIRESTORE_EMULATOR_HOST=localhost:8080`.

## Key Directives & Invariants

1. **Blackboard Exclusivity**: No direct agent-to-agent function calls. All communication flows through the shared Blackboard reactive state bus (Key Invariant 2).
2. **Schema Authority**: State mutations must match the core Pydantic domain models and the shared Firestore document structure (Key Invariant 1).

## Key References

- **SSE Protocol & Streaming**: FastAPI Server-Sent Events architecture at `/api/incidents/stream`. See [references/reactive-sse.md](references/reactive-sse.md)

---

## 1. Local Development vs Production Firestore

### Option 1: In-Memory Async Blackboard (Default Local Dev)
For rapid local testing, the in-memory blackboard runs an asynchronous `asyncio.Queue` event bus. Zero configuration or external containers required.

### Option 2: Local Firestore Docker Emulator
To test full Firestore SDK semantics locally:
```bash
docker run -d --name firestore-emulator -p 8080:8080 \
  google/cloud-sdk:emulators gcloud beta emulators firestore start --host-port=0.0.0.0:8080
```
Set environment:
```toml
FIRESTORE_EMULATOR_HOST = "localhost:8080"
```

### Option 3: Production Cloud Firestore
On Cloud Run:
- Automatically uses Cloud Firestore (Native Mode) in Google Cloud project `GCP_PROJECT_ID`.
- Uses Google Cloud IAM Application Default Credentials (ADC).

---

## 2. Blackboard Programming Pattern

```python
from backend.core.blackboard import blackboard
from backend.core.models import AgentFinding

# Agent posting a finding to the blackboard
await blackboard.post_finding(
    incident_id="inc-20261006-001",
    finding=AgentFinding(
        agent_name="quality_inspector",
        phase="PHASE_A_DETECTION",
        summary="SPC UCL breached: defect rate 4.8% on CNC-02",
        confidence=0.96,
        evidence={"samples_checked": 100, "defects": 5}
    )
)
```

---

## 3. Troubleshooting Guide

| Issue | Root Cause | Fix |
|---|---|---|
| SSE Stream drops in browser | Long idle time triggering gateway timeout | Ensure backend sends heartbeat comments (`: keep-alive\n\n`) every 15s |
| `KeyError` on incident lookup | Incident ID mismatch or uninitialized board | Orchestrator must call `blackboard.create_incident(...)` before posting findings |
| Memory leak in subscriber queues | Client disconnect didn't unsubscribe queue | Verify `finally: blackboard.unsubscribe(queue)` runs on disconnect |
| Firestore 403 Permission Denied | Missing `Cloud Datastore User` IAM role | Grant `roles/datastore.user` to the Cloud Run service account |
