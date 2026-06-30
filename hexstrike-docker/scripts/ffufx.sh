#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
ffufx - HexStrike Docker ffuf helper

Usage:
  ffufx.sh dir   https://target.com/FUZZ
  ffufx.sh file  https://target.com/FUZZ
  ffufx.sh param https://target.com/page.php?FUZZ=1
  ffufx.sh api   https://target.com/FUZZ
  ffufx.sh vhost https://target.com/ example.com

Options via env:
  RATE=50                         requests per second limit
  THREADS=20                      ffuf threads
  TIMEOUT=10                      timeout seconds
  MATCH=all                       matcher, default all
  FILTER_STATUS=404               filter status, comma separated
  FILTER_SIZE=                    filter size
  FILTER_WORDS=                   filter words
  FILTER_LINES=                   filter lines
  EXT=php,js,json,txt,bak,zip     file extensions for file mode
  OUT=/reports/ffuf.json          output file
  WORDLIST=/path/to/list.txt      override wordlist

Examples:
  ffufx.sh dir https://example.com/FUZZ
  ffufx.sh file https://example.com/FUZZ
  EXT=php,js,json,map ffufx.sh file https://example.com/FUZZ
  ffufx.sh param 'https://example.com/api/user?FUZZ=1'
  ffufx.sh api https://example.com/FUZZ
  ffufx.sh vhost https://1.2.3.4/ example.com
EOF
}

MODE="${1:-}"
TARGET="${2:-}"
EXTRA="${3:-}"

if [[ -z "${MODE}" || -z "${TARGET}" || "${MODE}" == "-h" || "${MODE}" == "--help" ]]; then
  usage
  exit 0
fi

RATE="${RATE:-50}"
THREADS="${THREADS:-20}"
TIMEOUT="${TIMEOUT:-10}"
MATCH="${MATCH:-all}"
FILTER_STATUS="${FILTER_STATUS:-404}"
FILTER_SIZE="${FILTER_SIZE:-}"
FILTER_WORDS="${FILTER_WORDS:-}"
FILTER_LINES="${FILTER_LINES:-}"
OUT="${OUT:-/reports/ffuf-${MODE}-$(date +%Y%m%d-%H%M%S).json}"
EXT="${EXT:-php,asp,aspx,jsp,do,action,html,htm,js,json,txt,xml,yml,yaml,conf,config,bak,old,zip,tar.gz,7z,sql,log}"

CUSTOM_DIR="/workspace/wordlists/custom"
REPO_CUSTOM_DIR="/opt/hexstrike-docker-wordlists/custom"

pick_wordlist() {
  local fallback="$1"
  local custom="$2"
  if [[ -n "${WORDLIST:-}" ]]; then
    echo "${WORDLIST}"
  elif [[ -f "${custom}" ]]; then
    echo "${custom}"
  elif [[ -f "${fallback}" ]]; then
    echo "${fallback}"
  else
    find /usr/share/seclists -type f | head -n 1
  fi
}

COMMON_ARGS=(
  -u "${TARGET}"
  -t "${THREADS}"
  -rate "${RATE}"
  -timeout "${TIMEOUT}"
  -mc "${MATCH}"
  -of json
  -o "${OUT}"
)

if [[ -n "${FILTER_STATUS}" ]]; then COMMON_ARGS+=( -fc "${FILTER_STATUS}" ); fi
if [[ -n "${FILTER_SIZE}" ]]; then COMMON_ARGS+=( -fs "${FILTER_SIZE}" ); fi
if [[ -n "${FILTER_WORDS}" ]]; then COMMON_ARGS+=( -fw "${FILTER_WORDS}" ); fi
if [[ -n "${FILTER_LINES}" ]]; then COMMON_ARGS+=( -fl "${FILTER_LINES}" ); fi

case "${MODE}" in
  dir)
    WL="$(pick_wordlist /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt ${REPO_CUSTOM_DIR}/high-value-web.txt)"
    ;;
  file)
    WL="$(pick_wordlist /usr/share/seclists/Discovery/Web-Content/raft-medium-files.txt ${REPO_CUSTOM_DIR}/high-value-web.txt)"
    COMMON_ARGS+=( -e "${EXT}" )
    ;;
  param)
    WL="$(pick_wordlist /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt ${REPO_CUSTOM_DIR}/high-value-params.txt)"
    ;;
  api)
    WL="$(pick_wordlist /usr/share/seclists/Discovery/Web-Content/raft-small-words.txt ${REPO_CUSTOM_DIR}/api-sensitive.txt)"
    COMMON_ARGS+=( -e "json,txt,yml,yaml,xml,map,js" )
    ;;
  vhost)
    if [[ -z "${EXTRA}" ]]; then
      echo "[ERR] vhost mode needs base domain as third argument" >&2
      exit 2
    fi
    WL="$(pick_wordlist /usr/share/seclists/Discovery/DNS/subdomains-top1million-20000.txt ${REPO_CUSTOM_DIR}/high-value-web.txt)"
    COMMON_ARGS+=( -H "Host: FUZZ.${EXTRA}" )
    ;;
  *)
    echo "[ERR] unknown mode: ${MODE}" >&2
    usage
    exit 2
    ;;
esac

mkdir -p "$(dirname "${OUT}")"

echo "[+] mode      : ${MODE}"
echo "[+] target    : ${TARGET}"
echo "[+] wordlist  : ${WL}"
echo "[+] rate      : ${RATE}"
echo "[+] threads   : ${THREADS}"
echo "[+] output    : ${OUT}"

exec ffuf "${COMMON_ARGS[@]}" -w "${WL}"
