let settings, activeProviderId;
const $ = (id) => document.getElementById(id);

init().catch((error) => toast(error.message, true));
async function init() {
  const response = await chrome.runtime.sendMessage({ action: "get-settings" });
  if (!response?.ok) throw new Error(response?.error || "读取设置失败");
  settings = response.settings; activeProviderId = settings.activeProviderId;
  bind(); render();
}
function bind() {
  $("provider-select").addEventListener("change", () => { persistProvider(); activeProviderId = $("provider-select").value; settings.activeProviderId = activeProviderId; renderProvider(); });
  $("add-provider").addEventListener("click", addProvider);
  $("delete-provider").addEventListener("click", deleteProvider);
  $("toggle-key").addEventListener("click", (event) => { event.preventDefault(); const input = $("provider-api-key"); input.type = input.type === "password" ? "text" : "password"; $("toggle-key").textContent = input.type === "password" ? "显示" : "隐藏"; });
  $("fetch-models").addEventListener("click", fetchModels);
  $("test-provider").addEventListener("click", testProvider);
  $("save").addEventListener("click", save);
  $("reset-prompt").addEventListener("click", async () => {
    const response = await chrome.runtime.sendMessage({ action: "get-default-prompt" });
    if (!response?.ok) return toast(response?.error || "读取默认规则失败", true);
    $("global-prompt").value = response.prompt;
    toast("已恢复 v1.3.0 默认规则，点击保存后生效");
  });
}
function render() { renderProviderSelect(); renderProvider(); $("global-prompt").value = settings.globalSystemPrompt || ""; }
function renderProviderSelect() { const select = $("provider-select"); select.textContent = ""; settings.providers.forEach((p) => select.add(new Option(p.name, p.id))); if (!settings.providers.some((p) => p.id === activeProviderId)) activeProviderId = settings.providers[0].id; select.value = activeProviderId; }
function renderProvider() { const p = current(); $("provider-name").value = p.name || ""; $("provider-model").value = p.model || ""; $("provider-base-url").value = p.baseUrl || ""; $("provider-path").value = p.path || "/chat/completions"; $("provider-api-key").value = p.apiKey || ""; $("provider-temperature").value = p.temperature ?? .3; $("provider-timeout").value = p.timeoutMs ?? 10000; $("provider-max-input").value = p.maxInputChars ?? 4000; $("provider-max-output").value = p.maxOutputTokens ?? 1024; $("provider-fast").checked = p.fastMode !== false; $("provider-headers").value = p.extraHeaders || "{}"; $("provider-status").textContent = ""; }
function persistProvider() { const p = current(); if (!p) return; p.name = $("provider-name").value.trim() || "未命名接口"; p.model = $("provider-model").value.trim(); p.baseUrl = $("provider-base-url").value.trim(); p.path = $("provider-path").value.trim() || "/chat/completions"; p.apiKey = $("provider-api-key").value.trim(); p.temperature = Number($("provider-temperature").value || .3); p.timeoutMs = Number($("provider-timeout").value || 10000); p.maxInputChars = Number($("provider-max-input").value || 4000); p.maxOutputTokens = Number($("provider-max-output").value || 1024); p.fastMode = $("provider-fast").checked; p.extraHeaders = $("provider-headers").value.trim() || "{}"; }
function addProvider() { persistProvider(); const id = crypto.randomUUID(); settings.providers.push({ id, name: "OpenRouter Free", baseUrl: "https://openrouter.ai/api/v1", path: "/chat/completions", apiKey: "", model: "openrouter/free", temperature: .3, timeoutMs: 10000, maxInputChars: 4000, maxOutputTokens: 1024, fastMode: true, extraHeaders: '{"X-OpenRouter-Title":"Prompt Professionalizer"}' }); activeProviderId = id; settings.activeProviderId = id; renderProviderSelect(); renderProvider(); }
function deleteProvider() { if (settings.providers.length <= 1) return toast("至少保留一个接口", true); if (!confirm(`删除“${current().name}”吗？`)) return; settings.providers = settings.providers.filter((p) => p.id !== activeProviderId); activeProviderId = settings.providers[0].id; settings.activeProviderId = activeProviderId; renderProviderSelect(); renderProvider(); }
async function save() { try { persistProvider(); await ensurePermission(current().baseUrl); settings.activeProviderId = activeProviderId; settings.globalSystemPrompt = $("global-prompt").value.trim(); const response = await chrome.runtime.sendMessage({ action: "save-settings", settings }); if (!response?.ok) throw new Error(response?.error || "保存失败"); settings = response.settings; toast("设置已保存"); } catch (error) { toast(error.message, true); } }
async function fetchModels() { try { persistProvider(); await ensurePermission(current().baseUrl); $("provider-status").textContent = "正在拉取模型…"; const response = await chrome.runtime.sendMessage({ action: "fetch-models", provider: current() }); if (!response?.ok) throw new Error(response?.error || "拉取失败"); const list = $("models"); list.textContent = ""; response.models.forEach((model) => list.appendChild(new Option(model))); $("provider-status").textContent = `已获取 ${response.models.length} 个模型`; } catch (error) { $("provider-status").textContent = error.message; } }
async function testProvider() { try { persistProvider(); await ensurePermission(current().baseUrl); $("provider-status").textContent = "正在验证…"; const response = await chrome.runtime.sendMessage({ action: "test-provider", provider: current() }); if (!response?.ok) throw new Error(response?.error || "验证失败"); $("provider-status").textContent = `可用，返回：${response.result}`; } catch (error) { $("provider-status").textContent = error.message; } }
async function ensurePermission(baseUrl) { let parsed; try { parsed = new URL(baseUrl); } catch { throw new Error("Base URL 格式不正确"); } const origin = `${parsed.protocol}//${parsed.host}/*`; if (await chrome.permissions.contains({ origins: [origin] })) return; if (!await chrome.permissions.request({ origins: [origin] })) throw new Error(`未授权访问接口域名：${parsed.host}`); }
function current() { return settings.providers.find((p) => p.id === activeProviderId) || settings.providers[0]; }
function toast(message, error = false) { const node = $("toast"); node.textContent = message; node.className = `toast show${error ? " error" : ""}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => node.className = "toast", 3200); }
