# Staging bucket for the knowledge-base import (scripts/import_knowledge_base.py).
resource "google_storage_bucket" "kb" {
  name                        = local.kb_bucket
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  depends_on = [time_sleep.apis_ready]
}

resource "google_project_service_identity" "discoveryengine" {
  provider = google-beta

  service = "discoveryengine.googleapis.com"

  depends_on = [time_sleep.apis_ready]
}

# The Discovery Engine service agent is provisioned lazily, on the first data store;
# binding it earlier fails with "service account ... does not exist".
resource "google_storage_bucket_iam_member" "kb_discoveryengine_reader" {
  bucket = google_storage_bucket.kb.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_project_service_identity.discoveryengine.email}"

  depends_on = [google_discovery_engine_data_store.kb]
}

# The backend runtime uploads approved incident documents (#333) and
# Continuous Learning write-back entries (#334) to this bucket.
resource "google_storage_bucket_iam_member" "kb_runtime_writer" {
  bucket = google_storage_bucket.kb.name
  role   = "roles/storage.objectUser"
  member = local.runtime_member
}
