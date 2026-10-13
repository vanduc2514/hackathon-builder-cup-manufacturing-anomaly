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

resource "google_storage_bucket_iam_member" "kb_discoveryengine_reader" {
  bucket = google_storage_bucket.kb.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_project_service_identity.discoveryengine.email}"
}
