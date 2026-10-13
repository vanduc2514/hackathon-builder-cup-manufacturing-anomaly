resource "google_project_service" "apis" {
  for_each = toset(local.apis)

  service            = each.value
  disable_on_destroy = false
}

# Newly enabled APIs take a while to propagate; creating resources right after enablement
# fails with SERVICE_DISABLED on a fresh project. Everything else depends on this gate.
resource "time_sleep" "apis_ready" {
  create_duration = "60s"

  depends_on = [google_project_service.apis]
}
