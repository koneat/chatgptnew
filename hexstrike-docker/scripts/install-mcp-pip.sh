#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

VENV_DIR="${VENV_DIR:-.venv-mcp}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if [ ! -d "${VENV_DIR}" ]; then
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

"${VENV_DIR}/bin/python" -m pip install --upgrade pip setuptools wheel
"${VENV_DIR}/bin/pip" install -r requirements-mcp.txt

echo "[OK] MCP pip env ready: ${ROOT_DIR}/${VENV_DIR}"
echo "Use: ${ROOT_DIR}/${VENV_DIR}/bin/python ${ROOT_DIR}/hexstrike_mcp.py"
