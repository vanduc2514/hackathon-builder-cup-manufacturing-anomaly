resource "google_firebase_project" "default" {
  provider = google-beta

  project = var.project_id

  depends_on = [time_sleep.apis_ready]
}

# One Hosting site per frontend app; firebase.json maps targets web/mobile to these sites.
resource "google_firebase_hosting_site" "apps" {
  provider = google-beta
  for_each = local.hosting_sites

  project = var.project_id
  site_id = each.value

  depends_on = [google_firebase_project.default]
}
