# Cloud Monitoring dashboard + alert policies for the production stack.
# Alerts email every user/group holding roles/owner on the project, read from the live IAM
# policy at plan time; owner changes reach the channels on the next apply.

data "google_project_iam_policy" "current" {
  project = var.project_id
}

locals {
  owner_emails = toset(flatten([
    for binding in jsondecode(data.google_project_iam_policy.current.policy_data).bindings : [
      for member in binding.members : split(":", member)[1]
      if startswith(member, "user:") || startswith(member, "group:")
    ] if binding.role == "roles/owner"
  ]))

  run_filter        = "resource.type=\"cloud_run_revision\" resource.label.service_name=\"${var.service_name}\""
  gemini_filter     = "resource.type=\"aiplatform.googleapis.com/PublisherModel\""
  vertex_api_filter = "resource.type=\"consumed_api\" resource.label.service=one_of(\"aiplatform.googleapis.com\",\"discoveryengine.googleapis.com\")"
  pubsub_filter     = "resource.type=\"pubsub_subscription\" resource.label.subscription_id=one_of(${join(",", [for sub in values(local.pubsub) : "\"${sub}\""])})"
  firestore_filter  = "resource.type=\"firestore.googleapis.com/Database\""
  topic_filter      = "resource.type=\"pubsub_topic\" resource.label.topic_id=one_of(${join(",", [for topic in keys(local.pubsub) : "\"${topic}\""])})"
  bigquery_filter   = "resource.type=\"bigquery_project\""

  # Python tracebacks on stderr are tagged ERROR by Cloud Run; plain logging lines carry no
  # severity, so `ERROR:`/`CRITICAL:` prefixes are matched on the text.
  error_log_filter = "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"${var.service_name}\" (severity>=ERROR OR textPayload=~\"^(ERROR|CRITICAL):\")"

  # One xyChart tile; dashboard JSON schema: monitoring/api/ref_v3/rest/v1/projects.dashboards.
  chart = {
    for name, c in {
      requests = {
        title   = "Cloud Run requests/s by status class", plot = "STACKED_BAR"
        filter  = "metric.type=\"run.googleapis.com/request_count\" ${local.run_filter}"
        aligner = "ALIGN_RATE", reducer = "REDUCE_SUM", group_by = ["metric.label.response_code_class"]
      }
      latency_p95 = {
        title   = "Cloud Run latency p95 (ms)", plot = "LINE"
        filter  = "metric.type=\"run.googleapis.com/request_latencies\" ${local.run_filter}"
        aligner = "ALIGN_PERCENTILE_95", reducer = "REDUCE_MAX", group_by = []
      }
      instances = {
        title   = "Cloud Run instances", plot = "LINE"
        filter  = "metric.type=\"run.googleapis.com/container/instance_count\" ${local.run_filter}"
        aligner = "ALIGN_MAX", reducer = "REDUCE_SUM", group_by = ["metric.label.state"]
      }
      startup = {
        title   = "Cloud Run startup latency p95 (ms)", plot = "LINE"
        filter  = "metric.type=\"run.googleapis.com/container/startup_latencies\" ${local.run_filter}"
        aligner = "ALIGN_PERCENTILE_95", reducer = "REDUCE_MAX", group_by = []
      }
      cpu = {
        title   = "Cloud Run CPU utilization p95", plot = "LINE"
        filter  = "metric.type=\"run.googleapis.com/container/cpu/utilizations\" ${local.run_filter}"
        aligner = "ALIGN_PERCENTILE_95", reducer = "REDUCE_MAX", group_by = []
      }
      memory = {
        title   = "Cloud Run memory utilization p95", plot = "LINE"
        filter  = "metric.type=\"run.googleapis.com/container/memory/utilizations\" ${local.run_filter}"
        aligner = "ALIGN_PERCENTILE_95", reducer = "REDUCE_MAX", group_by = []
      }
      # Every call the backend makes to the Vertex AI (Gemini) and Vertex AI Search APIs.
      vertex_api_requests = {
        title   = "Vertex AI / Vertex AI Search API requests/min by status", plot = "STACKED_BAR"
        filter  = "metric.type=\"serviceruntime.googleapis.com/api/request_count\" ${local.vertex_api_filter}"
        aligner = "ALIGN_DELTA", reducer = "REDUCE_SUM", group_by = ["resource.label.service", "metric.label.response_code_class"]
      }
      vertex_api_latency = {
        title   = "Vertex AI / Vertex AI Search API latency p95 (s)", plot = "LINE"
        filter  = "metric.type=\"serviceruntime.googleapis.com/api/request_latencies\" ${local.vertex_api_filter}"
        aligner = "ALIGN_PERCENTILE_95", reducer = "REDUCE_MAX", group_by = ["resource.label.service"]
      }
      gemini_calls = {
        title   = "Gemini invocations/min by model and response code", plot = "STACKED_BAR"
        filter  = "metric.type=\"aiplatform.googleapis.com/publisher/online_serving/model_invocation_count\" ${local.gemini_filter}"
        aligner = "ALIGN_DELTA", reducer = "REDUCE_SUM", group_by = ["resource.label.model_user_id", "metric.label.response_code"]
      }
      gemini_tokens = {
        title   = "Gemini tokens/min by type", plot = "STACKED_BAR"
        filter  = "metric.type=\"aiplatform.googleapis.com/publisher/online_serving/token_count\" ${local.gemini_filter}"
        aligner = "ALIGN_DELTA", reducer = "REDUCE_SUM", group_by = ["metric.label.type"]
      }
      gemini_latency = {
        title   = "Gemini invocation latency p95 (ms)", plot = "LINE"
        filter  = "metric.type=\"aiplatform.googleapis.com/publisher/online_serving/model_invocation_latencies\" ${local.gemini_filter}"
        aligner = "ALIGN_PERCENTILE_95", reducer = "REDUCE_MAX", group_by = ["resource.label.model_user_id"]
      }
      pubsub_backlog = {
        title   = "Pub/Sub undelivered messages", plot = "LINE"
        filter  = "metric.type=\"pubsub.googleapis.com/subscription/num_undelivered_messages\" ${local.pubsub_filter}"
        aligner = "ALIGN_MAX", reducer = "REDUCE_MAX", group_by = ["resource.label.subscription_id"]
      }
      pubsub_age = {
        title   = "Pub/Sub oldest unacked message age (s)", plot = "LINE"
        filter  = "metric.type=\"pubsub.googleapis.com/subscription/oldest_unacked_message_age\" ${local.pubsub_filter}"
        aligner = "ALIGN_MAX", reducer = "REDUCE_MAX", group_by = ["resource.label.subscription_id"]
      }
      pubsub_publish = {
        title   = "Pub/Sub publish requests/min by topic and status", plot = "STACKED_BAR"
        filter  = "metric.type=\"pubsub.googleapis.com/topic/send_request_count\" ${local.topic_filter}"
        aligner = "ALIGN_DELTA", reducer = "REDUCE_SUM", group_by = ["resource.label.topic_id", "metric.label.response_class"]
      }
      bq_queries = {
        title   = "BigQuery queries/min", plot = "STACKED_BAR"
        filter  = "metric.type=\"bigquery.googleapis.com/query/execution_count\" ${local.bigquery_filter}"
        aligner = "ALIGN_DELTA", reducer = "REDUCE_SUM", group_by = ["metric.label.caching_mode"]
      }
      # On-demand pricing bills these bytes; the main BigQuery cost driver.
      bq_billed_bytes = {
        title   = "BigQuery billed scanned bytes/min by statement", plot = "STACKED_BAR"
        filter  = "metric.type=\"bigquery.googleapis.com/query/statement_scanned_bytes_billed\" ${local.bigquery_filter}"
        aligner = "ALIGN_DELTA", reducer = "REDUCE_SUM", group_by = ["metric.label.statement_type"]
      }
      bq_inserted_rows = {
        title   = "BigQuery rows uploaded/min by table", plot = "STACKED_BAR"
        filter  = "metric.type=\"bigquery.googleapis.com/storage/uploaded_row_count\" resource.type=\"bigquery_dataset\" resource.label.dataset_id=\"${var.bigquery_dataset}\""
        aligner = "ALIGN_DELTA", reducer = "REDUCE_SUM", group_by = ["metric.label.table"]
      }
      bq_api_requests = {
        title   = "BigQuery API requests/min by status", plot = "STACKED_BAR"
        filter  = "metric.type=\"serviceruntime.googleapis.com/api/request_count\" resource.type=\"consumed_api\" resource.label.service=\"bigquery.googleapis.com\""
        aligner = "ALIGN_DELTA", reducer = "REDUCE_SUM", group_by = ["metric.label.response_code_class"]
      }
      # A time-series query may match one metric only; `filters` maps legend => filter.
      firestore_ops = {
        title = "Firestore document ops/min", plot = "LINE"
        filters = {
          reads  = "metric.type=\"firestore.googleapis.com/document/read_ops_count\" ${local.firestore_filter}"
          writes = "metric.type=\"firestore.googleapis.com/document/write_ops_count\" ${local.firestore_filter}"
        }
        aligner = "ALIGN_DELTA", reducer = "REDUCE_SUM", group_by = []
      }
      } : name => {
      title = c.title
      xyChart = {
        dataSets = [
          for legend, filter in try(c.filters, { "" = c.filter }) : {
            plotType       = c.plot
            legendTemplate = legend
            timeSeriesQuery = {
              timeSeriesFilter = {
                filter = filter
                aggregation = {
                  alignmentPeriod    = "60s"
                  perSeriesAligner   = c.aligner
                  crossSeriesReducer = c.reducer
                  groupByFields      = c.group_by
                }
              }
            }
          }
        ]
      }
    }
  }

  # Open alerts on top, then charts split each row evenly on a 48-column grid, then the
  # error log panel at full width.
  chart_rows = [
    ["requests", "latency_p95"],
    ["instances", "startup"],
    ["cpu", "memory"],
    ["gemini_calls", "gemini_tokens"],
    ["vertex_api_requests", "vertex_api_latency"],
    ["gemini_latency", "firestore_ops"],
    ["pubsub_publish", "pubsub_backlog", "pubsub_age"],
    ["bq_queries", "bq_billed_bytes"],
    ["bq_inserted_rows", "bq_api_requests"],
  ]
  tile_height   = 16
  alerts_height = 12
}

resource "google_monitoring_dashboard" "kaizen" {
  dashboard_json = jsonencode({
    displayName = "Kaizen production"
    mosaicLayout = {
      columns = 48
      tiles = concat(
        [{
          xPos   = 0
          yPos   = 0
          width  = 48
          height = local.alerts_height
          widget = {
            title = "Kaizen alerts"
            # The widget wants `alertPolicies/{id}`, not the full resource name.
            incidentList = {
              policyNames = [
                for policy in concat(values(google_monitoring_alert_policy.threshold), [google_monitoring_alert_policy.llm_calls_limit]) :
                trimprefix(policy.name, "projects/${var.project_id}/")
              ]
            }
          }
        }],
        flatten([
          for row, names in local.chart_rows : [
            for col, name in names : {
              xPos   = col * 48 / length(names)
              yPos   = local.alerts_height + row * local.tile_height
              width  = 48 / length(names)
              height = local.tile_height
              widget = local.chart[name]
            }
          ]
        ]),
        [{
          xPos   = 0
          yPos   = local.alerts_height + length(local.chart_rows) * local.tile_height
          width  = 48
          height = 20
          widget = {
            title     = "Backend errors"
            logsPanel = { filter = local.error_log_filter, resourceNames = [] }
          }
        }],
      )
    }
  })

  depends_on = [time_sleep.apis_ready]
}

resource "google_monitoring_notification_channel" "owners" {
  for_each = local.owner_emails

  display_name = "Project owner ${each.value}"
  type         = "email"
  labels       = { email_address = each.value }

  depends_on = [time_sleep.apis_ready]
}

locals {
  owner_channels = [for channel in google_monitoring_notification_channel.owners : channel.id]

  # Threshold alerts: metric filter, aligner over the window, comparison value, hold time;
  # group_by keeps one series per value so the alert names e.g. the failing service.
  threshold_alerts = {
    cloud_run_5xx = {
      name      = "Kaizen backend 5xx responses"
      doc       = "More than 5 HTTP 5xx responses from ${var.service_name} in 5 minutes. Check the Backend errors panel on the Kaizen production dashboard."
      filter    = "metric.type=\"run.googleapis.com/request_count\" metric.label.response_code_class=\"5xx\" ${local.run_filter}"
      period    = "300s"
      aligner   = "ALIGN_DELTA"
      reducer   = "REDUCE_SUM"
      threshold = 5
      duration  = "0s"
      group_by  = []
    }
    gemini_spike = {
      name      = "Kaizen Gemini invocation spike"
      doc       = "More than 100 Gemini calls in 10 minutes; normal incident runs stay under ~40. Likely an agent tool loop: check running incidents and stop the backend if spend is climbing."
      filter    = "metric.type=\"aiplatform.googleapis.com/publisher/online_serving/model_invocation_count\" ${local.gemini_filter}"
      period    = "600s"
      aligner   = "ALIGN_DELTA"
      reducer   = "REDUCE_SUM"
      threshold = 100
      duration  = "0s"
      group_by  = []
    }
    pubsub_stale = {
      name      = "Kaizen Pub/Sub backlog stale"
      doc       = "A kaizen-* subscription has an unacked message older than 10 minutes: the backend is not consuming (scaled to zero, crashed, or subscriber stopped)."
      filter    = "metric.type=\"pubsub.googleapis.com/subscription/oldest_unacked_message_age\" ${local.pubsub_filter}"
      period    = "60s"
      aligner   = "ALIGN_MAX"
      reducer   = "REDUCE_MAX"
      threshold = 600
      duration  = "300s"
      group_by  = ["resource.label.subscription_id"]
    }
    # Only the backend runtime identity: Terraform/gcloud calls from people stay out.
    google_api_errors = {
      name      = "Kaizen backend Google API errors"
      doc       = "The backend got more than 5 HTTP 5xx or 429 (quota/rate limit) responses from one Google API (Vertex AI, Vertex AI Search, BigQuery, Pub/Sub, Firestore) in 5 minutes. See the API request charts on the Kaizen production dashboard; 429 on aiplatform means the Gemini quota is exhausted."
      filter    = "metric.type=\"serviceruntime.googleapis.com/api/request_count\" resource.type=\"consumed_api\" resource.label.credential_id=\"serviceaccount:${google_service_account.backend.unique_id}\" (metric.label.response_code_class=\"5xx\" OR metric.label.response_code=\"429\")"
      period    = "300s"
      aligner   = "ALIGN_DELTA"
      reducer   = "REDUCE_SUM"
      threshold = 5
      duration  = "0s"
      group_by  = ["resource.label.service", "metric.label.response_code"]
    }
  }
}

resource "google_monitoring_alert_policy" "threshold" {
  for_each = local.threshold_alerts

  display_name          = each.value.name
  combiner              = "OR"
  notification_channels = local.owner_channels

  documentation {
    content   = each.value.doc
    mime_type = "text/markdown"
  }

  conditions {
    display_name = each.value.name

    condition_threshold {
      filter          = each.value.filter
      comparison      = "COMPARISON_GT"
      threshold_value = each.value.threshold
      duration        = each.value.duration

      aggregations {
        alignment_period     = each.value.period
        per_series_aligner   = each.value.aligner
        cross_series_reducer = each.value.reducer
        group_by_fields      = each.value.group_by
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  depends_on = [time_sleep.apis_ready]
}

# ADK aborts an incident run after its per-invocation LLM call cap; one email per hour at most.
resource "google_monitoring_alert_policy" "llm_calls_limit" {
  display_name          = "Kaizen LLM call limit exceeded"
  combiner              = "OR"
  notification_channels = local.owner_channels

  documentation {
    content   = "An incident run hit ADK LlmCallsLimitExceededError and stopped. The incident is left in status error; check the agent that looped in the backend logs."
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "LlmCallsLimitExceededError in backend logs"

    condition_matched_log {
      filter = "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"${var.service_name}\" textPayload:\"LlmCallsLimitExceededError\""
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "3600s"
    }
    auto_close = "1800s"
  }

  depends_on = [time_sleep.apis_ready]
}
