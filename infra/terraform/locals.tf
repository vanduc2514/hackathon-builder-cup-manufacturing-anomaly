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
  hosting_urls = { for target, site in local.hosting_sites : target => "https://${site}.web.app" }

  # Browser origins that open SSE/WebSocket directly against Cloud Run (CORS_ORIGINS).
  cors_origins = join(",", flatten([
    for site in values(local.hosting_sites) : ["https://${site}.web.app", "https://${site}.firebaseapp.com"]
  ]))

  runtime_member = "serviceAccount:${google_service_account.backend.email}"
}
