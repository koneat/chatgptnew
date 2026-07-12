(() => {
  const HEALTH_KEY = "promptProfessionalizerModelHealth";
  const CONFIG_IDS = [
    "provider-base-url",
    "provider-path",
    "provider-api-key",
    "provider-model",
    "provider-temperature",
    "provider-timeout-ms",
    "provider-max-input-chars",
    "provider-max-output-tokens",
    "provider-fast-mode",
    "provider-headers"
  ];

  const originalSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage = function wrappedSendMessage(message, ...args) {
    const result = originalSendMessage(message, ...args);
    if (message?.action !== "test-provider" || !result?.then) return result;
    return result.then(async (response) => {
      const health = await saveCurrentHealth(response?.ok === true, response?.error || "");
      return response?.ok ? { ...response, passed: true, health } : response;
    });
  };

  document.addEventListener("DOMContentLoaded", init, { once: true });

  function init() {
    for (const id of CONFIG_IDS) {
      document.getElementById(id)?.addEventListener("input", () => markCurrentUnavailable("配置已修改，请重新验证"));
    }
    document.getElementById("provider-select")?.addEventListener("change", () => setTimeout(refreshStatus, 0));

    const status = document.getElementById("provider-status");
    if (status) {
      const observer = new MutationObserver(() => {
        if (!status.textContent.startsWith("正在")) refreshStatus();
      });
      observer.observe(status, { childList: true, characterData: true, subtree: true });
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes[HEALTH_KEY]) refreshStatus();
    });
    setTimeout(refreshStatus, 100);
  }

  async function saveCurrentHealth(ok, error = "") {
    const providerId = document.getElementById("provider-select")?.value;
    const signature = currentSignature();
    const result = await chrome.storage.local.get(HEALTH_KEY);
    const map = result[HEALTH_KEY] || {};
    const health = {
      ok: ok === true,
      signature,
      checkedAt: Date.now(),
      error: String(error || "").slice(0, 300)
    };
    if (providerId) map[providerId] = health;
    await chrome.storage.local.set({ [HEALTH_KEY]: map });
    return health;
  }

  async function markCurrentUnavailable(reason) {
    await saveCurrentHealth(false, reason);
    refreshStatus();
  }

  async function refreshStatus() {
    const status = document.getElementById("provider-status");
    const providerId = document.getElementById("provider-select")?.value;
    if (!status || !providerId || status.textContent.startsWith("正在")) return;
    const result = await chrome.storage.local.get(HEALTH_KEY);
    const health = result[HEALTH_KEY]?.[providerId];
    const available = health?.ok === true && health.signature === currentSignature();
    if (available) {
      const checkedAt = health.checkedAt ? new Date(health.checkedAt).toLocaleString() : "";
      status.textContent = `模型已验证可用${checkedAt ? `（${checkedAt}）` : ""}`;
      status.style.color = "#86efac";
    } else if (!status.textContent || status.textContent.includes("已验证可用")) {
      status.textContent = health?.error || "模型尚未验证；验证成功后输入框 P 才会变绿";
      status.style.color = "#fca5a5";
    }
  }

  function currentSignature() {
    const value = (id) => document.getElementById(id)?.value?.trim() || "";
    return [
      value("provider-base-url"),
      value("provider-path"),
      value("provider-model"),
      String(Number(value("provider-temperature") || 0.3)),
      String(Number(value("provider-timeout-ms") || 6000)),
      String(Number(value("provider-max-input-chars") || 9999)),
      String(document.getElementById("provider-fast-mode")?.checked !== false),
      String(Number(value("provider-max-output-tokens") || 1200)),
      value("provider-headers") || "{}",
      fingerprint(value("provider-api-key"))
    ].join("\u001f");
  }

  function fingerprint(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }
})();
