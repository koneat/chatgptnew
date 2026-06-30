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

log() { printf '[+] %s\n' "$*"; }
warn() { printf '[!] %s\n' "$*" >&2; }

if [ ! -f .env ]; then
  cp .env.example .env
  log "created .env from .env.example"
fi

mkdir -p workspace reports data config

build_args=()
if grep -q '^INSTALL_EXTRA_TOOLS=false' .env 2>/dev/null; then
  build_args+=(--build-arg INSTALL_EXTRA_TOOLS=false)
fi

log "building image: ${IMAGE_NAME}"
log "build log: ${BUILD_LOG}"
set +e
docker build "${build_args[@]}" -t "${IMAGE_NAME}" . 2>&1 | tee "${BUILD_LOG}"
build_rc=${PIPESTATUS[0]}
set -e

if [ "${build_rc}" -ne 0 ]; then
  warn "docker build failed: ${build_rc}"
  tail -n 120 "${BUILD_LOG}" >&2 || true
  exit "${build_rc}"
fi

if docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  log "removing old container: ${CONTAINER_NAME}"
  docker rm -f "${CONTAINER_NAME}" >/dev/null
fi

log "starting container: ${CONTAINER_NAME}"
log "fixed mapping: ${BIND_ADDR}:${HOST_PORT}->${CONTAINER_PORT}/tcp"
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

log "waiting for API: http://${BIND_ADDR}:${HOST_PORT}/api/cache/stats"
for i in $(seq 1 90); do
  if curl -fsS --max-time 3 "http://${BIND_ADDR}:${HOST_PORT}/api/cache/stats" >/dev/null 2>&1; then
    log "API ready: http://${BIND_ADDR}:${HOST_PORT}/api/cache/stats"
    docker port "${CONTAINER_NAME}" || true
    exit 0
  fi
  if [ $((i % 5)) -eq 0 ]; then
    printf '[api wait %02ds]\n' "$((i * 2))"
  fi
  sleep 2
done

warn "API not ready"
docker ps -a | grep "${CONTAINER_NAME}" || true
docker port "${CONTAINER_NAME}" || true
docker logs --tail=120 "${CONTAINER_NAME}" 2>&1 || true
exit 1
