resource "google_pubsub_topic" "topics" {
  for_each = local.pubsub

  name = each.key

  depends_on = [time_sleep.apis_ready]
}

resource "google_pubsub_subscription" "subs" {
  for_each = local.pubsub

  name  = each.value
  topic = google_pubsub_topic.topics[each.key].id

  # Without a retry policy a nacked message is redelivered immediately, so one failing
  # handler turns the backlog into a hot loop on the single backend instance.
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  depends_on = [time_sleep.apis_ready]
}

# The backend publishes (simulation inject) and streaming-pulls only these resources.
resource "google_pubsub_topic_iam_member" "runtime_publisher" {
  for_each = google_pubsub_topic.topics

  topic  = each.value.name
  role   = "roles/pubsub.publisher"
  member = local.runtime_member
}

resource "google_pubsub_subscription_iam_member" "runtime_subscriber" {
  for_each = google_pubsub_subscription.subs

  subscription = each.value.name
  role         = "roles/pubsub.subscriber"
  member       = local.runtime_member
}

# --- Pub/Sub -> BigQuery direct sinks (issue #331) -------------------------------
# Telemetry and traceability messages are flat table rows (see
# backend/tools/bigquery_tool.py build_sensor_telemetry_row / build_traceability_row)
# so these subscriptions write them without the backend running. The backend only
# subscribes to these topics on the local emulator; quality-events stays a pull
# subscription (it triggers the Orchestrator).
data "google_project" "current" {}

locals {
  bq_sink_tables = {
    "kaizen-telemetry"    = "${var.project_id}:${var.bigquery_dataset}.sensor_telemetry"
    "kaizen-traceability" = "${var.project_id}:${var.bigquery_dataset}.traceability"
  }
  pubsub_sink_member = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_pubsub_subscription" "bq_sinks" {
  for_each = local.bq_sink_tables

  name  = "${each.key}-bq"
  topic = google_pubsub_topic.topics[each.key].id

  bigquery_config {
    table            = each.value
    use_table_schema = true
    write_metadata   = false
  }

  depends_on = [time_sleep.apis_ready, google_bigquery_dataset_iam_member.pubsub_sink]
}

# The Pub/Sub service agent writes the sink rows into the dataset.
resource "google_bigquery_dataset_iam_member" "pubsub_sink" {
  dataset_id = google_bigquery_dataset.manufacturing.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = local.pubsub_sink_member
}
