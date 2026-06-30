#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

IMAGE_NAME="${IMAGE_NAME:-hexstrike-ai:docker}"
CONTAINER_NAME="${CONTAINER_NAME:-hexstrike-ai}"
PORT="${HEXSTRIKE_PORT:-8888}"
BIND="${HEXSTRIKE_BIND:-127.0.0.1}"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[+] created .env from .env.example"
  echo "[!] edit .env and change HEXSTRIKE_API_KEY after first start"
fi

mkdir -p workspace reports data config

echo "[+] building image: ${IMAGE_NAME}"
docker build -t "${IMAGE_NAME}" .

if docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  echo "[+] removing existing container: ${CONTAINER_NAME}"
  docker rm -f "${CONTAINER_NAME}" >/dev/null
fi

echo "[+] starting container: ${CONTAINER_NAME}"
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

echo "[+] waiting for API..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    echo "[OK] HexStrike API is ready: http://127.0.0.1:${PORT}/health"
    exit 0
  fi
  sleep 2
done

echo "[!] API not ready yet. Check logs: docker logs -f ${CONTAINER_NAME}"
exit 1
