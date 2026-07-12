# Prompt Professionalizer

Manifest V3 Chrome 扩展：在 ChatGPT、Claude、Gemini 等 AI 对话框末端显示一个 `P` 按钮，把口语化输入一键改写为专业、结构化、无歧义的提示词，并直接替换原文。

## v0.3.0 交互

- ChatGPT、Claude、Gemini 页面中，找到可编辑对话框后显示绿色圆形 `P`，绿色表示当前页面适配可用。
- 左键 `P`：调用当前模型，完成后直接替换输入框。
- 右键 `P`：打开模板菜单；选择后立即保存为默认模式。
- `Shift + 左键 P` 也可打开模板菜单。
- 默认只提供一个“专业化表达”模板，需要其他模式时在设置页自行添加。

## 默认模型配置

- Base URL：`https://api.openai.com/v1`
- 接口路径：`/chat/completions`
- Temperature：`0.3`
- 请求超时：`6000` 毫秒
- 最大输入：`9999` 字符

请求超时和最大输入字符数属于每个模型配置，切换模型配置时会分别保存。

## 安装

1. 解压扩展包。
2. 打开 `chrome://extensions/`。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择 `prompt-professionalizer/`。
5. 打开扩展设置，填写 Base URL、API Key 和模型名称。
6. 点击“验证接口”，刷新 ChatGPT、Claude 或 Gemini。

## OpenAI 兼容接口说明

扩展会把 Base URL 与接口路径拼接。例如：

```text
Base URL: https://api.openai.com/v1
Path:     /chat/completions
最终地址: https://api.openai.com/v1/chat/completions
```

本地或代理接口可按实际路由修改 Base URL 与 Path。

## 安全边界

- 仅在用户点击 `P`、使用快捷键或右键菜单命令时读取并发送当前输入。
- API Key 保存在 `chrome.storage.local`，网页 Content Script 无法读取。
- 不处理密码框、只读框和禁用输入框。
- 附加请求头过滤 `Host`、`Content-Length`、`Origin`、`Referer`、`Cookie`。
- 模型结果直接替换原文，重要内容请先复制备份。
