#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-hexstrike-ai}"

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  echo "[FAIL] container is not running: ${CONTAINER_NAME}" >&2
  exit 1
fi

docker exec -i "${CONTAINER_NAME}" bash -s <<'EOF'
set +e

core_tools=(
  nmap masscan rustscan arp-scan nbtscan dnsenum dnsrecon fierce amass subfinder nuclei
  httpx katana naabu dnsx tlsx
)

web_tools=(
  ffuf gobuster feroxbuster dirb dirsearch nikto sqlmap wpscan arjun whatweb wafw00f
  sslscan testssl.sh wfuzz commix dalfox gau waybackurls hakrawler assetfinder paramspider
)

service_tools=(
  hydra john hashcat medusa patator netexec enum4linux-ng smbmap responder evil-winrm
  snmpcheck onesixtyone ldapsearch redis-cli psql mysql
)

proxy_tools=(
  mitmproxy mitmdump tcpdump tshark zaproxy
)

reverse_tools=(
  trivy checkov kube-hunter kube-bench exiftool binwalk foremost steghide volatility3
  radare2 r2 gdb gdbserver checksec ropgadget ropper nasm strace ltrace
)

check_group() {
  local name="$1"
  shift
  local ok=0 miss=0
  echo "===== ${name} ====="
  for t in "$@"; do
    if command -v "$t" >/dev/null 2>&1; then
      printf '[OK]   %-22s %s\n' "$t" "$(command -v "$t")"
      ok=$((ok + 1))
    else
      printf '[MISS] %-22s\n' "$t"
      miss=$((miss + 1))
    fi
  done
  echo "[SUM] ${name}: OK=${ok} MISS=${miss}"
  echo
}

check_group core "${core_tools[@]}"
check_group web "${web_tools[@]}"
check_group service "${service_tools[@]}"
check_group proxy "${proxy_tools[@]}"
check_group reverse_cloud_misc "${reverse_tools[@]}"

echo "===== wordlists ====="
paths=(
  /usr/share/seclists
  /usr/share/wordlists
  /usr/share/wordlists/rockyou.txt
  /workspace/wordlists/hexstrike-custom/custom/high-value-web.txt
  /workspace/wordlists/hexstrike-custom/custom/high-value-params.txt
  /workspace/wordlists/hexstrike-custom/custom/api-sensitive.txt
  /workspace/wordlists/hexstrike-custom/custom/backup-ext.txt
)
for p in "${paths[@]}"; do
  if [ -e "$p" ]; then
    printf '[OK]   %s\n' "$p"
  else
    printf '[MISS] %s\n' "$p"
  fi
done

echo
echo "===== quick counts ====="
for p in \
  /workspace/wordlists/hexstrike-custom/custom/high-value-web.txt \
  /workspace/wordlists/hexstrike-custom/custom/high-value-params.txt \
  /workspace/wordlists/hexstrike-custom/custom/api-sensitive.txt \
  /workspace/wordlists/hexstrike-custom/custom/backup-ext.txt; do
  if [ -f "$p" ]; then
    printf '%-75s %s lines\n' "$p" "$(wc -l < "$p")"
  fi
done
EOF
