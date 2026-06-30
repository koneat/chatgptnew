#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

VENV_DIR="${VENV_DIR:-.venv-mcp}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if ! "${PYTHON_BIN}" -m venv --help >/dev/null 2>&1; then
  echo "[ERR] python venv module is missing." >&2
  echo "Install it first:" >&2
  echo "  apt-get update && apt-get install -y python3-venv python3-full" >&2
  exit 2
fi

if [ ! -d "${VENV_DIR}" ]; then
  echo "[+] creating venv: ${VENV_DIR}"
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

echo "[+] installing MCP optional deps into venv, not system Python"
"${VENV_DIR}/bin/python" -m pip install --upgrade pip setuptools wheel
"${VENV_DIR}/bin/pip" install -r requirements-mcp.txt

echo "[OK] MCP pip env ready: ${ROOT_DIR}/${VENV_DIR}"
echo "Use: ${ROOT_DIR}/${VENV_DIR}/bin/python ${ROOT_DIR}/hexstrike_mcp.py"
