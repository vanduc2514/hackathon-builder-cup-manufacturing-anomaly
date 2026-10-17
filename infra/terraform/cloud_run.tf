locals {
  backend_env = {
    APP_ENV                     = "production"
    GCP_PROJECT_ID              = var.project_id
    GCP_REGION                  = var.region
    BIGQUERY_DATASET            = var.bigquery_dataset
    VERTEX_SEARCH_DATASTORE_ID  = var.vertex_search_datastore_id
    VERTEX_SEARCH_LOCATION      = "global"
    AI_PROVIDER                 = "gemini"
    GEMINI_MODEL                = var.gemini_model
    GEMINI_LIVE_MODEL           = var.gemini_live_model
    GEMINI_LIVE_SIMULATION_MODE = tostring(var.gemini_live_simulation_mode)
    GOOGLE_GENAI_USE_VERTEXAI   = "true"
    GOOGLE_CLOUD_PROJECT        = var.project_id
    GOOGLE_CLOUD_LOCATION       = var.vertex_ai_location
    LOG_LEVEL                   = "INFO"
    MQTT_BROKER_HOST            = "broker.emqx.io"
    MQTT_BROKER_PORT            = "1883"
    CORS_ORIGINS                = local.cors_origins
    PUBSUB_TELEMETRY_TOPIC      = "kaizen-telemetry"
    PUBSUB_TELEMETRY_SUB        = local.pubsub["kaizen-telemetry"]
    PUBSUB_TRACEABILITY_TOPIC   = "kaizen-traceability"
    PUBSUB_TRACEABILITY_SUB     = local.pubsub["kaizen-traceability"]
    PUBSUB_QUALITY_EVENTS_TOPIC = "kaizen-quality-events"
    PUBSUB_QUALITY_EVENTS_SUB   = local.pubsub["kaizen-quality-events"]
  }
}

# HS256 signing key for login tokens; rotating it (taint) signs everyone out.
resource "random_password" "auth_secret" {
  length  = 48
  special = false
}

# Shared API key for mutating factory simulator endpoints (/inject, /reset).
resource "random_password" "factory_api_key" {
  length  = 32
  special = false
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
      # TKT-074 / #296: keep one backend instance always warm to eliminate
      # cold-start latency (~2-6 s) on first hit. Cost ~$4-5 / mo at
      # asia-southeast1 idle; gate by user approval in #296. Other Cloud Run
      # services (factory, Vertex AI Search) keep var.min_instances (0).
      min_instance_count = 1
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
        # Cold start imports ADK + Google clients and reloads Firestore state on 1 vCPU;
        # allow up to ~2 min before Cloud Run gives up on the revision.
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

      # Sensitive values stay out of local.backend_env: they cannot feed a for_each.
      env {
        name  = "AUTH_USERS"
        value = var.auth_users
      }

      env {
        name  = "AUTH_SECRET"
        value = random_password.auth_secret.result
      }

      env {
        name  = "FACTORY_SERVICE_URL"
        value = google_cloud_run_v2_service.factory.uri
      }

      env {
        name  = "FACTORY_API_KEY"
        value = random_password.factory_api_key.result
      }

      # TKT-073 / #288: backend -> factory auth via central JWT. Operator creds
      # are sourced here so factory_client.py can mint a Bearer token by
      # calling this service's own /api/auth/login. ``BACKEND_PUBLIC_URL`` is
      # the deployed URL so the JWT is issued for the same origin that
      # Firebase Hosting rewrites reach.
      env {
        name  = "BACKEND_PUBLIC_URL"
        value = local.hosting_urls.web
      }

      env {
        name  = "FACTORY_OPERATOR_ACCOUNT"
        value = var.factory_operator_account
      }

      env {
        name  = "FACTORY_OPERATOR_PASSWORD"
        value = var.factory_operator_password
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
    time_sleep.apis_ready,
    google_project_iam_member.runtime,
    google_bigquery_dataset_iam_member.runtime_editor,
    google_pubsub_topic_iam_member.runtime_publisher,
    google_pubsub_subscription_iam_member.runtime_subscriber,
  ]
}

# Firebase Hosting rewrites call Cloud Run unauthenticated.
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.backend.name
  location = google_cloud_run_v2_service.backend.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
