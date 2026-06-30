# HexStrike Docker 重构版

这版只保留一条清晰链路：

```text
Docker 只跑 HexStrike API：127.0.0.1:8888
物理机只跑 MCP：.venv-mcp -> upstream/hexstrike-ai/hexstrike_mcp.py
ChatGPT / tunnel-client 只连接物理机 MCP
```

不再默认使用 Docker MCP，不再使用 Compose，不再使用随机端口。

## 1. 从零安装

```bash
cd /root
rm -rf chatgptnew

git clone https://github.com/koneat/chatgptnew.git
cd chatgptnew/hexstrike-docker

chmod +x scripts/docker-run.sh
./scripts/docker-run.sh
```

验证 API：

```bash
docker ps -a | grep hexstrike
docker port hexstrike-ai
curl -i http://127.0.0.1:8888/api/cache/stats
```

正确端口必须是：

```text
127.0.0.1:8888->8888/tcp
```

`/health` 会检查很多工具，慢、刷日志，不能当启动判断。优先用：

```bash
curl -i http://127.0.0.1:8888/api/cache/stats
```

## 2. 物理机 MCP 安装

```bash
cd /root/chatgptnew/hexstrike-docker

apt-get update
apt-get install -y python3-venv python3-full git wget unzip

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
```

验证 MCP 命令：

```bash
export HEXSTRIKE_SERVER=http://127.0.0.1:8888
.venv-mcp/bin/python /root/chatgptnew/hexstrike-docker/hexstrike_mcp.py --print-command
```

正常输出类似：

```text
/root/chatgptnew/hexstrike-docker/.venv-mcp/bin/python /root/chatgptnew/hexstrike-docker/upstream/hexstrike-ai/hexstrike_mcp.py --server http://127.0.0.1:8888
```

## 3. tunnel-client 按原流程接入

```bash
cd /root/chatgptnew/hexstrike-docker

wget -O tunnel-client.zip https://persistent.oaistatic.com/tunnel-client/v0.0.9--context-conduit-topaz/tunnel-client-v0.0.9--context-conduit-topaz-linux-amd64.zip
unzip -o tunnel-client.zip
rm -rf tunnel-client.zip
chmod +x ./tunnel-client

export CONTROL_PLANE_API_KEY="你的真实 key"
export HEXSTRIKE_SERVER=http://127.0.0.1:8888

rm -rf /root/.config/tunnel-client/hexstrike-mcp.yaml

./tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile hexstrike-mcp \
  --tunnel-id tunnel_6a426xxxxxxxxxx1819a \
  --mcp-command "/root/chatgptnew/hexstrike-docker/.venv-mcp/bin/python /root/chatgptnew/hexstrike-docker/hexstrike_mcp.py"

./tunnel-client run --profile hexstrike-mcp --health.listen-addr 127.0.0.1:8016
```

注意：`8016/health` 返回 404 不一定是错误，说明 tunnel-client 的 HTTP 监听在，但该路径不存在。判断 MCP 看 tunnel-client 前台日志。

## 4. 常用排障

API：

```bash
docker ps -a | grep hexstrike
docker port hexstrike-ai
curl -i http://127.0.0.1:8888/api/cache/stats
docker logs --tail=200 hexstrike-ai
```

MCP：

```bash
cd /root/chatgptnew/hexstrike-docker
export HEXSTRIKE_SERVER=http://127.0.0.1:8888
.venv-mcp/bin/python hexstrike_mcp.py --print-command
```

如果 tunnel-client 报：

```text
rpc_method="initialize"
error="write |1: file already closed"
```

说明 MCP 子进程启动后马上退出。先手动运行下面命令看真实报错：

```bash
cd /root/chatgptnew/hexstrike-docker
export HEXSTRIKE_SERVER=http://127.0.0.1:8888
.venv-mcp/bin/python hexstrike_mcp.py
```

## 5. 安全提醒

默认只绑定本机：

```text
127.0.0.1:8888 -> 8888/tcp
```

不要把 8888 裸露公网。需要远程接入时用可信隧道、VPN、Cloudflare Access 或类似访问控制。
