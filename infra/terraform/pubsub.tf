resource "google_pubsub_topic" "topics" {
  for_each = local.pubsub

  name = each.key

  depends_on = [time_sleep.apis_ready]
}

resource "google_pubsub_subscription" "subs" {
  for_each = local.pubsub

  name  = each.value
  topic = google_pubsub_topic.topics[each.key].id

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
