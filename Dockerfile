# =============================================================================
# Kaizen Agent — Production Cloud Run Container
# Multi-stage build for minimal attack surface, non-root user, and fast boot
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build virtualenv and compile wheels
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt requirements.txt

RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip setuptools wheel && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# -----------------------------------------------------------------------------
# Stage 2: Production runtime image
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS runner

# Create non-root system user (UID 10001) per Google Cloud security best practices
RUN groupadd -r -g 10001 appuser && \
    useradd -r -u 10001 -g appuser -d /app -s /sbin/nologin -c "Kaizen Agent Service Account" appuser

WORKDIR /app

# Install minimal runtime utilities (curl for container healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy virtualenv from builder stage
COPY --from=builder --chown=appuser:appuser /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED="1" \
    PYTHONDONTWRITEBYTECODE="1" \
    PYTHONPATH="/app" \
    APP_ENV="production" \
    PORT="8080"

# Copy backend modules, schemas, datasets, and scripts
COPY --chown=appuser:appuser backend/ /app/backend/
COPY --chown=appuser:appuser data/ /app/data/
COPY --chown=appuser:appuser scripts/ /app/scripts/

# Switch to non-root user
USER 10001:10001

# Cloud Run injects $PORT (default 8080). Listening on 0.0.0.0 is mandatory.
EXPOSE 8080

# Container runtime healthcheck against FastAPI health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Start Uvicorn ASGI server with dynamic $PORT binding
CMD ["sh", "-c", "exec uvicorn backend.api.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
