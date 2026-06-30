#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

IMAGE_NAME="${IMAGE_NAME:-hexstrike-ai:docker}"
CONTAINER_NAME="${CONTAINER_NAME:-hexstrike-ai}"
BIND_ADDR="${HEXSTRIKE_BIND:-127.0.0.1}"
HOST_PORT="${HEXSTRIKE_HOST_PORT:-8888}"
CONTAINER_PORT="8888"
BUILD_LOG="${BUILD_LOG:-${ROOT_DIR}/build.log}"
FAST_BUILD="${FAST_BUILD:-false}"
READY_URL="http://${BIND_ADDR}:${HOST_PORT}/api/cache/stats"
HEALTH_URL="http://${BIND_ADDR}:${HOST_PORT}/health"

log() { printf '[+] %s\n' "$*"; }
warn() { printf '[!] %s\n' "$*" >&2; }

if [ ! -f .env ]; then
  cp .env.example .env
  log "created .env from .env.example"
fi

mkdir -p workspace reports data config

build_args=()
if [ "${FAST_BUILD}" = "true" ]; then
  build_args+=(--build-arg INSTALL_GO_TOOLS=false --build-arg INSTALL_PY_TOOLS=false)
  warn "FAST_BUILD=true: skip extra Go/Python CLI tools for faster first build"
fi

progress_args=()
if docker build --help 2>&1 | grep -q -- '--progress'; then
  progress_args+=(--progress=plain)
else
  warn "this Docker build does not support --progress; using legacy build output"
fi

log "building image: ${IMAGE_NAME}"
log "full build log: ${BUILD_LOG}"
log "Docker may spend a long time on apt, go install, and pip install. This is normal on first build."

set +e
docker build "${progress_args[@]}" "${build_args[@]}" -t "${IMAGE_NAME}" . 2>&1 | tee "${BUILD_LOG}"
build_rc=${PIPESTATUS[0]}
set -e

if [ "${build_rc}" -ne 0 ]; then
  warn "docker build failed with exit code ${build_rc}"
  warn "last 120 lines from ${BUILD_LOG}:"
  tail -n 120 "${BUILD_LOG}" >&2 || true
  exit "${build_rc}"
fi

log "build finished successfully"

if docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  log "removing existing container: ${CONTAINER_NAME}"
  docker rm -f "${CONTAINER_NAME}" >/dev/null
fi

log "starting container: ${CONTAINER_NAME}"
log "port mapping: ${BIND_ADDR}:${HOST_PORT}->${CONTAINER_PORT}/tcp"
docker run -d \
  --name "${CONTAINER_NAME}" \
  --env-file .env \
  -e HEXSTRIKE_HOST=0.0.0.0 \
  -e HEXSTRIKE_PORT="${CONTAINER_PORT}" \
  -e PYTHONUNBUFFERED=1 \
  -p "${BIND_ADDR}:${HOST_PORT}:${CONTAINER_PORT}" \
  -v "${ROOT_DIR}/workspace:/workspace" \
  -v "${ROOT_DIR}/reports:/reports" \
  -v "${ROOT_DIR}/data:/data" \
  -v "${ROOT_DIR}/config:/root/.config/hexstrike" \
  --cap-add NET_RAW \
  --cap-add NET_ADMIN \
  --shm-size=2g \
  --restart unless-stopped \
  "${IMAGE_NAME}"

log "waiting for lightweight API readiness..."
for i in $(seq 1 60); do
  if curl -fsS --max-time 3 "${READY_URL}" >/dev/null 2>&1; then
    log "HexStrike API is ready: ${READY_URL}"
    log "Full tool health check is slower/heavier: ${HEALTH_URL}"
    exit 0
  fi
  if [ $((i % 5)) -eq 0 ]; then
    printf '[api wait %02ds] still waiting for %s\n' "$((i * 2))" "${READY_URL}"
  fi
  sleep 2
done

warn "API not ready yet. Check logs: docker logs -f ${CONTAINER_NAME}"
docker ps -a | grep "${CONTAINER_NAME}" || true
docker logs --tail=120 "${CONTAINER_NAME}" 2>&1 || true
exit 1
