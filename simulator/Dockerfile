# =============================================================================
# Kaizen Agent — Standalone Factory Client Cloud Run Container
# Multi-stage build for minimal attack surface, non-root user, and fast boot
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build the simulator/ui static frontend with Vite
# -----------------------------------------------------------------------------
FROM node:22-slim AS ui-builder

WORKDIR /app
COPY simulator/ /app/simulator/

# Build Vite frontend if package.json exists; otherwise generate fallback index.html
RUN if [ -f /app/simulator/ui/package.json ]; then \
        cd /app/simulator/ui && npm install && npm run build; \
    else \
        mkdir -p /app/simulator/ui/dist && \
        echo '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Factory Client</title></head><body><div id="root">Factory Floor UI Placeholder</div></body></html>' > /app/simulator/ui/dist/index.html; \
    fi

# -----------------------------------------------------------------------------
# Stage 2: Build virtualenv and compile wheels
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS py-builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY simulator/requirements.txt requirements.txt

RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip setuptools wheel && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# -----------------------------------------------------------------------------
# Stage 3: Production runtime image
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS runner

# Create non-root system user (UID 10001) per Google Cloud security best practices
RUN groupadd -r -g 10001 appuser && \
    useradd -r -u 10001 -g appuser -d /app -s /sbin/nologin -c "Kaizen Factory Service Account" appuser

WORKDIR /app

# Install minimal runtime utilities (curl for container healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy virtualenv from builder stage
COPY --from=py-builder --chown=appuser:appuser /opt/venv /opt/venv

# Copy built UI static assets into /app/simulator/ui/dist
COPY --from=ui-builder --chown=appuser:appuser /app/simulator/ui/dist /app/simulator/ui/dist

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED="1" \
    PYTHONDONTWRITEBYTECODE="1" \
    PYTHONPATH="/app" \
    APP_ENV="production" \
    PORT="8080"

# Copy simulator package
COPY --chown=appuser:appuser simulator/ /app/simulator/

# Switch to non-root user
USER 10001:10001

# Cloud Run injects $PORT (default 8080). Listening on 0.0.0.0 is mandatory.
EXPOSE 8080

# Container runtime healthcheck against factory health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Start Uvicorn ASGI server with dynamic $PORT binding
CMD ["sh", "-c", "exec uvicorn simulator.server:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
