# Prompt Professionalizer

一个 Manifest V3 Chrome 扩展：在 ChatGPT、Claude、Gemini、DeepSeek、Copilot、Grok、Perplexity、Poe 等 AI 对话框侧边直接优化提示词。

## 交互方式

1. 在 AI 对话框输入内容。
2. 单击输入框侧边显示的当前模板名称。
3. 扩展调用已配置的 OpenAI 兼容模型，并直接替换输入框内容。
4. 点击右侧下拉按钮选择模板；选择结果会立即保存，后续持续使用该模式。

不再弹出替换预览，也不需要二次确认。

## 主要功能

- 支持 OpenAI Chat Completions 兼容接口。
- 支持多个全局模型接口配置，模板统一使用当前选中的模型。
- 支持自定义 Base URL、接口路径、API Key、模型名、Temperature 和附加请求头。
- 支持拉取 `/v1/models` 模型列表和验证接口。
- 内置“专业化表达、结构化增强、安全审计模式、精简去歧义”模板。
- 模板只包含名称和优化规则，不包含图标、独立 Provider 或模型覆盖配置。
- 单击侧边按钮直接优化并替换；`Ctrl/Command + Shift + M` 同样可以执行。
- 针对 Claude ProseMirror 和 Gemini rich-textarea/Quill 输入框增加专用识别、定位和写入逻辑。
- API Key 保存在 `chrome.storage.local`，不会写入仓库，也不会暴露给页面脚本。
- 模型域名使用 Chrome 可选权限，由用户显式授权。

## 安装

1. 打开 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录 `prompt-professionalizer/`。
5. 打开扩展设置，配置 Base URL、API Key 和模型名称。
6. 点击“验证接口”。
7. 刷新已打开的 Claude、Gemini 或其他 AI 页面。

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

## Claude 与 Gemini 适配

Claude 优先识别：

- `.ProseMirror[contenteditable="true"]`
- `fieldset` 或 `form` 内的可编辑对话框

Gemini 优先识别：

- `rich-textarea .ql-editor[contenteditable="true"]`
- `.ql-editor[contenteditable="true"]`
- 带 prompt 语义的 contenteditable 输入框

写入时会触发 `beforeinput`、`input`、`change` 事件，并在 ProseMirror 写入失败时使用段落节点回退，降低页面框架状态未同步的问题。

## 安全边界

- 只有用户单击侧边按钮、右键菜单或快捷键时，才会发送当前输入框内容。
- 密码框、只读框、禁用输入框不会被处理。
- 附加请求头会过滤 `Host`、`Content-Length`、`Origin`、`Referer`、`Cookie`。
- Content Script 只能获取公开模板信息，无法读取 API Key。
- 模型输出会直接覆盖原输入；重要内容建议先复制备份。

## 目录

- `manifest.json`：Manifest V3 权限、自动注入站点和快捷键。
- `service-worker.js`：配置存储、默认模板持久化、模型调用和响应解析。
- `content-script.js`：输入框识别、Claude/Gemini 适配、侧边按钮和直接替换。
- `options.*`：全局模型接口与模板配置页。
