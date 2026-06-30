#!/usr/bin/env bash
set -euo pipefail

cd /opt/hexstrike

export PATH="/opt/hexstrike/venv/bin:/root/.local/bin:/usr/local/go/bin:/usr/local/bin:${PATH}"
export PYTHONUNBUFFERED="${PYTHONUNBUFFERED:-1}"
export HEXSTRIKE_HOST="${HEXSTRIKE_HOST:-0.0.0.0}"
export HEXSTRIKE_PORT="${HEXSTRIKE_PORT:-8888}"
export HEXSTRIKE_SERVER="${HEXSTRIKE_SERVER:-http://127.0.0.1:${HEXSTRIKE_PORT}}"
export CHROME_BIN="${CHROME_BIN:-/usr/bin/chromium}"
export CHROMEDRIVER_PATH="${CHROMEDRIVER_PATH:-/usr/bin/chromedriver}"
export DISPLAY="${DISPLAY:-:99}"

mkdir -p /workspace /reports /data /root/.config/hexstrike /root/.cache

start_xvfb() {
  if command -v Xvfb >/dev/null 2>&1; then
    if ! pgrep -f "Xvfb ${DISPLAY}" >/dev/null 2>&1; then
      Xvfb "${DISPLAY}" -screen 0 1920x1080x24 >/tmp/xvfb.log 2>&1 &
    fi
  fi
}

case "${1:-server}" in
  server)
    shift || true
    start_xvfb
    exec /opt/hexstrike/venv/bin/python hexstrike_server.py --port "${HEXSTRIKE_PORT}" "$@"
    ;;

  mcp)
    shift || true
    exec /opt/hexstrike/venv/bin/python hexstrike_mcp.py --server "${HEXSTRIKE_SERVER}" "$@"
    ;;

  shell|bash)
    shift || true
    exec /bin/bash "$@"
    ;;

  check|tools)
    echo "[+] Python: $(/opt/hexstrike/venv/bin/python --version 2>&1)"
    echo "[+] HexStrike dir: /opt/hexstrike"
    echo "[+] API: ${HEXSTRIKE_SERVER}"
    echo "[+] Checking common tools..."
    for t in nmap masscan rustscan amass subfinder nuclei httpx katana ffuf gobuster feroxbuster dirb dirsearch nikto sqlmap hydra john hashcat netexec enum4linux-ng responder radare2 gdb binwalk exiftool chromium chromedriver; do
      if command -v "$t" >/dev/null 2>&1; then
        printf '[OK] %-18s -> %s\n' "$t" "$(command -v "$t")"
      else
        printf '[MISS] %-16s\n' "$t"
      fi
    done
    ;;

  *)
    exec "$@"
    ;;
esac
