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

  hosting_site_id = coalesce(var.hosting_site_id, "${var.project_id}-kaizen")
  runtime_member  = "serviceAccount:${google_service_account.backend.email}"
}
