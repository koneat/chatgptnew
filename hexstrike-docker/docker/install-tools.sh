#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
export GOBIN=/usr/local/bin
export GOPATH=/opt/go
export PATH="/usr/local/go/bin:/usr/local/bin:/root/.local/bin:${PATH}"

log() { printf '\n[+] %s\n' "$*"; }
warn() { printf '\n[!] %s\n' "$*" >&2; }

apt_update() {
  apt-get update -y
}

apt_install_required() {
  log "Installing required base packages"
  apt-get install -y --no-install-recommends \
    ca-certificates curl wget git jq unzip zip tar gzip xz-utils \
    bash-completion procps psmisc lsof file less nano vim \
    iproute2 iputils-ping net-tools dnsutils netcat-traditional whois \
    python3 python3-pip python3-venv python3-dev pipx \
    build-essential gcc g++ make cmake pkg-config \
    libffi-dev libssl-dev libxml2-dev libxslt1-dev zlib1g-dev \
    libjpeg-dev libpcap-dev libpq-dev libsqlite3-dev \
    ruby ruby-dev default-jre-headless \
    golang-go cargo \
    chromium chromium-driver xvfb
}

apt_install_optional_one() {
  local pkg="$1"
  if apt-get install -y --no-install-recommends "$pkg"; then
    echo "[OK] apt package: $pkg"
  else
    warn "apt package skipped: $pkg"
  fi
}

apt_install_optional() {
  log "Installing optional Kali security tools. Missing packages will be skipped."
  local packages=(
    nmap masscan rustscan arp-scan nbtscan dnsenum fierce amass subfinder nuclei
    gobuster feroxbuster ffuf dirb dirsearch nikto sqlmap wpscan arjun whatweb wafw00f
    sslscan testssl.sh hydra john hashcat medusa patator netexec enum4linux-ng smbmap responder
    theharvester recon-ng exiftool binwalk foremost steghide sleuthkit testdisk radare2 gdb gdbserver
    checksec ropgadget metasploit-framework exploitdb zaproxy wfuzz commix nosqlmap wordlists seclists
    trivy checkov terrascan kube-hunter kube-bench yersinia bettercap
  )

  for pkg in "${packages[@]}"; do
    apt_install_optional_one "$pkg"
  done
}

go_install_one() {
  local name="$1"
  local module="$2"
  if command -v "$name" >/dev/null 2>&1; then
    echo "[OK] go tool already exists: $name"
    return 0
  fi
  log "go install $name"
  if timeout 900 go install "$module"; then
    echo "[OK] go tool: $name"
  else
    warn "go tool skipped: $name"
  fi
}

install_go_tools() {
  if [ "${INSTALL_GO_TOOLS:-true}" != "true" ]; then
    warn "INSTALL_GO_TOOLS=false, skipping Go tools"
    return 0
  fi

  log "Installing supplemental Go security tools"
  mkdir -p "${GOBIN}" "${GOPATH}"

  go_install_one subfinder github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
  go_install_one httpx github.com/projectdiscovery/httpx/cmd/httpx@latest
  go_install_one katana github.com/projectdiscovery/katana/cmd/katana@latest
  go_install_one nuclei github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
  go_install_one dnsx github.com/projectdiscovery/dnsx/cmd/dnsx@latest
  go_install_one naabu github.com/projectdiscovery/naabu/v2/cmd/naabu@latest
  go_install_one tlsx github.com/projectdiscovery/tlsx/cmd/tlsx@latest
  go_install_one mapcidr github.com/projectdiscovery/mapcidr/cmd/mapcidr@latest
  go_install_one shuffledns github.com/projectdiscovery/shuffledns/cmd/shuffledns@latest
  go_install_one ffuf github.com/ffuf/ffuf/v2@latest
  go_install_one gobuster github.com/OJ/gobuster/v3@latest
  go_install_one gau github.com/lc/gau/v2/cmd/gau@latest
  go_install_one waybackurls github.com/tomnomnom/waybackurls@latest
  go_install_one anew github.com/tomnomnom/anew@latest
  go_install_one qsreplace github.com/tomnomnom/qsreplace@latest
  go_install_one hakrawler github.com/hakluke/hakrawler@latest
  go_install_one dalfox github.com/hahwul/dalfox/v2@latest
  go_install_one jaeles github.com/jaeles-project/jaeles@latest
}

install_python_cli_tools() {
  if [ "${INSTALL_PY_TOOLS:-true}" != "true" ]; then
    warn "INSTALL_PY_TOOLS=false, skipping Python CLI tools"
    return 0
  fi

  log "Installing supplemental Python CLI tools via pipx"
  python3 -m pipx ensurepath || true

  local tools=(
    arjun
    uro
    shodan
    censys
    trufflehog
    socialscan
    paramspider
  )

  for tool in "${tools[@]}"; do
    if command -v "$tool" >/dev/null 2>&1; then
      echo "[OK] python cli already exists: $tool"
      continue
    fi
    if timeout 600 pipx install "$tool"; then
      echo "[OK] python cli: $tool"
    else
      warn "python cli skipped: $tool"
    fi
  done
}

cleanup() {
  log "Cleaning image caches"
  apt-get autoremove -y || true
  apt-get clean || true
  rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
}

apt_update
apt_install_required
apt_install_optional
install_go_tools
install_python_cli_tools
cleanup

log "Tool installation finished"
