# Tables are not managed here: data/schemas/bigquery_tables.sql is the single schema
# source, applied by `mise run infra:seed` and /api/simulation/reset.
resource "google_bigquery_dataset" "manufacturing" {
  dataset_id                 = var.bigquery_dataset
  location                   = var.region
  delete_contents_on_destroy = false

  depends_on = [time_sleep.apis_ready]
}

# Table create/insert/query inside the dataset (DDL in seed_bigquery, streaming inserts).
resource "google_bigquery_dataset_iam_member" "runtime_editor" {
  dataset_id = google_bigquery_dataset.manufacturing.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = local.runtime_member
}
