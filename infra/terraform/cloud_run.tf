locals {
  backend_env = {
    APP_ENV                    = "production"
    GCP_PROJECT_ID             = var.project_id
    GCP_REGION                 = var.region
    BIGQUERY_DATASET           = var.bigquery_dataset
    VERTEX_SEARCH_DATASTORE_ID = var.vertex_search_datastore_id
    VERTEX_SEARCH_LOCATION     = "global"
    AI_PROVIDER                = "gemini"
    GEMINI_MODEL               = var.gemini_model
    GOOGLE_GENAI_USE_VERTEXAI  = "true"
    GOOGLE_CLOUD_PROJECT       = var.project_id
    GOOGLE_CLOUD_LOCATION      = var.vertex_ai_location
    LOG_LEVEL                  = "INFO"
    MQTT_BROKER_HOST           = "broker.emqx.io"
    MQTT_BROKER_PORT           = "1883"
  }
}

resource "google_cloud_run_v2_service" "backend" {
  name                = var.service_name
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
      max_instance_count = var.max_instances
    }

    containers {
      # Placeholder until the first `mise run deploy:backend`; the hello image answers 200
      # on every path so the probes pass.
      image = var.bootstrap_image

      ports {
        container_port = 8080
      }

      # cpu_idle = false (instance-based billing): the orchestrator keeps working after
      # /api/simulation/inject returns and Pub/Sub streaming pull runs outside requests.
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
          path = "/healthz"
          port = 8080
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3
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
        for_each = local.backend_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.gdrive_folder_id == null ? [] : [var.gdrive_folder_id]
        content {
          name  = "GDRIVE_FOLDER_ID"
          value = env.value
        }
      }
    }
  }

  # scripts/deploy_cloud_run.sh owns the image; gcloud also stamps client fields.
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.apis,
    google_project_iam_member.runtime,
  ]
}

# Firebase Hosting rewrites call Cloud Run unauthenticated.
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.backend.name
  location = google_cloud_run_v2_service.backend.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
