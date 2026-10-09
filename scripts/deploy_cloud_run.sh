#!/usr/bin/env bash
# =============================================================================
# Kaizen Agent — Google Cloud Run Production Deployment Automation
# Builds production container, provisions Artifact Registry, and deploys service
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DRY_RUN=false
SETUP_IAM=false
BUILD_ONLY=false
APPLY_YAML=false

PROJECT_ID="${GCP_PROJECT_ID:-${PROJECT_ID:-}}"
REGION="${GCP_REGION:-asia-southeast1}"
SERVICE_NAME="${SERVICE_NAME:-kaizen-backend}"
REPO_NAME="${ARTIFACT_REPO:-kaizen-agent}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
SA_NAME="${SERVICE_ACCOUNT_NAME:-kaizen-backend-sa}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --setup-iam)
      SETUP_IAM=true
      shift
      ;;
    --build-only)
      BUILD_ONLY=true
      shift
      ;;
    --apply-yaml)
      APPLY_YAML=true
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
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo "Options:"
      echo "  --dry-run              Print build, tag, and deployment commands without executing"
      echo "  --setup-iam            Provision service account and IAM roles before deploy"
      echo "  --build-only           Build Docker container locally without pushing or deploying"
      echo "  --apply-yaml           Deploy using declarative deploy/cloudrun-service.yaml specification"
      echo "  --project <ID>         Google Cloud Project ID (default: \$GCP_PROJECT_ID)"
      echo "  --region <REGION>      Cloud Run deployment region (default: asia-southeast1)"
      echo "  --service-name <NAME>  Cloud Run service name (default: kaizen-backend)"
      echo "  --image-tag <TAG>      Container image tag (default: latest)"
      echo "  --repo <REPO>          Artifact Registry repository name (default: kaizen-agent)"
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
  PROJECT_ID="kaizen-manufacturing"
  if [[ "$DRY_RUN" == "false" ]]; then
    echo "WARNING: GCP_PROJECT_ID unset, defaulting to '${PROJECT_ID}' for dry-run simulation."
  fi
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:${IMAGE_TAG}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

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
echo "Service Account:   ${SA_EMAIL}"
echo "Dry Run Mode:      ${DRY_RUN}"
echo "============================================================================="

# Step 1: Optional IAM setup
if [[ "$SETUP_IAM" == "true" ]]; then
  echo "--- Step 1: Running Workload Identity IAM Provisioning ---"
  IAM_FLAGS=(--project "$PROJECT_ID" --region "$REGION" --service-account "$SA_NAME")
  if [[ "$DRY_RUN" == "true" ]]; then
    IAM_FLAGS+=(--dry-run)
  fi
  bash "${SCRIPT_DIR}/setup_workload_identity.sh" "${IAM_FLAGS[@]}"
fi

# Step 2: Build container image locally
echo "--- Step 2: Building Production Docker Container ---"
log_exec docker build \
  --file "${ROOT_DIR}/Dockerfile" \
  --tag "${IMAGE_URI}" \
  --tag "${SERVICE_NAME}:latest" \
  "${ROOT_DIR}"

if [[ "$BUILD_ONLY" == "true" ]]; then
  echo "Build complete (--build-only). Image tagged as: ${IMAGE_URI}"
  exit 0
fi

# Step 3: Ensure Artifact Registry repository exists
echo "--- Step 3: Provisioning Artifact Registry Repository ---"
log_exec gcloud artifacts repositories create "$REPO_NAME" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Container repository for Kaizen Agent microservices" \
  --project="$PROJECT_ID" \
  --quiet || true

# Step 4: Configure docker auth and push container image
echo "--- Step 4: Pushing Container Image to Artifact Registry ---"
log_exec gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
log_exec docker push "${IMAGE_URI}"

# Step 5: Deploy to Cloud Run
echo "--- Step 5: Deploying Service to Google Cloud Run ---"
if [[ "$APPLY_YAML" == "true" ]]; then
  # Template service YAML with evaluated variables
  TEMP_YAML="$(mktemp)"
  sed \
    -e "s|\${GCP_PROJECT_ID}|${PROJECT_ID}|g" \
    -e "s|asia-southeast1-docker.pkg.dev/\${GCP_PROJECT_ID}/kaizen-agent/backend:latest|${IMAGE_URI}|g" \
    "${ROOT_DIR}/deploy/cloudrun-service.yaml" > "$TEMP_YAML"
  
  log_exec gcloud run services replace "$TEMP_YAML" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --quiet
  rm -f "$TEMP_YAML"
else
  # Direct gcloud run deploy command with production flags per AGENTS.md & cloud-run skill
  log_exec gcloud run deploy "$SERVICE_NAME" \
    --image="$IMAGE_URI" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --service-account="$SA_EMAIL" \
    --cpu=2 \
    --memory=2Gi \
    --concurrency=80 \
    --timeout=3600 \
    --min-instances=0 \
    --max-instances=10 \
    --execution-environment=gen2 \
    --cpu-boost \
    --session-affinity \
    --port=8080 \
    --allow-unauthenticated \
    --set-env-vars="APP_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},BIGQUERY_DATASET=manufacturing,VERTEX_SEARCH_DATASTORE_ID=kaizen-knowledge-store,AI_PROVIDER=gemini,GEMINI_MODEL=gemini-flash-latest,GOOGLE_GENAI_USE_VERTEXAI=true,LOG_LEVEL=INFO,MQTT_BROKER_HOST=broker.emqx.io,MQTT_BROKER_PORT=1883" \
    --quiet
fi

# Step 6: Post-Deployment Verification
echo "--- Step 6: Deployment Verification ---"
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
