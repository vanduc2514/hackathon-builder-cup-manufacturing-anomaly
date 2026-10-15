#!/usr/bin/env bash
# =============================================================================
# Kaizen Agent — Cloud Run Backend Deployment
# Builds the backend image, pushes it to Artifact Registry and rolls the
# Terraform-managed Cloud Run service to it
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DRY_RUN=false
BUILD_ONLY=false

PROJECT_ID="${TF_VAR_project_id:-${PROJECT_ID:-}}"
REGION="${GCP_REGION:-asia-southeast1}"
SERVICE_NAME="${SERVICE_NAME:-kaizen-backend}"
REPO_NAME="${ARTIFACT_REPO:-kaizen-agent}"
IMAGE_TAG="${IMAGE_TAG:-$(git -C "$ROOT_DIR" rev-parse --short HEAD)}"
DOCKERFILE="${DOCKERFILE:-${ROOT_DIR}/Dockerfile}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --build-only)
      BUILD_ONLY=true
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
    --service-name)
      SERVICE_NAME="$2"
      shift 2
      ;;
    --image-tag)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --repo)
      REPO_NAME="$2"
      shift 2
      ;;
    --dockerfile)
      DOCKERFILE="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo "Infrastructure (service, repo, IAM) is provisioned by Terraform: mise run infra:apply"
      echo "Options:"
      echo "  --dry-run              Print build, push, and rollout commands without executing"
      echo "  --build-only           Build Docker container locally without pushing or deploying"
      echo "  --project <ID>         Google Cloud Project ID (default: \$TF_VAR_project_id)"
      echo "  --region <REGION>      Cloud Run region (default: asia-southeast1)"
      echo "  --service-name <NAME>  Cloud Run service name (default: kaizen-backend)"
      echo "  --image-tag <TAG>      Container image tag (default: git short SHA)"
      echo "  --repo <REPO>          Artifact Registry repository name (default: kaizen-agent)"
      echo "  --dockerfile <FILE>    Dockerfile path (default: Dockerfile)"
      echo "  --help, -h             Show this help message"
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
  echo "ERROR: set TF_VAR_project_id or pass --project" >&2
  exit 1
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:${IMAGE_TAG}"

log_exec() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] $*"
  else
    echo "[EXEC] $*"
    "$@"
  fi
}

echo "============================================================================="
echo "Kaizen Agent — Cloud Run Backend Deployment"
echo "Project ID:        ${PROJECT_ID}"
echo "Region:            ${REGION}"
echo "Service Name:      ${SERVICE_NAME}"
echo "Container Image:   ${IMAGE_URI}"
echo "Dry Run Mode:      ${DRY_RUN}"
echo "============================================================================="

# Step 1: Build container image (Cloud Run is amd64; dev machines are arm64 Macs)
echo "--- Step 1: Building Production Docker Container ---"
log_exec docker build \
  --platform linux/amd64 \
  --file "${DOCKERFILE}" \
  --tag "${IMAGE_URI}" \
  "${ROOT_DIR}"

if [[ "$BUILD_ONLY" == "true" ]]; then
  echo "Build complete (--build-only). Image tagged as: ${IMAGE_URI}"
  exit 0
fi

# Step 2: Configure docker auth and push container image
echo "--- Step 2: Pushing Container Image to Artifact Registry ---"
log_exec gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
log_exec docker push "${IMAGE_URI}"

# Step 3: Roll the Terraform-managed service to the new image
echo "--- Step 3: Updating Cloud Run Service Image ---"
if [[ "$DRY_RUN" == "false" ]]; then
  if ! gcloud run services describe "$SERVICE_NAME" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "ERROR: Cloud Run service ${SERVICE_NAME} not found; run 'mise run infra:apply' first" >&2
    exit 1
  fi
fi
log_exec gcloud run services update "$SERVICE_NAME" \
  --image="$IMAGE_URI" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --quiet

# Step 4: Post-Deployment Verification
echo "--- Step 4: Deployment Verification ---"
if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN] Verification probe: curl -sSf https://${SERVICE_NAME}-<hash>-as.a.run.app/health"
else
  SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)' 2>/dev/null || true)"
  if [[ -n "$SERVICE_URL" ]]; then
    echo "Service URL: ${SERVICE_URL}"
    echo "Health endpoint: ${SERVICE_URL}/health"
    curl -sSf "${SERVICE_URL}/health" | jq . || true
  fi
fi

echo "============================================================================="
echo "Cloud Run Deployment Succeeded!"
echo "Service:  ${SERVICE_NAME}"
echo "Region:   ${REGION}"
echo "Image:    ${IMAGE_URI}"
echo "============================================================================="
