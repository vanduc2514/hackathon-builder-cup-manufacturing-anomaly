variable "project_id" {
  description = "GCP project that hosts the Terraform state bucket."
  type        = string
}

variable "name_suffix" {
  description = "Suffix for globally unique names (kaizen-<role>-<suffix>); set via TF_VAR_name_suffix in mise.toml."
  type        = string
}

variable "region" {
  description = "Region for the Terraform state bucket."
  type        = string
  default     = "asia-southeast1"
}
