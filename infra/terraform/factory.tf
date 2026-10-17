locals {
  factory_env = {
    APP_ENV                         = "production"
    GCP_PROJECT_ID                  = var.project_id
    GCP_REGION                      = var.region
    LOG_LEVEL                       = "INFO"
    MQTT_BROKER_HOST                = "broker.emqx.io"
    MQTT_BROKER_PORT                = "1883"
    CORS_ORIGINS                    = local.cors_origins
    PUBSUB_TELEMETRY_TOPIC          = "kaizen-telemetry"
    PUBSUB_TRACEABILITY_TOPIC       = "kaizen-traceability"
    PUBSUB_QUALITY_EVENTS_TOPIC     = "kaizen-quality-events"
    SIMULATOR_PUBSUB_ENABLED        = "true"
    SIMULATOR_TELEMETRY_PUBLISH_SEC = "10"
  }
}

resource "google_cloud_run_v2_service" "factory" {
  name                = var.factory_service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.backend.email
    timeout         = "3600s"
    # /api/factory/stream is a long-lived SSE consumer; the previous 80 rps
    # budget collided with Cloud Run's "no available instance" 429s when the
    # dashboard reconnect storm re-used the same instance too often. The brief
    # for #265 lowers this to 40 so a single noisy SSE client cannot starve
    # the burst capacity of non-stream endpoints.
    max_instance_request_concurrency = 40
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    session_affinity                 = true

    scaling {
      min_instance_count = var.min_instances
      # 1 caused 429s under concurrent demo load (cold start + request-queue limit);
      # 3 was never actually reachable because max_instance_request_concurrency
      # throttled growth first. The brief for #265 raises this to 5 with the
      # tighter concurrency budget so a brief burst of reconnect storms can
      # spill onto a fresh instance instead of saturating the existing one.
      max_instance_count = 5
    }

    containers {
      # Placeholder until first deploy; scripts/deploy_cloud_run.sh manages and updates the real image.
      # The hello image answers 200 on /health so initial deployment probes pass.
      image = var.bootstrap_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
        cpu_idle          = false
        startup_cpu_boost = true
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 12
        timeout_seconds       = 5
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 10
        period_seconds        = 15
        failure_threshold     = 3
        timeout_seconds       = 5
      }

      dynamic "env" {
        for_each = local.factory_env
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name  = "AUTH_SECRET"
        value = random_password.auth_secret.result
      }

      # Token TTL mirror of the central backend's auth_token_ttl_hours; the
      # simulator only verifies tokens so we explicitly pin it here.
      env {
        name  = "FACTORY_AUTH_TOKEN_TTL_HOURS"
        value = "12"
      }

      env {
        name  = "AUTH_USERS"
        value = var.auth_users
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    time_sleep.apis_ready,
    google_project_iam_member.runtime,
    google_pubsub_topic_iam_member.runtime_publisher,
  ]
}

# Firebase Hosting rewrites call Cloud Run unauthenticated.
resource "google_cloud_run_v2_service_iam_member" "factory_public" {
  name     = google_cloud_run_v2_service.factory.name
  location = google_cloud_run_v2_service.factory.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
