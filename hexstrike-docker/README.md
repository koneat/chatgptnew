# HexStrike Docker

基于上游 `0x4m4/hexstrike-ai` 的 Docker 化部署版本。目标是：一条命令启动 HexStrike API，工具尽量装全，第三方平台 Key 统一走 `.env`，方便接 Claude / Cursor / 本地 MCP 客户端。

> 仅用于合法授权测试环境。默认只绑定 `127.0.0.1`。本版本不内置 API Key 校验，不要把 8888 端口裸露到公网。

## 已做的增强

- 使用 `kalilinux/kali-rolling` 作为基础镜像，优先兼容安全工具生态。
- 构建时自动拉取上游 `https://github.com/0x4m4/hexstrike-ai`。
- 自动安装 Python 依赖、系统工具、Go 工具、Python CLI 工具。
- 不启用 Docker 层 API Key，保持本地使用简单。
- 顶层提供 `hexstrike_mcp.py`，默认在物理机运行 MCP，连接 `127.0.0.1:8888` API。
- `.env` 集中管理 Shodan、Censys、VT、GitHub、FOFA、Hunter 等第三方 Key。
- 内置 ffuf 常用字典速查、自定义高价值字典和 `ffufx` 一键模板。
- 提供 `docker compose`、`docker run`、`Makefile`、MCP 客户端配置示例。

## 文件结构

```text
hexstrike-docker/
├── hexstrike_mcp.py
├── requirements-mcp.txt
├── Dockerfile
├── docker-compose.yml
├── Makefile
├── .env.example
├── .dockerignore
├── docker/
│   ├── entrypoint.sh
│   ├── install-tools.sh
│   └── patch_hexstrike.py
├── scripts/
│   ├── docker-run.sh
│   ├── install-mcp-pip.sh
│   ├── run-mcp.sh
│   ├── ffufx.sh
│   └── healthcheck.sh
├── wordlists/
│   ├── ffuf-paths.md
│   └── custom/
│       ├── high-value-web.txt
│       ├── high-value-params.txt
│       ├── backup-ext.txt
│       └── api-sensitive.txt
└── config/
    └── claude_desktop_config.example.json
```

## 快速启动 API

如果你没有 `docker compose`，直接用最简单方案：

```bash
cd hexstrike-docker
chmod +x scripts/docker-run.sh
./scripts/docker-run.sh
```

如果你有 Compose：

```bash
cd hexstrike-docker
cp .env.example .env
nano .env

docker compose build
docker compose up -d
```

查看健康状态：

```bash
curl http://127.0.0.1:8888/health
```

测试 nmap API：

```bash
curl -H "Content-Type: application/json" \
  -d '{"target":"example.com","scan_type":"-sV"}' \
  http://127.0.0.1:8888/api/tools/nmap
```

## 物理机 MCP 安装命令

不要直接用系统 pip；Debian / Kali 会触发 PEP 668。按下面命令建 venv。

```bash
cd chatgptnew/hexstrike-docker

apt-get update
apt-get install -y python3-venv python3-full git

mkdir -p upstream

if [ ! -d upstream/hexstrike-ai/.git ]; then
  git clone --depth 1 --branch master https://github.com/0x4m4/hexstrike-ai.git upstream/hexstrike-ai
else
  git -C upstream/hexstrike-ai fetch --depth 1 origin master
  git -C upstream/hexstrike-ai checkout -f FETCH_HEAD
fi

python3 -m venv .venv-mcp
.venv-mcp/bin/python -m pip install --upgrade pip setuptools wheel
.venv-mcp/bin/pip install -r requirements-mcp.txt

.venv-mcp/bin/python - <<'PY'
import requests
from mcp.server.fastmcp import FastMCP
print('[OK] physical MCP dependencies are ready')
PY
```

启动物理机 MCP：

```bash
cd chatgptnew/hexstrike-docker
.venv-mcp/bin/python hexstrike_mcp.py --print-command
.venv-mcp/bin/python hexstrike_mcp.py
```

默认链路：

```text
MCP 客户端 -> 物理机 .venv-mcp/bin/python -> hexstrike_mcp.py -> upstream/hexstrike-ai/hexstrike_mcp.py -> http://127.0.0.1:8888
```

## 常用命令

```bash
make init              # 复制 .env.example 到 .env，并创建目录
make build             # 构建镜像
make up                # 后台启动
make logs              # 看日志
make shell             # 进入容器
.venv-mcp/bin/python hexstrike_mcp.py  # 物理机 MCP
make health            # 健康检查
make down              # 停止
```

不用 Compose 的一条龙重装 API：

```bash
docker rm -f hexstrike-ai 2>/dev/null || true
docker rmi hexstrike-ai:docker 2>/dev/null || true
./scripts/docker-run.sh
```

## ffuf 快速用法

进入容器：

```bash
docker exec -it hexstrike-ai bash
```

目录扫描：

```bash
ffufx dir https://example.com/FUZZ
```

文件扫描：

```bash
ffufx file https://example.com/FUZZ
```

带扩展名：

```bash
EXT=php,js,json,map,bak,zip ffufx file https://example.com/FUZZ
```

参数发现：

```bash
ffufx param 'https://example.com/api/user?FUZZ=1'
```

API / Swagger / SourceMap / 配置路径：

```bash
ffufx api https://example.com/FUZZ
```

虚拟主机 Host 头探测：

```bash
ffufx vhost https://1.2.3.4/ example.com
```

控制速率和线程：

```bash
RATE=20 THREADS=10 ffufx dir https://example.com/FUZZ
```

自定义字典：

```bash
WORDLIST=/usr/share/seclists/Discovery/Web-Content/raft-large-directories.txt \
  ffufx dir https://example.com/FUZZ
```

结果默认写到：

```text
/reports/ffuf-模式-时间.json
```

更多字典路径看：

```text
wordlists/ffuf-paths.md
```

容器内也会复制到：

```text
/opt/hexstrike-docker-wordlists
/workspace/wordlists/hexstrike-custom
```

## MCP 客户端配置

把 `/ABSOLUTE/PATH` 换成你的真实路径：

```json
{
  "mcpServers": {
    "hexstrike-ai-physical": {
      "command": "/ABSOLUTE/PATH/hexstrike-docker/.venv-mcp/bin/python",
      "args": ["/ABSOLUTE/PATH/hexstrike-docker/hexstrike_mcp.py"],
      "timeout": 300,
      "disabled": false
    }
  }
}
```

如果你的路径是 `/root/chatgptnew/hexstrike-docker`：

```json
{
  "mcpServers": {
    "hexstrike-ai-physical": {
      "command": "/root/chatgptnew/hexstrike-docker/.venv-mcp/bin/python",
      "args": ["/root/chatgptnew/hexstrike-docker/hexstrike_mcp.py"],
      "timeout": 300,
      "disabled": false
    }
  }
}
```

注意：这是 stdio MCP 方式。若你要把它接到需要 HTTP/SSE/Streamable HTTP 的平台，需要额外加 MCP 网关或反代桥接层。

## 第三方平台 Key 配置

第三方平台 Key 都放 `.env`：

```bash
SHODAN_API_KEY=
CENSYS_API_ID=
CENSYS_API_SECRET=
VIRUSTOTAL_API_KEY=
URLSCAN_API_KEY=
GITHUB_TOKEN=
FOFA_EMAIL=
FOFA_KEY=
HUNTER_API_KEY=
```

## 工具安装策略

`docker/install-tools.sh` 分三层：

1. 必装基础包：Python、Git、curl、编译工具、Chromium、网络基础工具。
2. Kali apt 安全工具：nmap、masscan、sqlmap、nuclei、gobuster、ffuf、dirsearch、nikto、hydra、john、metasploit、radare2、binwalk、wordlists、seclists 等。单个工具不存在不会中断构建。
3. Go / Python CLI 补充：subfinder、httpx、katana、dnsx、naabu、gau、waybackurls、dalfox、arjun、uro、paramspider 等。失败只报警，不影响核心 API 启动。

如果你只想快速构建，关闭补充安装：

```bash
INSTALL_GO_TOOLS=false INSTALL_PY_TOOLS=false docker build -t hexstrike-ai:docker .
```

## 端口和安全

默认绑定：

```text
127.0.0.1:8888 -> 容器 8888
```

这表示只允许本机访问。Cloudflare Tunnel / SSH Tunnel 可以继续转发本机端口，不建议直接改成 `0.0.0.0` 裸露公网。

如果确实要监听所有网卡：

```bash
HEXSTRIKE_BIND=0.0.0.0 ./scripts/docker-run.sh
```

改成 `0.0.0.0` 后，请放在 VPN、Cloudflare Access、Basic Auth、可信内网或其他访问控制后面。

## 数据目录

- `./workspace`：目标文件、字典、临时测试文件。
- `./reports`：扫描报告输出。
- `./data`：工具缓存、结果、临时数据。
- `./config`：容器内 `/root/.config/hexstrike` 映射目录。

## 排障

```bash
# 看服务日志
docker logs -f hexstrike-ai

# 进入容器
docker exec -it hexstrike-ai bash

# 检查工具是否安装
which nmap sqlmap nuclei subfinder httpx katana ffuf gobuster

# 检查 API
curl http://127.0.0.1:8888/health

# 检查 MCP stdio 是否能启动
.venv-mcp/bin/python hexstrike_mcp.py --print-command
.venv-mcp/bin/python hexstrike_mcp.py
```

## 重要风险点

- 容器内包含大量安全工具，默认以 root 运行，能力很强，不要公开暴露。
- `cap_add: NET_RAW, NET_ADMIN` 是为了 nmap/masscan/arp-scan 等网络工具可用；不需要二层/原始包扫描时可以删掉。
- 不要把真实第三方平台 Key 提交到 GitHub；只提交 `.env.example`。
- 对互联网目标跑高并发扫描前，确认授权范围和速率限制。
