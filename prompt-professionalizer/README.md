# Prompt Professionalizer

一个 Manifest V3 Chrome 扩展：把用户在 ChatGPT、Claude、Gemini、DeepSeek、Copilot、Grok、Perplexity、Poe 等 AI 对话框中的口语化输入，一键扩写为专业、结构化、无歧义的提示词。

## 设计目标

该实现吸收两类产品思路，但不复制其代码：

- **Input Improve Helper 路线**：自定义 OpenAI 兼容 Base URL、API Key、模型、Prompt 模板、模型列表拉取。
- **Promptly 路线**：直接注入 AI 对话框、一键增强、快捷键、模板菜单和替换前预览。

## 主要功能

- 支持任意 OpenAI Chat Completions 兼容接口。
- 支持多个模型配置，可为单个模板绑定独立模型或覆盖模型名。
- 内置“专业化表达、结构化增强、安全审计模式、精简去歧义”模板。
- 在 AI 输入框右下角注入“增强”按钮；`Ctrl/Command + Shift + M` 快速优化。
- 替换前展示原文与优化结果，支持编辑、替换、追加、复制、取消。
- 默认自动支持主流 AI 网站；点击扩展图标可打开模型与模板设置。
- API Key 保存在 `chrome.storage.local`，不会写入仓库，也不会发送给扩展作者。
- 模型域名使用 Chrome 可选权限，配置时由用户显式授权。

## 安装

1. 打开 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录 `prompt-professionalizer/`。
5. 打开扩展设置，配置 Base URL、API Key 和模型名称。
6. 点击“验证接口”；回到 AI 对话框，输入内容后点击“增强”。

## 常见接口配置

### OpenAI

- Base URL：`https://api.openai.com`
- Path：`/v1/chat/completions`
- Model：填写账号可用模型

### OpenRouter

- Base URL：`https://openrouter.ai/api`
- Path：`/v1/chat/completions`
- Model：例如 `openai/gpt-4.1-mini`
- 可选附加请求头：`{"HTTP-Referer":"https://your-site.example","X-Title":"Prompt Professionalizer"}`

### 本地 OpenAI 兼容服务

- Base URL：例如 `http://127.0.0.1:1234`
- Path：通常为 `/v1/chat/completions`
- API Key：无鉴权时留空

## 安全边界

- 扩展只有在用户点击“增强”或使用快捷键时，才会读取并发送当前输入框文本。
- 密码框、只读输入框、禁用输入框不会被处理。
- 附加请求头会过滤 `Host`、`Content-Length`、`Origin`、`Referer`、`Cookie` 等高风险头。
- 输出默认先预览，避免模型误改后直接覆盖原内容。
- 不要把企业密钥提交到 Git；生产发布前建议增加密钥导入/导出保护和企业策略管理。

## 目录

- `manifest.json`：Manifest V3 权限、自动注入站点和快捷键。
- `service-worker.js`：配置存储、模型调用、模型列表拉取、超时与响应兼容。
- `content-script.js`：输入框识别、Shadow DOM 注入、预览和内容替换。
- `options.*`：模型与模板配置页。
