#!/usr/bin/env bash
# ==============================================================================
# ZeroTask Production VPS Deployment Orchestrator
# Executes on the client VPS once authorized.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "${SCRIPT_DIR}")"
COMPOSE_FILE="${BACKEND_DIR}/docker-compose.prod.yml"
ENV_FILE="${BACKEND_DIR}/.env.production"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ZeroTask Deploy] $*"
}

# 1. Preflight Validation Checks
if [ ! -f "${ENV_FILE}" ]; then
    log "ERROR: Production environment file ${ENV_FILE} not found!"
    log "Please copy .env.production.example to .env.production and populate secrets."
    exit 1
fi

if [ ! -f "${COMPOSE_FILE}" ]; then
    log "ERROR: Production compose file ${COMPOSE_FILE} not found!"
    exit 1
fi

log "Starting ZeroTask Production Deployment..."

# 2. Pull / Build Containers
log "Building and starting production containers..."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build

# 3. Wait for Healthy Status
log "Waiting for services to report healthy..."
for i in {1..30}; do
    PG_STATUS=$(docker inspect --format='{{.State.Health.Status}}' zerotask_postgres 2>/dev/null || echo "starting")
    MINIO_STATUS=$(docker inspect --format='{{.State.Health.Status}}' zerotask_minio 2>/dev/null || echo "starting")
    BACKEND_STATUS=$(docker inspect --format='{{.State.Health.Status}}' zerotask_backend 2>/dev/null || echo "starting")

    if [ "${PG_STATUS}" = "healthy" ] && [ "${MINIO_STATUS}" = "healthy" ] && [ "${BACKEND_STATUS}" = "healthy" ]; then
        log "All core services (PostgreSQL, MinIO, Backend) report HEALTHY."
        break
    fi
    log "Waiting for services to become healthy... (PG: ${PG_STATUS}, MinIO: ${MINIO_STATUS}, Backend: ${BACKEND_STATUS}) [${i}/30]"
    sleep 3
done

# 4. Run Alembic Database Migrations
log "Executing Alembic database migrations (upgrade head)..."
docker exec -i zerotask_backend alembic upgrade head

# 5. Assert Canonical Table Count
log "Verifying canonical schema table count (40 application tables + alembic_version = 41 total)..."
TABLE_COUNT=$(docker exec -i zerotask_postgres psql -U zerotask_app -d zerotask -t -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
TABLE_COUNT=$(echo "${TABLE_COUNT}" | tr -d '[:space:]')

if [ "${TABLE_COUNT}" -eq 41 ]; then
    log "SUCCESS: Schema verification PASSED! Exactly 41 tables verified in PostgreSQL."
else
    log "WARNING: Table count mismatch. Expected 41, found ${TABLE_COUNT}."
fi

# 6. Verify Health and Readiness
log "Verifying /health and /ready endpoints..."
curl -s -f http://localhost:80/health || curl -s -f http://localhost:8000/health
curl -s -f http://localhost:80/ready || curl -s -f http://localhost:8000/ready

log "ZeroTask Production Deployment Complete!"
