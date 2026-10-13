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

  # Topic => subscription; must match the defaults in backend/core/config.py.
  pubsub = {
    telemetry        = "telemetry-sub"
    traceability     = "traceability-sub"
    "quality-events" = "quality-events-sub"
  }

  # firebase.json hosting target => site ID (apps/web, apps/mobile).
  hosting_site_prefix = coalesce(var.hosting_site_prefix, var.project_id)
  hosting_sites = {
    web    = "${local.hosting_site_prefix}-web"
    mobile = "${local.hosting_site_prefix}-mobile"
  }
  runtime_member = "serviceAccount:${google_service_account.backend.email}"
}
