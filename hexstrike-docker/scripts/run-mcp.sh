#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

CONTAINER_NAME="${HEXSTRIKE_CONTAINER_NAME:-hexstrike-ai}"
export HEXSTRIKE_SERVER="${HEXSTRIKE_SERVER:-http://127.0.0.1:${HEXSTRIKE_PORT:-8888}}"

docker exec -i \
  -e HEXSTRIKE_SERVER="${HEXSTRIKE_SERVER}" \
  "${CONTAINER_NAME}" \
  /entrypoint.sh mcp
