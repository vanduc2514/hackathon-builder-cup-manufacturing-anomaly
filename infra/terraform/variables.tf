variable "project_id" {
  description = "GCP project ID (set TF_VAR_project_id in mise.local.toml)."
  type        = string
}

variable "global_prefix" {
  description = "Prefix for globally unique names (<prefix>-<role>: GCS buckets, Hosting sites); set via TF_VAR_global_prefix in mise.toml."
  type        = string
}

variable "region" {
  description = "Primary region for Cloud Run, Artifact Registry, BigQuery, Firestore and GCS."
  type        = string
  default     = "asia-southeast1"
}

variable "service_name" {
  description = "Cloud Run service name."
  type        = string
  default     = "kaizen-backend"
}

variable "factory_service_name" {
  description = "Cloud Run service name for factory simulator client."
  type        = string
  default     = "kaizen-factory"
}

variable "artifact_repo" {
  description = "Artifact Registry docker repository ID."
  type        = string
  default     = "kaizen-agent"
}

variable "bigquery_dataset" {
  description = "BigQuery dataset for telemetry and traceability tables."
  type        = string
  default     = "kaizen_manufacturing"
}

variable "vertex_search_datastore_id" {
  description = "Vertex AI Search datastore ID for the knowledge base."
  type        = string
  default     = "kaizen-knowledge-store"
}

variable "vertex_search_engine_id" {
  description = "Vertex AI Search engine (app) ID attached to the datastore."
  type        = string
  default     = "kaizen-knowledge-search"
}

variable "vertex_ai_location" {
  description = "Vertex AI location used by Gemini (GOOGLE_CLOUD_LOCATION)."
  type        = string
  default     = "global"
}

variable "gemini_model" {
  description = "Gemini model used by the agents."
  type        = string
  default     = "gemini-2.5-flash-lite"
}

variable "gemini_live_model" {
  description = "Gemini Live model used for multimodal technician copilot WebSocket streaming."
  type        = string
  default     = "gemini-2.0-flash-exp"
}

variable "gemini_live_simulation_mode" {
  description = "Whether Gemini Live runs in local simulation mode (true) or live API mode (false)."
  type        = bool
  default     = false
}

variable "gdrive_folder_id" {
  description = "Google Drive folder ID for hybrid RAG; GDRIVE_FOLDER_ID is omitted when null."
  type        = string
  default     = null
}

variable "min_instances" {
  description = "Cloud Run minimum instances (0 = scale to zero)."
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Cloud Run maximum instances. Keep 1: orchestrator single-flight, SSE listeners and rate-limit counters are per-process."
  type        = number
  default     = 1
}

variable "bootstrap_image" {
  description = "Placeholder image for the first apply; deploy_cloud_run.sh owns the image afterwards."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "cpu_limit" {
  description = "Cloud Run CPU limit per instance."
  type        = string
  default     = "1"
}

variable "memory_limit" {
  description = "Cloud Run memory limit per instance."
  type        = string
  default     = "1Gi"
}

variable "billing_account_id" {
  description = "Billing account (XXXXXX-XXXXXX-XXXXXX) for the budget alert; the budget is skipped when null."
  type        = string
  default     = null
}

variable "budget_amount" {
  description = "Monthly budget alert amount, in whole units of budget_currency."
  type        = number
  default     = 20
}

variable "budget_currency" {
  description = "Currency of the billing account."
  type        = string
  default     = "USD"
}

variable "auth_users" {
  description = "JSON list of login accounts [{username,password,role,display_name}] for Cloud Run AUTH_USERS; set TF_VAR_auth_users in mise.local.toml. \"[]\" disables login."
  type        = string
  sensitive   = true
  default     = "[]"

  validation {
    condition     = can(tolist(jsondecode(var.auth_users)))
    error_message = "auth_users must be a JSON list of account objects."
  }
}

# TKT-073 / #288: dedicated backend->factory service-account credentials.
# Must be an entry present in `auth_users` (the factory gate reuses the central
# backend JWT). Set TF_VAR_factory_service_account_username /
# TF_VAR_factory_service_account_password in mise.local.toml so the backend can
# mint a Bearer token at runtime without exposing the service account's
# password to anyone but Terraform + deploy.
variable "factory_service_account_username" {
  description = "Username of the shared service account the backend uses to mint a JWT via /api/auth/login before calling the factory service. Must exist in auth_users."
  type        = string
  sensitive   = true
  default     = ""
}

variable "factory_service_account_password" {
  description = "Password of the shared service account the backend uses to mint a JWT via /api/auth/login before calling the factory service. Must match auth_users."
  type        = string
  sensitive   = true
  default     = ""
}

variable "factory_service_token_ttl_seconds" {
  description = "Upper bound, in seconds, the backend caches a freshly minted JWT for /api/factory/* calls. Mirrors backend.core.config.factory_service_token_ttl_seconds (default 3600)."
  type        = number
  default     = 3600
}
