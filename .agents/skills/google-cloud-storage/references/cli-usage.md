# Cloud Storage CLI Usage (`gcloud storage`)

Prefer the modern `gcloud storage` CLI over legacy `gsutil` for all operations. `gcloud storage` provides faster parallel uploads, automatic CRC32C integrity validation, and native integration with Cloud IAM.

## Bucket Management

### Create Bucket with Uniform Bucket-Level Access
```bash
gcloud storage buckets create gs://kaizen-media-prod \
  --location=asia-southeast1 \
  --default-storage-class=STANDARD \
  --uniform-bucket-level-access
```

### List Buckets
```bash
gcloud storage buckets list
```

### Bucket Inspection & Metadata
```bash
gcloud storage buckets describe gs://kaizen-media-prod
```

---

## Object Operations

### Upload Files and Directories
```bash
# Upload single expert repair video
gcloud storage cp data/knowledge_base/expert_videos/cnc_bearing_greasing.mp4 gs://kaizen-media-prod/expert_videos/

# Recursive upload with parallel transfer
gcloud storage cp -r data/knowledge_base/manuals/ gs://kaizen-media-prod/manuals/
```

### Download Objects
```bash
gcloud storage cp gs://kaizen-media-prod/manuals/cnc_lathe_manual.pdf ./local_manual.pdf
```

### List Objects with Prefix
```bash
gcloud storage ls gs://kaizen-media-prod/expert_videos/
```

### Delete Object
```bash
gcloud storage rm gs://kaizen-media-prod/temp/old_capture.jpg
```

---

## Access Control & IAM

### Grant Cloud Run Service Account Read/Write Permissions
```bash
export SERVICE_ACCOUNT="kaizen-backend-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

# Grant object creation and reading rights
gcloud storage buckets add-iam-policy-binding gs://kaizen-media-prod \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/storage.objectAdmin"
```

### Allow Public Read Access for Public Web Assets (Optional)
```bash
gcloud storage buckets add-iam-policy-binding gs://kaizen-media-prod \
  --member="allUsers" \
  --role="roles/storage.objectViewer"
```

---

## Signed URLs for Mobile Technician Uploads

Generate a time-limited signed URL allowing on-floor technicians to upload video clips directly from smartphones without embedding service account keys:

```bash
gcloud storage sign-url gs://kaizen-media-prod/expert_videos/incoming_video.mp4 \
  --duration=15m \
  --http-verb=PUT
```
