#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

IMAGE_NAME="${IMAGE_NAME:-hexstrike-ai:docker}"
CONTAINER_NAME="${CONTAINER_NAME:-hexstrike-ai}"
PORT="${HEXSTRIKE_PORT:-8888}"
BIND="${HEXSTRIKE_BIND:-127.0.0.1}"
BUILD_LOG="${BUILD_LOG:-${ROOT_DIR}/build.log}"
FAST_BUILD="${FAST_BUILD:-false}"

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

log "building image: ${IMAGE_NAME}"
log "full build log: ${BUILD_LOG}"
log "Docker may spend a long time on apt, go install, and pip install. This is normal on first build."

set +e
docker build --progress=plain "${build_args[@]}" -t "${IMAGE_NAME}" . 2>&1 | tee "${BUILD_LOG}"
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
docker run -d \
  --name "${CONTAINER_NAME}" \
  --env-file .env \
  -e HEXSTRIKE_HOST=0.0.0.0 \
  -e HEXSTRIKE_PORT="${PORT}" \
  -e PYTHONUNBUFFERED=1 \
  -p "${BIND}:${PORT}:8888" \
  -v "${ROOT_DIR}/workspace:/workspace" \
  -v "${ROOT_DIR}/reports:/reports" \
  -v "${ROOT_DIR}/data:/data" \
  -v "${ROOT_DIR}/config:/root/.config/hexstrike" \
  --cap-add NET_RAW \
  --cap-add NET_ADMIN \
  --shm-size=2g \
  --restart unless-stopped \
  "${IMAGE_NAME}"

log "waiting for API..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    log "HexStrike API is ready: http://127.0.0.1:${PORT}/health"
    exit 0
  fi
  if [ $((i % 5)) -eq 0 ]; then
    printf '[api wait %02ds] still waiting for :%s/health\n' "$((i * 2))" "${PORT}"
  fi
  sleep 2
done

warn "API not ready yet. Check logs: docker logs -f ${CONTAINER_NAME}"
docker logs --tail=80 "${CONTAINER_NAME}" 2>&1 || true
exit 1
