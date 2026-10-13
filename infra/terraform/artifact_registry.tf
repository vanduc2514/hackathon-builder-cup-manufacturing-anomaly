resource "google_artifact_registry_repository" "backend" {
  location               = var.region
  repository_id          = var.artifact_repo
  format                 = "DOCKER"
  description            = "Container repository for Kaizen Agent"
  cleanup_policy_dry_run = false

  # Stay inside the 0.5 GB free tier; KEEP takes precedence over DELETE.
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 3
    }
  }

  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "604800s"
    }
  }

  depends_on = [time_sleep.apis_ready]
}
