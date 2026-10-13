resource "google_service_account" "backend" {
  account_id   = "kaizen-backend-sa"
  display_name = "Kaizen Agent Backend (Cloud Run)"

  depends_on = [google_project_service.apis]
}

# Runtime roles for the Cloud Run service account:
# - aiplatform.user        Gemini on Vertex AI
# - discoveryengine.viewer Vertex AI Search servingConfigs.search
# - bigquery.user          query jobs + datasets.create (seed_bigquery create_dataset exists_ok)
# - datastore.user         Firestore incidents collection
# - pubsub.editor          pubsub_manager creates topics/subscriptions at startup
# - logging.logWriter      Cloud Logging
resource "google_project_iam_member" "runtime" {
  for_each = toset([
    "roles/aiplatform.user",
    "roles/discoveryengine.viewer",
    "roles/bigquery.user",
    "roles/datastore.user",
    "roles/pubsub.editor",
    "roles/logging.logWriter",
  ])

  project = var.project_id
  role    = each.value
  member  = local.runtime_member

  depends_on = [google_project_service.apis]
}
