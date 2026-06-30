#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

TUNNEL_URL="${TUNNEL_URL:-https://persistent.oaistatic.com/tunnel-client/v0.0.9--context-conduit-topaz/tunnel-client-v0.0.9--context-conduit-topaz-linux-amd64.zip}"
TUNNEL_PROFILE="${TUNNEL_PROFILE:-hexstrike-mcp}"
TUNNEL_ID="${TUNNEL_ID:-${HEXSTRIKE_TUNNEL_ID:-}}"
HEALTH_ADDR="${HEALTH_ADDR:-127.0.0.1:8016}"
HEXSTRIKE_HOST_PORT="${HEXSTRIKE_HOST_PORT:-8888}"
HEXSTRIKE_BIND="${HEXSTRIKE_BIND:-127.0.0.1}"

log() { printf '[+] %s\n' "$*"; }
fail() { printf '[!] %s\n' "$*" >&2; exit 1; }

[ -n "${CONTROL_PLANE_API_KEY:-}" ] || fail "CONTROL_PLANE_API_KEY is not set"
[ -n "${TUNNEL_ID}" ] || fail "TUNNEL_ID is not set"

if command -v apt-get >/dev/null 2>&1; then
  log "installing host packages"
  apt-get update
  apt-get install -y ca-certificates curl wget unzip git python3 python3-venv python3-full
fi

command -v docker >/dev/null 2>&1 || fail "docker command not found"

unset HEXSTRIKE_PORT || true
export HEXSTRIKE_HOST_PORT HEXSTRIKE_BIND

log "starting HexStrike Docker API on ${HEXSTRIKE_BIND}:${HEXSTRIKE_HOST_PORT}->8888"
chmod +x scripts/docker-run.sh
./scripts/docker-run.sh

log "checking fixed Docker port mapping"
docker port hexstrike-ai | grep -q "${HEXSTRIKE_BIND}:${HEXSTRIKE_HOST_PORT}" || {
  docker ps -a | grep hexstrike || true
  docker port hexstrike-ai || true
  fail "port mapping is not ${HEXSTRIKE_BIND}:${HEXSTRIKE_HOST_PORT}->8888"
}

log "checking lightweight API readiness"
curl -fsS "http://${HEXSTRIKE_BIND}:${HEXSTRIKE_HOST_PORT}/api/cache/stats" >/dev/null

log "preparing launcher venv"
python3 -m venv .venv-mcp
.venv-mcp/bin/python -m pip install --upgrade pip setuptools wheel
if [ -f requirements-mcp.txt ]; then
  .venv-mcp/bin/pip install -r requirements-mcp.txt
fi

log "downloading tunnel-client"
rm -f tunnel-client tunnel-client.zip
wget -O tunnel-client.zip "${TUNNEL_URL}"
unzip -o tunnel-client.zip >/dev/null
rm -f tunnel-client.zip
chmod +x ./tunnel-client

log "checking MCP launcher command"
.venv-mcp/bin/python hexstrike_mcp.py --mode docker --print-command

log "initializing tunnel profile: ${TUNNEL_PROFILE}"
rm -f "/root/.config/tunnel-client/${TUNNEL_PROFILE}.yaml"
./tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile "${TUNNEL_PROFILE}" \
  --tunnel-id "${TUNNEL_ID}" \
  --mcp-command "${ROOT_DIR}/.venv-mcp/bin/python ${ROOT_DIR}/hexstrike_mcp.py --mode docker"

log "starting tunnel-client. Keep this terminal open."
exec ./tunnel-client run --profile "${TUNNEL_PROFILE}" --health.listen-addr "${HEALTH_ADDR}"
