#!/usr/bin/env bash
set -euo pipefail

PORT="${HEXSTRIKE_PORT:-8888}"
URL="http://127.0.0.1:${PORT}/api/cache/stats"

curl -fsS --max-time 5 "$URL" >/dev/null
