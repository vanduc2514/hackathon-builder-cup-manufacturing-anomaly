---
name: google-cloud-storage
metadata:
  version: "1.0.0"
  category: CloudStorageAndMedia
description: >-
  Manages Google Cloud Storage (GCS) buckets, object lifecycle, media assets, and signed URLs in Kaizen Agent.
  Use when provisioning storage buckets (gs://), uploading expert technician repair videos (data/knowledge_base/expert_videos/),
  storing raw inspection camera defect frames, staging documents for Vertex AI Search, or configuring IAM and signed upload URLs.
---

# Google Cloud Storage Skill

Google Cloud Storage (GCS) provides highly durable, scalable object storage for binary media assets in Kaizen Agent. Because Cloud Run containers are stateless with ephemeral file systems, all long-lived video clips, camera defect imagery, and RAG knowledge base PDFs reside in Cloud Storage buckets.

## Architecture & Codebase Mapping

- **Continuous Learning SOP Videos**: [`backend/agents/continuous_learning.py`](../../backend/agents/continuous_learning.py) ingests expert technician repair videos from [`data/knowledge_base/expert_videos/`](../../data/knowledge_base/expert_videos) stored in `gs://kaizen-media/expert_videos/`.
- **Defect Camera Snapshots**: Edge camera gateway dispatches anomalous cup frames to `gs://kaizen-datasets/defects/` for 8D evidence attachment and continuous fine-tuning.
- **RAG Knowledge Base Staging**: Technical manuals and 8D reports staged in `gs://kaizen-knowledge/` for indexing into Vertex AI Search.
- **BigQuery Backup & Export**: Raw sensor telemetry batch dumps.

## Key Capabilities & References

- **CLI Usage (`gcloud storage`)**: Creating buckets, uploading objects, setting CORS and IAM. See [references/cli-usage.md](references/cli-usage.md)
- **Python Client Library**: `google-cloud-storage` SDK patterns for uploading video clips and generating signed URLs. See [references/client-library-usage.md](references/client-library-usage.md)
- **Core Concepts & Storage Classes**: Standard vs Nearline/Coldline, naming rules, uniform bucket-level access (UBLA). See [references/core-concepts.md](references/core-concepts.md)

---

## 1. Quick Start Workflow

### Step 1: Create Application Buckets

```bash
# Set regional bucket for low latency and zero cross-region egress with Cloud Run
export BUCKET_NAME="kaizen-media-${GCP_PROJECT_ID:-dev}"
export REGION="asia-southeast1"

gcloud storage buckets create "gs://${BUCKET_NAME}" \
  --location="${REGION}" \
  --uniform-bucket-level-access
```

### Step 2: Upload Knowledge Base Videos and Manuals

```bash
# Upload expert video repair demonstrations
gcloud storage cp -r data/knowledge_base/expert_videos/ "gs://${BUCKET_NAME}/expert_videos/"

# Upload equipment manuals and past 8D reports
gcloud storage cp -r data/knowledge_base/manuals/ "gs://${BUCKET_NAME}/manuals/"
```

### Step 3: Configure CORS for Web Dashboard Video Streaming

Create `cors.json`:
```json
[
  {
    "origin": ["http://localhost:3000", "http://localhost:3001", "https://*.web.app", "https://*.firebaseapp.com"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Range"],
    "maxAgeSeconds": 3600
  }
]
```

Apply CORS configuration:
```bash
gcloud storage buckets update "gs://${BUCKET_NAME}" --cors-file=cors.json
```

---

## 2. Python Client Usage (`google-cloud-storage`)

```python
from google.cloud import storage

def upload_repair_video(local_path: str, destination_blob_name: str) -> str:
    """Uploads a technician repair video to GCS and returns its gs:// URI."""
    client = storage.Client()
    bucket = client.bucket("kaizen-media-prod")
    blob = bucket.blob(destination_blob_name)
    blob.upload_from_filename(local_path, content_type="video/mp4")
    return f"gs://{bucket.name}/{destination_blob_name}"
```

---

## 3. Local Development vs Cloud Parity

In accordance with **Key Invariant 4**:
- **Local Development**: By default, agents read local media files directly from [`data/knowledge_base/`](../../data/knowledge_base/) without requiring cloud storage or credentials.
- **Production (Cloud Run)**: Backend connects to GCS using Application Default Credentials (ADC) via IAM Workload Identity with `roles/storage.objectAdmin`.
