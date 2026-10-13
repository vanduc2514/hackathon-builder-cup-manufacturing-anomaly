variable "project_id" {
  description = "GCP project that hosts the Terraform state bucket."
  type        = string
}

variable "global_prefix" {
  description = "Prefix for globally unique names (<prefix>-<role>: GCS buckets, Hosting sites); set via TF_VAR_global_prefix in mise.toml."
  type        = string
}

variable "region" {
  description = "Region for the Terraform state bucket."
  type        = string
  default     = "asia-southeast1"
}
