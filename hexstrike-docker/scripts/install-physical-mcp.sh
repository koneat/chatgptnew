#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

VENV_DIR="${VENV_DIR:-.venv-mcp}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
UPSTREAM_REPO="${HEXSTRIKE_REPO:-https://github.com/0x4m4/hexstrike-ai.git}"
UPSTREAM_REF="${HEXSTRIKE_REF:-master}"
UPSTREAM_DIR="${UPSTREAM_DIR:-upstream/hexstrike-ai}"

if ! "${PYTHON_BIN}" -m venv --help >/dev/null 2>&1; then
  echo "[ERR] python venv module is missing." >&2
  echo "Install it first:" >&2
  echo "  apt-get update && apt-get install -y python3-venv python3-full git" >&2
  exit 2
fi

if ! command -v git >/dev/null 2>&1; then
  echo "[ERR] git is missing. Install it first:" >&2
  echo "  apt-get update && apt-get install -y git" >&2
  exit 2
fi

mkdir -p upstream

if [ ! -d "${UPSTREAM_DIR}/.git" ]; then
  echo "[+] cloning upstream HexStrike: ${UPSTREAM_REPO}"
  git clone --depth 1 --branch "${UPSTREAM_REF}" "${UPSTREAM_REPO}" "${UPSTREAM_DIR}"
else
  echo "[+] updating upstream HexStrike: ${UPSTREAM_DIR}"
  git -C "${UPSTREAM_DIR}" fetch --depth 1 origin "${UPSTREAM_REF}"
  git -C "${UPSTREAM_DIR}" checkout -f FETCH_HEAD
fi

if [ ! -d "${VENV_DIR}" ]; then
  echo "[+] creating venv: ${VENV_DIR}"
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

echo "[+] installing physical MCP dependencies into ${VENV_DIR}"
"${VENV_DIR}/bin/python" -m pip install --upgrade pip setuptools wheel
"${VENV_DIR}/bin/pip" install -r requirements-mcp.txt

echo "[+] checking MCP import"
"${VENV_DIR}/bin/python" - <<'PY'
import requests
from mcp.server.fastmcp import FastMCP
print('[OK] requests and mcp.server.fastmcp import successfully')
PY

echo "[OK] Physical MCP ready"
echo "Run API first if needed: ./scripts/docker-run.sh"
echo "Run MCP on physical host: ${ROOT_DIR}/${VENV_DIR}/bin/python ${ROOT_DIR}/hexstrike_mcp.py"
