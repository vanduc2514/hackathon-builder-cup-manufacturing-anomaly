output "state_bucket" {
  description = "GCS bucket holding the main stack's Terraform state."
  value       = google_storage_bucket.tfstate.name
}
