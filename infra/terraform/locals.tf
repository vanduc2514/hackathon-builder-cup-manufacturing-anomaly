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

  # Globally unique names (GCS buckets, Firebase Hosting sites) use global_prefix;
  # project-scoped names use the plain kaizen- prefix.
  kb_bucket = "${var.global_prefix}-kb"

  # firebase.json hosting target => site ID (apps/web, apps/mobile).
  hosting_sites = {
    web    = "${var.global_prefix}-web"
    mobile = "${var.global_prefix}-mobile"
  }
  runtime_member = "serviceAccount:${google_service_account.backend.email}"
}
