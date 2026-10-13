resource "google_pubsub_topic" "topics" {
  for_each = local.pubsub

  name = each.key

  depends_on = [google_project_service.apis]
}

resource "google_pubsub_subscription" "subs" {
  for_each = local.pubsub

  name  = each.value
  topic = google_pubsub_topic.topics[each.key].id

  depends_on = [google_project_service.apis]
}
