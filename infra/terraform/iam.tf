resource "google_service_account" "backend" {
  account_id   = "kaizen-backend-sa"
  display_name = "Kaizen Agent Backend (Cloud Run)"

  depends_on = [time_sleep.apis_ready]
}

# Project-level runtime roles for the Cloud Run service account (least privilege; the app
# creates no resources, Terraform owns them):
# - aiplatform.user        Gemini on Vertex AI
# - discoveryengine.viewer Vertex AI Search servingConfigs.search
# - bigquery.jobUser       run query/DDL jobs (dataset access: bigquery.tf)
# - datastore.user         Firestore incidents collection
# - logging.logWriter      Cloud Logging
# Pub/Sub publish/subscribe rights are granted per topic/subscription in pubsub.tf.
resource "google_project_iam_member" "runtime" {
  for_each = toset([
    "roles/aiplatform.user",
    "roles/discoveryengine.viewer",
    "roles/bigquery.jobUser",
    "roles/datastore.user",
    "roles/logging.logWriter",
  ])

  project = var.project_id
  role    = each.value
  member  = local.runtime_member

  depends_on = [time_sleep.apis_ready]
}
