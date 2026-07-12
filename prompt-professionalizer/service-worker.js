const STORAGE_KEY = "promptProfessionalizerSettings";

const DEFAULT_SETTINGS = {
  version: 4,
  activeProviderId: "default-openai-compatible",
  defaultTemplateId: "professional",
  globalSystemPrompt: [
    "你是一名资深提示词工程师。",
    "你的任务是重写用户输入，使其意图明确、上下文充分、约束完整、输出要求可执行。",
    "不得回答用户问题，不得添加虚构事实，不得改变原始目标。",
    "只输出优化后的提示词正文，不要解释、不要加标题、不要使用代码围栏。"
  ].join("\n"),
  providers: [
    {
      id: "default-openai-compatible",
      name: "OpenAI 兼容接口",
      baseUrl: "https://api.openai.com/v1",
      path: "/chat/completions",
      apiKey: "",
      model: "gpt-4.1-mini",
      temperature: 0.3,
      timeoutMs: 6000,
      maxInputChars: 9999,
      fastMode: true,
      maxOutputTokens: 1200,
      extraHeaders: "{}"
    }
  ],
  templates: [
    {
      id: "professional",
      name: "专业化表达",
      instruction: "将口语化、大白话表达改写为专业、准确、无歧义的工程语言；补全必要的技术术语，但不要凭空增加事实。"
    }
  ]
};

const SETTINGS_CACHE_TTL_MS = 30000;
const RESPONSE_CACHE_TTL_MS = 5 * 60 * 1000;
let settingsCache = null;
let settingsCacheAt = 0;
const responseCache = new Map();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEY]) {
    settingsCache = null;
    settingsCacheAt = 0;
    responseCache.clear();
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const current = await loadSettings();
  await saveSettings(mergeSettings(current));

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "prompt-professionalizer-enhance",
      title: "优化并替换当前 AI 输入框",
      contexts: ["page", "editable"]
    });
  });
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "prompt-professionalizer-enhance" || !tab?.id) return;
  sendToTab(tab.id, { action: "enhance-active" });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "enhance-active-input") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) sendToTab(tab.id, { action: "enhance-active" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
  return true;
});

async function handleMessage(message) {
  switch (message?.action) {
    case "get-public-settings": {
      const settings = mergeSettings(await loadSettingsCached());
      return {
        settings: {
          defaultTemplateId: settings.defaultTemplateId,
          templates: settings.templates.map(({ id, name }) => ({ id, name }))
        }
      };
    }
    case "set-default-template": {
      const settings = mergeSettings(await loadSettingsCached());
      const templateId = String(message.templateId || "");
      if (!settings.templates.some((item) => item.id === templateId)) throw new Error("模板不存在");
      settings.defaultTemplateId = templateId;
      await saveSettings(settings);
      return { defaultTemplateId: templateId };
    }
    case "enhance-text": {
      const settings = mergeSettings(await loadSettingsCached());
      const text = String(message.text || "").trim();
      if (!text) throw new Error("当前输入框没有可优化的内容");
      const provider = resolveProvider(settings);
      if (text.length > provider.maxInputChars) {
        throw new Error(`输入过长，当前模型配置上限为 ${provider.maxInputChars} 个字符`);
      }
      const template = settings.templates.find((item) => item.id === message.templateId)
        || settings.templates.find((item) => item.id === settings.defaultTemplateId)
        || settings.templates[0];
      if (!template) throw new Error("未配置优化模板");
      const result = await callOpenAICompatible({ settings, provider, template, text });
      return {
        enhancedText: result.text,
        templateName: template.name,
        elapsedMs: result.elapsedMs,
        cached: result.cached
      };
    }
    case "test-provider": {
      const provider = normalizeProvider(message.provider);
      const testSettings = mergeSettings(await loadSettingsCached());
      const result = await callOpenAICompatible({
        settings: testSettings,
        provider: { ...provider, timeoutMs: Math.min(provider.timeoutMs, 30000), fastMode: true, maxOutputTokens: 32 },
        template: { id: "provider-test", instruction: "把下列文本原样输出，仅输出 OK。" },
        text: "OK",
        disableCache: true
      });
      return { result: result.text, elapsedMs: result.elapsedMs };
    }
    case "fetch-models": {
      const provider = normalizeProvider(message.provider);
      return { models: await fetchModels(provider) };
    }
    case "get-settings":
      return { settings: mergeSettings(await loadSettingsCached()) };
    case "save-settings": {
      const settings = mergeSettings(message.settings || {});
      validateSettings(settings);
      await saveSettings(settings);
      return { settings };
    }
    default:
      throw new Error("未知操作");
  }
}

function resolveProvider(settings) {
  const provider = settings.providers.find((item) => item.id === settings.activeProviderId) || settings.providers[0];
  if (!provider) throw new Error("未配置模型接口");
  return normalizeProvider(provider);
}

async function callOpenAICompatible({ settings, provider, template, text, disableCache = false }) {
  validateProvider(provider);
  const endpoint = buildEndpoint(provider.baseUrl, provider.path || "/chat/completions");
  const cacheKey = buildResponseCacheKey(provider, template, text);
  if (!disableCache) {
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < RESPONSE_CACHE_TTL_MS) {
      return { text: cached.text, elapsedMs: 0, cached: true };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(provider.timeoutMs) || 6000);
  const startedAt = performance.now();

  try {
    const headers = {
      "Content-Type": "application/json",
      ...parseExtraHeaders(provider.extraHeaders)
    };
    if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;

    const requestBody = {
      model: provider.model,
      temperature: clampNumber(provider.temperature, 0, 2, 0.3),
      n: 1,
      stream: false,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(settings.globalSystemPrompt, template.instruction, provider.fastMode !== false)
        },
        {
          role: "user",
          content: text
        }
      ]
    };
    applyFastGenerationLimit(requestBody, provider, text);

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      const detail = data?.error?.message || data?.message || data?.raw || response.statusText;
      throw new Error(`模型接口返回 ${response.status}：${String(detail).slice(0, 500)}`);
    }

    const output = cleanOutput(extractOutput(data));
    if (!output) throw new Error("模型接口未返回可识别的文本内容");
    const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
    if (!disableCache) rememberResponse(cacheKey, output);
    return { text: output, elapsedMs, cached: false };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("模型请求超时");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchModels(provider) {
  validateProvider(provider, { requireModel: false });
  const base = String(provider.baseUrl || "").replace(/\/+$/, "");
  const endpoint = /\/v1$/i.test(base) ? `${base}/models` : `${base}/v1/models`;
  const headers = { ...parseExtraHeaders(provider.extraHeaders) };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;

  const response = await fetch(endpoint, { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `模型列表请求失败：${response.status}`);
  }

  const models = Array.isArray(data?.data)
    ? data.data.map((item) => typeof item === "string" ? item : item?.id).filter(Boolean)
    : [];
  return [...new Set(models)].sort();
}

function extractOutput(data) {
  return data?.choices?.[0]?.message?.content
    ?? data?.choices?.[0]?.text
    ?? data?.output_text
    ?? data?.output?.[0]?.content?.[0]?.text
    ?? "";
}

function cleanOutput(value) {
  let text = String(value).trim();
  text = text.replace(/^```(?:text|markdown)?\s*/i, "").replace(/\s*```$/, "").trim();
  return text;
}

function buildEndpoint(baseUrl, path) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("Base URL 不能为空");
  if (/\/chat\/completions$/i.test(base)) return base;

  let normalizedPath = String(path || "/chat/completions").replace(/^\/+/, "");
  if (/\/v1$/i.test(base) && /^v1\//i.test(normalizedPath)) {
    normalizedPath = normalizedPath.replace(/^v1\//i, "");
  }
  return `${base}/${normalizedPath}`;
}

function parseExtraHeaders(raw) {
  if (!raw || !String(raw).trim()) return {};
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error("附加请求头必须是合法 JSON 对象");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("附加请求头必须是 JSON 对象");
  }
  const blocked = new Set(["host", "content-length", "origin", "referer", "cookie"]);
  const safe = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (blocked.has(key.toLowerCase())) continue;
    safe[key] = String(value);
  }
  return safe;
}

function validateSettings(settings) {
  if (!Array.isArray(settings.providers) || settings.providers.length === 0) {
    throw new Error("至少需要一个模型配置");
  }
  if (!Array.isArray(settings.templates) || settings.templates.length === 0) {
    throw new Error("至少需要一个优化模板");
  }
  settings.providers.forEach((provider) => validateProvider(provider));
}

function validateProvider(provider, options = {}) {
  const requireModel = options.requireModel !== false;
  if (!provider?.baseUrl) throw new Error("Base URL 不能为空");
  let parsed;
  try {
    parsed = new URL(provider.baseUrl);
  } catch {
    throw new Error("Base URL 格式不正确");
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Base URL 仅支持 HTTP/HTTPS");
  if (requireModel && !provider.model) throw new Error("模型名称不能为空");
  if (provider.timeoutMs < 1000 || provider.timeoutMs > 180000) throw new Error("请求超时必须在 1000 到 180000 毫秒之间");
  if (provider.maxInputChars < 100 || provider.maxInputChars > 100000) throw new Error("最大输入字符数必须在 100 到 100000 之间");
  if (provider.maxOutputTokens < 32 || provider.maxOutputTokens > 16384) throw new Error("最大输出 Token 必须在 32 到 16384 之间");
  parseExtraHeaders(provider.extraHeaders);
}

function normalizeProvider(provider, migration = {}) {
  const sourceVersion = Number(migration.sourceVersion || 3);
  const rawBaseUrl = String(provider?.baseUrl || "").trim();
  const rawPath = String(provider?.path || "").trim();
  const wasOldOpenAIDefault = sourceVersion < 3
    && rawBaseUrl === "https://api.openai.com"
    && (!rawPath || rawPath === "/v1/chat/completions");

  const legacyTimeout = Number(migration.legacyTimeoutMs);
  const legacyMaxInput = Number(migration.legacyMaxInputChars);
  const migratedTimeout = sourceVersion < 3 && legacyTimeout === 60000 ? 6000 : legacyTimeout;
  const migratedMaxInput = sourceVersion < 3 && legacyMaxInput === 30000 ? 9999 : legacyMaxInput;
  const rawTemperature = Number(provider?.temperature);
  const migratedTemperature = sourceVersion < 3 && rawTemperature === 0.2 ? 0.3 : rawTemperature;

  return {
    id: String(provider?.id || crypto.randomUUID()),
    name: String(provider?.name || "自定义接口"),
    baseUrl: wasOldOpenAIDefault ? "https://api.openai.com/v1" : rawBaseUrl,
    path: wasOldOpenAIDefault ? "/chat/completions" : (rawPath || "/chat/completions"),
    apiKey: String(provider?.apiKey || "").trim(),
    model: String(provider?.model || "").trim(),
    temperature: clampNumber(migratedTemperature, 0, 2, 0.3),
    timeoutMs: clampNumber(provider?.timeoutMs ?? migratedTimeout, 1000, 180000, 6000),
    maxInputChars: clampNumber(provider?.maxInputChars ?? migratedMaxInput, 100, 100000, 9999),
    fastMode: provider?.fastMode !== false,
    maxOutputTokens: clampNumber(provider?.maxOutputTokens, 32, 16384, 1200),
    extraHeaders: typeof provider?.extraHeaders === "string"
      ? provider.extraHeaders
      : JSON.stringify(provider?.extraHeaders || {}, null, 2)
  };
}

function buildSystemPrompt(globalPrompt, instruction, fastMode) {
  const base = `${String(globalPrompt || "").trim()}\n\n优化规则：${String(instruction || "").trim()}`.trim();
  if (!fastMode) return base;
  return `${base}\n要求：直接输出改写结果；保持原意；避免解释和重复；长度尽量接近原文。`;
}

function applyFastGenerationLimit(body, provider, text) {
  if (provider.fastMode === false) return;
  const configured = clampNumber(provider.maxOutputTokens, 32, 16384, 1200);
  const dynamic = Math.min(configured, Math.max(192, Math.ceil(String(text || "").length * 1.35)));
  const model = String(provider.model || "").toLowerCase();
  if (/^(o1|o3|o4)|gpt-5/.test(model)) body.max_completion_tokens = dynamic;
  else body.max_tokens = dynamic;
}

function buildResponseCacheKey(provider, template, text) {
  return [
    provider.id,
    provider.baseUrl,
    provider.path,
    provider.model,
    provider.temperature,
    provider.fastMode,
    provider.maxOutputTokens,
    provider.maxInputChars,
    provider.timeoutMs,
    provider.extraHeaders,
    provider.apiKey,
    template.id,
    template.name,
    template.instruction,
    text
  ].join("\u001f");
}

function rememberResponse(key, text) {
  responseCache.set(key, { text, createdAt: Date.now() });
  while (responseCache.size > 20) responseCache.delete(responseCache.keys().next().value);
}

async function loadSettingsCached() {
  if (settingsCache && Date.now() - settingsCacheAt < SETTINGS_CACHE_TTL_MS) return settingsCache;
  settingsCache = await loadSettings();
  settingsCacheAt = Date.now();
  return settingsCache;
}

function mergeSettings(input = {}) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...input,
    version: 4,
    providers: Array.isArray(input.providers) && input.providers.length
      ? input.providers.map((provider) => normalizeProvider(provider, {
          sourceVersion: Number(input.version || 1),
          legacyTimeoutMs: input.timeoutMs,
          legacyMaxInputChars: input.maxInputChars
        }))
      : DEFAULT_SETTINGS.providers.map((provider) => normalizeProvider(provider)),
    templates: Array.isArray(input.templates) && input.templates.length
      ? input.templates.map((template) => ({
          id: String(template.id || crypto.randomUUID()),
          name: String(template.name || "未命名模板"),
          instruction: String(template.instruction || "优化输入内容。")
        }))
      : structuredClone(DEFAULT_SETTINGS.templates)
  };

  if (!merged.providers.some((item) => item.id === merged.activeProviderId)) {
    merged.activeProviderId = merged.providers[0]?.id || "";
  }
  if (!merged.templates.some((item) => item.id === merged.defaultTemplateId)) {
    merged.defaultTemplateId = merged.templates[0]?.id || "";
  }
  delete merged.timeoutMs;
  delete merged.maxInputChars;
  delete merged.showPreview;
  return merged;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

async function loadSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {};
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

function normalizeError(error) {
  return error instanceof Error ? error.message : String(error || "未知错误");
}

function sendToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
}
