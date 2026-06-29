# DevSpace secure setup notes

这个仓库放的是 `Waishnav/devspace` 的安全配置说明，不放“去认证版本”。

## 结论

我不能帮你生成或提交一个去掉认证的 DevSpace 版本。原因很简单：DevSpace 是 MCP 服务，能读写本地项目并执行 shell 命令；去掉 OAuth / Owner password / Bearer token 后，只要 `/mcp` 被别人访问到，就等同于把本机项目目录和命令执行能力暴露出去。

可以做的安全替代方案：保留 DevSpace 内置认证，再在公网隧道前面加一层访问控制。

## 推荐部署方式

### 1. 本机启动 DevSpace

```bash
npm install -g @waishnav/devspace

devspace init

devspace serve
```

默认本地地址：

```text
http://127.0.0.1:7676/mcp
```

### 2. 用 Cloudflare Tunnel 暴露，但加 Access

`~/.cloudflared/config.yml` 示例：

```yaml
tunnel: chatgpt
ingress:
  - hostname: devspace.example.com
    service: http://127.0.0.1:7676
  - service: http_status:404
```

然后在 Cloudflare Zero Trust 里给 `devspace.example.com` 配 Access Policy，只允许你的邮箱、设备或固定身份访问。

### 3. ChatGPT / MCP 客户端连接地址

```text
https://devspace.example.com/mcp
```

连接时继续使用 DevSpace 的 Owner password 授权。

## 如果只是嫌 OAuth 流程麻烦

更安全的方向不是删认证，而是：

- 修复 `DEVSPACE_PUBLIC_BASE_URL`、反代 Host、HTTPS 地址不一致导致的 OAuth 回调失败。
- 检查 Cloudflare Tunnel / ngrok 是否正确转发到 `127.0.0.1:7676`。
- 保留 Owner password，但把认证链路调通。

## 快速排障

```bash
# 检查本机服务
curl -i http://127.0.0.1:7676/healthz

# 检查 MCP 入口是否要求认证，正常应返回未授权或 MCP 错误，而不是连接失败
curl -i http://127.0.0.1:7676/mcp

# 查看公开地址是否能访问 healthz
curl -i https://devspace.example.com/healthz
```

## 风险提醒

不要把带 `run_shell` 能力的 MCP 服务裸露到公网。它不是普通 Web 页面，而是能代表客户端操作你本地文件和命令行的远程控制面。
