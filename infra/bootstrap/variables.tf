variable "project_id" {
  description = "GCP project that hosts the Terraform state bucket."
  type        = string
}

variable "region" {
  description = "Region for the Terraform state bucket."
  type        = string
  default     = "asia-southeast1"
}
