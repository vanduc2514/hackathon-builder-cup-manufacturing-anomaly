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
    service_account                  = google_service_account.backend.email
    timeout                          = "3600s"
    max_instance_request_concurrency = 80
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    session_affinity                 = true

    scaling {
      min_instance_count = var.min_instances
      # 1 caused 429s under concurrent demo load (cold start + request-queue limit); session_affinity
      # above keeps each client pinned to one instance so simulator state stays consistent per session.
      max_instance_count = 3
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
        name  = "FACTORY_API_KEY"
        value = random_password.factory_api_key.result
      }

      env {
        name  = "AUTH_SECRET"
        value = random_password.auth_secret.result
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
