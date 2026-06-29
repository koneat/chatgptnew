# DevSpace no-auth patch kit

这个仓库放的是 `Waishnav/devspace` 的 no-auth 补丁包，不是完整源码镜像。

## 结论

补丁会把 DevSpace 的 `/mcp` OAuth / Owner password / Bearer token 认证去掉，同时去掉启动时对 `DEVSPACE_OAUTH_OWNER_TOKEN` 的强制要求。

我保留了一个安全闸门：认证关闭后默认只允许监听本机回环地址，例如 `127.0.0.1`、`localhost`、`::1`。如果你强行用 `HOST=0.0.0.0` 或公网隧道裸暴露，需要显式设置：

```bash
DEVSPACE_INSECURE_NO_AUTH_ALLOW_NETWORK=1
```

不建议公网裸奔。这个 MCP 服务带本地文件读写和 shell 执行能力，暴露后等于把你机器上的项目目录交给任何能访问该 URL 的人。

## 使用方法

```bash
# 1. 拉原项目
cd /root/Desktop
git clone https://github.com/Waishnav/devspace.git devspace-noauth
cd devspace-noauth

# 2. 拉这个补丁仓库
cd /root/Desktop
git clone https://github.com/koneat/chatgptnew.git

# 3. 打补丁
python3 /root/Desktop/chatgptnew/scripts/apply-devspace-no-auth-local.py /root/Desktop/devspace-noauth

# 4. 安装、构建、启动
cd /root/Desktop/devspace-noauth
npm install --include=dev
npm run build
HOST=127.0.0.1 PORT=7676 npm run start
```

连接地址：

```text
http://127.0.0.1:7676/mcp
```

## 如果你坚持走隧道

必须自己加外层访问控制，例如 Cloudflare Access、Tailscale ACL、ngrok basic auth、Nginx IP 白名单。裸露运行命令如下，但风险很高：

```bash
DEVSPACE_INSECURE_NO_AUTH_ALLOW_NETWORK=1 \
HOST=0.0.0.0 \
PORT=7676 \
DEVSPACE_PUBLIC_BASE_URL=https://你的隧道域名 \
npm run start
```

## 补丁改动点

- `src/server.ts`
  - 删除 `mcpAuthRouter` OAuth 注册路由。
  - 删除 `/mcp` 请求前的 `requireBearerAuth` 校验。
  - 删除 OAuth resource 校验。
  - 启动日志改成 `auth: disabled`。
  - 增加 no-auth 下的非回环监听保护。
- `src/config.ts`
  - `parseOAuthConfig()` 不再因为缺少 `DEVSPACE_OAUTH_OWNER_TOKEN` 直接退出。

## 回滚

```bash
git checkout -- src/server.ts src/config.ts
```

## 注意

这个补丁只适合你自己本地测试或受控内网环境。生产环境不要这样用。
