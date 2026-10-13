locals {
  apis = [for api in [
    "run",
    "artifactregistry",
    "aiplatform",
    "discoveryengine",
    "bigquery",
    "firestore",
    "pubsub",
    "storage",
    "logging",
    "iam",
    "cloudresourcemanager",
    "serviceusage",
    "drive",
    "firebase",
    "firebasehosting",
    "billingbudgets",
  ] : "${api}.googleapis.com"]

  # Topic => subscription; passed to Cloud Run as PUBSUB_* env (backend/core/config.py).
  pubsub = {
    "kaizen-telemetry"      = "kaizen-telemetry-sub"
    "kaizen-traceability"   = "kaizen-traceability-sub"
    "kaizen-quality-events" = "kaizen-quality-events-sub"
  }

  # Globally unique names (GCS buckets, Firebase Hosting sites) carry the suffix.
  kb_bucket = "kaizen-kb-${var.name_suffix}"

  # firebase.json hosting target => site ID (apps/web, apps/mobile).
  hosting_sites = {
    web    = "kaizen-web-${var.name_suffix}"
    mobile = "kaizen-mobile-${var.name_suffix}"
  }
  runtime_member = "serviceAccount:${google_service_account.backend.email}"
}
