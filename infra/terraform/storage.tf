# Staging bucket for the knowledge-base import (scripts/import_knowledge_base.py).
resource "google_storage_bucket" "kb" {
  name                        = "${var.project_id}-kaizen-kb"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  depends_on = [google_project_service.apis]
}

resource "google_project_service_identity" "discoveryengine" {
  provider = google-beta

  service = "discoveryengine.googleapis.com"

  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "kb_discoveryengine_reader" {
  bucket = google_storage_bucket.kb.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_project_service_identity.discoveryengine.email}"
}
