#!/usr/bin/env bash
# =============================================================================
# Kaizen Agent — Workload Identity & IAM Least-Privilege Provisioning
# Binds required IAM roles for Vertex AI, BigQuery, Firestore, and Cloud Run
# =============================================================================

set -euo pipefail

DRY_RUN=false
PROJECT_ID="${GCP_PROJECT_ID:-${PROJECT_ID:-}}"
REGION="${GCP_REGION:-asia-southeast1}"
SA_NAME="${SERVICE_ACCOUNT_NAME:-kaizen-backend-sa}"
ALLOW_UNAUTHENTICATED=true

# Parse command line options
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --project)
      PROJECT_ID="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --service-account)
      SA_NAME="$2"
      shift 2
      ;;
    --no-allow-unauthenticated)
      ALLOW_UNAUTHENTICATED=false
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo "Options:"
      echo "  --dry-run                   Print commands without executing"
      echo "  --project <PROJECT_ID>      Google Cloud Project ID (default: \$GCP_PROJECT_ID)"
      echo "  --region <REGION>           Google Cloud Region (default: asia-southeast1)"
      echo "  --service-account <NAME>    Service account name (default: kaizen-backend-sa)"
      echo "  --no-allow-unauthenticated  Do not grant public invoker role"
      echo "  --help, -h                  Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_ID" ]]; then
  if command -v gcloud >/dev/null 2>&1; then
    PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
  fi
fi

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  PROJECT_ID="kaizen-manufacturing"
  if [[ "$DRY_RUN" == "false" ]]; then
    echo "WARNING: GCP_PROJECT_ID unset, defaulting to '${PROJECT_ID}' for dry-run simulation."
  fi
fi

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Least-privileged IAM roles defined by architecture guidelines:
# - Vertex AI / Gemini 2.0 Flash
# - BigQuery Telemetry & Traceability
# - Firestore Blackboard reactive state
# - Cloud Storage repair video/defect frame assets
# - Cloud Logging structured incident telemetry
ROLES=(
  "roles/aiplatform.user"
  "roles/bigquery.dataViewer"
  "roles/bigquery.jobUser"
  "roles/datastore.user"
  "roles/storage.objectViewer"
  "roles/logging.logWriter"
)

log_exec() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] $*"
  else
    echo "[EXEC] $*"
    "$@"
  fi
}

echo "============================================================================="
echo "Kaizen Agent IAM Provisioning"
echo "Project ID:       ${PROJECT_ID}"
echo "Region:           ${REGION}"
echo "Service Account:  ${SA_EMAIL}"
echo "Dry Run Mode:     ${DRY_RUN}"
echo "============================================================================="

# 1. Enable Required GCP APIs
APIS=(
  "run.googleapis.com"
  "artifactregistry.googleapis.com"
  "aiplatform.googleapis.com"
  "discoveryengine.googleapis.com"
  "bigquery.googleapis.com"
  "firestore.googleapis.com"
  "storage.googleapis.com"
  "logging.googleapis.com"
)

echo "--- 1. Enabling GCP Service APIs ---"
for api in "${APIS[@]}"; do
  log_exec gcloud services enable "$api" --project="$PROJECT_ID" --quiet
done

# 2. Create Service Account if it doesn't already exist
echo "--- 2. Creating Cloud Run Service Account ---"
log_exec gcloud iam service-accounts create "$SA_NAME" \
  --project="$PROJECT_ID" \
  --description="Dedicated runtime identity for Kaizen Agent backend service on Cloud Run" \
  --display-name="Kaizen Agent Backend Service Account" \
  --quiet || true

# 3. Grant Least-Privileged IAM Role Bindings
echo "--- 3. Binding Least-Privileged IAM Roles ---"
for role in "${ROLES[@]}"; do
  log_exec gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$role" \
    --condition=None \
    --quiet
done

# 4. Optional Public Invoker Binding for Frontend Web Dashboard
if [[ "$ALLOW_UNAUTHENTICATED" == "true" ]]; then
  echo "--- 4. Granting Public Invoker Role to allUsers ---"
  log_exec gcloud run services add-iam-policy-binding kaizen-backend \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --quiet || true
fi

echo "============================================================================="
echo "IAM & Workload Identity Provisioning Complete!"
echo "Service Account: ${SA_EMAIL}"
echo "Assigned Roles:  ${#ROLES[@]} roles bound successfully"
echo "============================================================================="
