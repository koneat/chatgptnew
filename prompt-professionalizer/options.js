let settings;
let activeProviderId;

const $ = (selector) => document.querySelector(selector);

init().catch((error) => toast(error.message, true));

async function init() {
  const response = await chrome.runtime.sendMessage({ action: "get-settings" });
  if (!response?.ok) throw new Error(response?.error || "读取设置失败");
  settings = response.settings;
  activeProviderId = settings.activeProviderId;
  bindEvents();
  renderAll();
}

function bindEvents() {
  $("#provider-select").addEventListener("change", () => {
    persistProviderForm();
    activeProviderId = $("#provider-select").value;
    settings.activeProviderId = activeProviderId;
    renderProviderForm();
  });
  $("#add-provider").addEventListener("click", addProvider);
  $("#delete-provider").addEventListener("click", deleteProvider);
  $("#toggle-key").addEventListener("click", toggleApiKey);
  $("#fetch-models").addEventListener("click", fetchModels);
  $("#test-provider").addEventListener("click", testProvider);
  $("#add-template").addEventListener("click", addTemplate);
  $("#default-template").addEventListener("change", async () => {
    settings.defaultTemplateId = $("#default-template").value;
    await saveAll();
  });
  $("#save-all").addEventListener("click", saveAll);
}

function renderAll() {
  renderProviderSelect();
  renderProviderForm();
  renderTemplates();
  $("#global-system-prompt").value = settings.globalSystemPrompt || "";
}

function renderProviderSelect() {
  const select = $("#provider-select");
  select.textContent = "";
  for (const provider of settings.providers) select.add(new Option(provider.name, provider.id));
  if (!settings.providers.some((item) => item.id === activeProviderId)) activeProviderId = settings.providers[0]?.id;
  select.value = activeProviderId;
}

function renderProviderForm() {
  const provider = currentProvider();
  if (!provider) return;
  $("#provider-name").value = provider.name || "";
  $("#provider-model").value = provider.model || "";
  $("#provider-base-url").value = provider.baseUrl || "";
  $("#provider-path").value = provider.path || "/chat/completions";
  $("#provider-api-key").value = provider.apiKey || "";
  $("#provider-temperature").value = provider.temperature ?? 0.2;
  $("#provider-timeout-ms").value = provider.timeoutMs ?? 15000;
  $("#provider-max-input-chars").value = provider.maxInputChars ?? 9999;
  $("#provider-max-output-tokens").value = provider.maxOutputTokens ?? 640;
  $("#provider-fast-mode").checked = provider.fastMode !== false;
  $("#provider-headers").value = provider.extraHeaders || "{}";
  if (provider.health?.ok) {
    const checkedAt = provider.health.checkedAt ? new Date(provider.health.checkedAt).toLocaleString() : "";
    setProviderStatus(`模型已验证可用${checkedAt ? `（${checkedAt}）` : ""}`);
  } else {
    setProviderStatus(provider.health?.error || "模型尚未验证；验证成功后输入框 P 才会变绿", true);
  }
}

function persistProviderForm() {
  const provider = currentProvider();
  if (!provider) return;
  const before = providerConfigSnapshot(provider);
  provider.name = $("#provider-name").value.trim() || "未命名模型";
  provider.model = $("#provider-model").value.trim();
  provider.baseUrl = $("#provider-base-url").value.trim();
  provider.path = $("#provider-path").value.trim() || "/chat/completions";
  provider.apiKey = $("#provider-api-key").value.trim();
  provider.temperature = Number($("#provider-temperature").value || 0.2);
  provider.timeoutMs = Number($("#provider-timeout-ms").value || 15000);
  provider.maxInputChars = Number($("#provider-max-input-chars").value || 9999);
  provider.maxOutputTokens = Number($("#provider-max-output-tokens").value || 640);
  provider.fastMode = $("#provider-fast-mode").checked;
  provider.extraHeaders = $("#provider-headers").value.trim() || "{}";
  if (before !== providerConfigSnapshot(provider)) delete provider.health;
}

function addProvider() {
  persistProviderForm();
  const id = crypto.randomUUID();
  settings.providers.push({
    id,
    name: "OpenRouter Free",
    baseUrl: "https://openrouter.ai/api/v1",
    path: "/chat/completions",
    apiKey: "",
    model: "openrouter/free",
    temperature: 0.1,
    timeoutMs: 15000,
    maxInputChars: 9999,
    maxOutputTokens: 640,
    fastMode: true,
    extraHeaders: '{"X-OpenRouter-Title":"Prompt Professionalizer"}',
    health: { ok: false, checkedAt: 0, signature: "", error: "模型尚未验证" }
  });
  activeProviderId = id;
  settings.activeProviderId = id;
  renderProviderSelect();
  renderProviderForm();
}

function deleteProvider() {
  if (settings.providers.length <= 1) return toast("至少保留一个模型配置", true);
  const provider = currentProvider();
  if (!confirm(`确定删除模型配置“${provider.name}”吗？`)) return;
  settings.providers = settings.providers.filter((item) => item.id !== provider.id);
  activeProviderId = settings.providers[0].id;
  settings.activeProviderId = activeProviderId;
  renderProviderSelect();
  renderProviderForm();
}

function renderTemplates() {
  const list = $("#template-list");
  const defaultSelect = $("#default-template");
  list.textContent = "";
  defaultSelect.textContent = "";

  for (const template of settings.templates) {
    defaultSelect.add(new Option(template.name, template.id));
    const card = document.createElement("div");
    card.className = "template-card";
    card.dataset.id = template.id;
    card.innerHTML = `
      <label>模板名称<input class="name"></label>
      <span></span>
      <button class="delete danger" type="button">删除</button>
      <label class="instruction">优化规则<textarea rows="4"></textarea></label>
    `;
    card.querySelector(".name").value = template.name || "";
    card.querySelector("textarea").value = template.instruction || "";
    card.querySelectorAll("input,textarea").forEach((input) => input.addEventListener("input", () => persistTemplateCard(card)));
    card.querySelector(".delete").addEventListener("click", () => deleteTemplate(template.id));
    list.appendChild(card);
  }
  defaultSelect.value = settings.defaultTemplateId;
}

function persistTemplateCard(card) {
  const template = settings.templates.find((item) => item.id === card.dataset.id);
  if (!template) return;
  template.name = card.querySelector(".name").value.trim() || "未命名模板";
  template.instruction = card.querySelector("textarea").value.trim();
  const option = [...$("#default-template").options].find((item) => item.value === template.id);
  if (option) option.textContent = template.name;
}

function addTemplate() {
  const id = crypto.randomUUID();
  settings.templates.push({ id, name: "新模板", instruction: "在不改变原意的前提下优化提示词。" });
  renderTemplates();
  document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function deleteTemplate(id) {
  if (settings.templates.length <= 1) return toast("至少保留一个优化模板", true);
  settings.templates = settings.templates.filter((item) => item.id !== id);
  if (settings.defaultTemplateId === id) settings.defaultTemplateId = settings.templates[0].id;
  renderTemplates();
}

async function fetchModels() {
  try {
    persistProviderForm();
    const provider = currentProvider();
    await ensureOriginPermission(provider.baseUrl);
    setProviderStatus("正在拉取模型列表…");
    const response = await chrome.runtime.sendMessage({ action: "fetch-models", provider });
    if (!response?.ok) throw new Error(response?.error || "拉取失败");
    const datalist = $("#model-list");
    datalist.textContent = "";
    response.models.forEach((model) => datalist.appendChild(new Option(model)));
    setProviderStatus(`已获取 ${response.models.length} 个模型`);
  } catch (error) {
    setProviderStatus(error.message, true);
  }
}

async function testProvider() {
  try {
    persistProviderForm();
    const provider = currentProvider();
    await ensureOriginPermission(provider.baseUrl);
    setProviderStatus("正在验证接口…");
    const response = await chrome.runtime.sendMessage({ action: "test-provider", provider });
    if (!response?.ok) throw new Error(response?.error || "验证失败");
    provider.health = response.health;
    await saveSettingsOnly();
    if (!response.passed) throw new Error(response.error || "验证失败");
    setProviderStatus(`模型可用，返回：${String(response.result).slice(0, 80)}`);
  } catch (error) {
    setProviderStatus(error.message, true);
  }
}

async function saveAll() {
  try {
    persistProviderForm();
    await ensureOriginPermission(currentProvider().baseUrl);
    await saveSettingsOnly();
    toast("设置已保存");
  } catch (error) {
    toast(error.message, true);
  }
}

async function saveSettingsOnly() {
  settings.activeProviderId = activeProviderId;
  settings.defaultTemplateId = $("#default-template").value;
  settings.globalSystemPrompt = $("#global-system-prompt").value.trim();
  for (const card of document.querySelectorAll(".template-card")) persistTemplateCard(card);
  const response = await chrome.runtime.sendMessage({ action: "save-settings", settings });
  if (!response?.ok) throw new Error(response?.error || "保存失败");
  settings = response.settings;
}

async function ensureOriginPermission(baseUrl) {
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new Error("Base URL 格式不正确"); }
  const origin = `${parsed.protocol}//${parsed.host}/*`;
  const hasPermission = await chrome.permissions.contains({ origins: [origin] });
  if (hasPermission) return;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error(`未授权访问模型接口域名：${parsed.host}`);
}

function toggleApiKey() {
  const input = $("#provider-api-key");
  input.type = input.type === "password" ? "text" : "password";
  $("#toggle-key").textContent = input.type === "password" ? "显示" : "隐藏";
}

function providerConfigSnapshot(provider) {
  return JSON.stringify({
    baseUrl: provider?.baseUrl || "",
    path: provider?.path || "",
    apiKey: provider?.apiKey || "",
    model: provider?.model || "",
    temperature: Number(provider?.temperature ?? 0.2),
    timeoutMs: Number(provider?.timeoutMs ?? 15000),
    maxInputChars: Number(provider?.maxInputChars ?? 9999),
    fastMode: provider?.fastMode !== false,
    maxOutputTokens: Number(provider?.maxOutputTokens ?? 640),
    extraHeaders: provider?.extraHeaders || "{}"
  });
}

function currentProvider() {
  return settings.providers.find((item) => item.id === activeProviderId) || settings.providers[0];
}

function setProviderStatus(message, error = false) {
  const element = $("#provider-status");
  element.textContent = message;
  element.style.color = error ? "#fca5a5" : "#93c5fd";
}

function toast(message, error = false) {
  const element = $("#save-status");
  element.textContent = message;
  element.className = `save-status show${error ? " error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.className = "save-status"; }, 3200);
}
