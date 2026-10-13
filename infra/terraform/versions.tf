terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.13"
    }
  }

  # Bucket supplied at init: -backend-config="bucket=<global_prefix>-tfstate" (mise run infra:init).
  backend "gcs" {
    prefix = "kaizen"
  }
}
