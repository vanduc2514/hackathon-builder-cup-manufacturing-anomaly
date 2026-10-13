output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "service_name" {
  value = google_cloud_run_v2_service.backend.name
}

output "service_url" {
  description = "Cloud Run backend URL."
  value       = google_cloud_run_v2_service.backend.uri
}

output "runtime_service_account_email" {
  description = "Share the Google Drive folder with this account for hybrid RAG."
  value       = google_service_account.backend.email
}

output "artifact_repo_url" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_repo}"
}

output "bigquery_dataset" {
  value = google_bigquery_dataset.manufacturing.dataset_id
}

output "kb_bucket" {
  description = "Staging bucket for scripts/import_knowledge_base.py."
  value       = google_storage_bucket.kb.name
}

output "hosting_sites" {
  description = "Firebase Hosting site ID per firebase.json target (web, mobile)."
  value       = { for target, site in google_firebase_hosting_site.apps : target => site.site_id }
}

output "hosting_urls" {
  value = local.hosting_urls
}
