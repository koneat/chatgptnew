(() => {
  const SETTINGS_KEY = "promptProfessionalizerSettings";
  const HEALTH_KEY = "promptProfessionalizerModelHealth";
  const POSITION_KEY = "promptProfessionalizerPositions";
  const BUTTON_SIZE = 30;
  const state = { host: null, root: null, button: null, menu: null, position: null, drag: null, suppressUntil: 0 };

  waitForToolbar().then(init).catch(() => undefined);

  async function waitForToolbar() {
    for (let index = 0; index < 100; index += 1) {
      const host = document.getElementById("prompt-professionalizer-host");
      if (host?.shadowRoot?.querySelector(".main")) return host;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("未找到 P 按钮");
  }

  async function init(host) {
    state.host = host;
    state.root = host.shadowRoot;
    state.button = state.root.querySelector(".main");
    state.menu = state.root.querySelector(".menu");
    state.position = await loadPosition();
    installDrag();
    installResetItem();
    observeToasts();
    await refreshColor();
    applyPosition();

    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName !== "local") return;
      if (changes[SETTINGS_KEY] || changes[HEALTH_KEY]) await refreshColor();
      if (changes[POSITION_KEY]) {
        state.position = readPosition(changes[POSITION_KEY].newValue || {});
        applyPosition();
      }
    });

    window.addEventListener("scroll", () => requestAnimationFrame(applyPosition), true);
    window.addEventListener("resize", () => requestAnimationFrame(applyPosition), true);
    new MutationObserver(() => requestAnimationFrame(applyPosition)).observe(state.host, { attributes: true, attributeFilter: ["style"] });
  }

  function installDrag() {
    state.button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || state.button.disabled) return;
      const rect = state.host.getBoundingClientRect();
      state.drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        moved: false
      };
      state.button.setPointerCapture?.(event.pointerId);
    });

    state.button.addEventListener("pointermove", (event) => {
      const drag = state.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
      drag.moved = true;
      event.preventDefault();
      const left = clamp(drag.left + deltaX, 4, window.innerWidth - BUTTON_SIZE - 4);
      const top = clamp(drag.top + deltaY, 4, window.innerHeight - BUTTON_SIZE - 4);
      state.position = toRatio(left, top);
      applyPosition();
    });

    const finish = async (event) => {
      const drag = state.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      state.drag = null;
      try { state.button.releasePointerCapture?.(event.pointerId); } catch {}
      if (!drag.moved) return;
      state.suppressUntil = Date.now() + 350;
      await savePosition();
    };

    state.button.addEventListener("pointerup", finish);
    state.button.addEventListener("pointercancel", finish);
    state.button.addEventListener("click", (event) => {
      if (Date.now() < state.suppressUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  function installResetItem() {
    if (!state.menu || state.menu.querySelector("[data-p-reset-position]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "item";
    button.dataset.pResetPosition = "true";
    button.textContent = "恢复输入框默认位置";
    button.addEventListener("click", async () => {
      const result = await chrome.storage.local.get(POSITION_KEY);
      const map = result[POSITION_KEY] || {};
      delete map[location.hostname];
      state.position = null;
      await chrome.storage.local.set({ [POSITION_KEY]: map });
      state.menu.classList.remove("open");
      window.dispatchEvent(new Event("resize"));
    });
    const settingsButton = [...state.menu.querySelectorAll(".item")].find((item) => item.textContent.includes("设置"));
    state.menu.insertBefore(button, settingsButton || null);
  }

  function observeToasts() {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement) || !node.classList.contains("toast")) continue;
          const text = node.textContent || "";
          const isError = node.style.background.includes("127") || node.style.background.includes("7f1d1d");
          if (text.includes("替换") && !isError) markCurrentHealth(true, "");
          else if (isError) markCurrentHealth(false, text);
        }
      }
    });
    observer.observe(state.root, { childList: true, subtree: true });
  }

  async function refreshColor() {
    const { settings, healthMap } = await readState();
    const provider = settings?.providers?.find((item) => item.id === settings.activeProviderId) || settings?.providers?.[0];
    const health = provider ? healthMap?.[provider.id] : null;
    const available = Boolean(provider && provider.baseUrl && provider.path && provider.model && health?.ok && health.signature === signature(provider));
    state.button.classList.toggle("available", available);
    const original = state.button.title?.split("；模型状态：")[0] || state.button.title || "P";
    state.button.title = `${original}；拖动可移动并保存位置；模型状态：${available ? "可用" : (health?.error || "未验证")}`;
  }

  async function markCurrentHealth(ok, error) {
    const { settings, healthMap } = await readState();
    const provider = settings?.providers?.find((item) => item.id === settings.activeProviderId) || settings?.providers?.[0];
    if (!provider) return;
    healthMap[provider.id] = {
      ok: ok === true,
      signature: signature(provider),
      checkedAt: Date.now(),
      error: String(error || "").slice(0, 300)
    };
    await chrome.storage.local.set({ [HEALTH_KEY]: healthMap });
  }

  async function readState() {
    const result = await chrome.storage.local.get([SETTINGS_KEY, HEALTH_KEY]);
    return {
      settings: result[SETTINGS_KEY] || {},
      healthMap: result[HEALTH_KEY] || {}
    };
  }

  function signature(provider) {
    return [
      String(provider?.baseUrl || "").trim(),
      String(provider?.path || "").trim(),
      String(provider?.model || "").trim(),
      String(Number(provider?.temperature ?? 0.3)),
      String(Number(provider?.timeoutMs ?? 6000)),
      String(Number(provider?.maxInputChars ?? 9999)),
      String(provider?.extraHeaders || "{}"),
      fingerprint(provider?.apiKey)
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

  async function loadPosition() {
    const result = await chrome.storage.local.get(POSITION_KEY);
    return readPosition(result[POSITION_KEY] || {});
  }

  function readPosition(map) {
    const position = map?.[location.hostname];
    if (!position || !Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.y))) return null;
    return { x: clamp(Number(position.x), 0, 1), y: clamp(Number(position.y), 0, 1) };
  }

  function toRatio(left, top) {
    return {
      x: clamp(left / Math.max(1, window.innerWidth - BUTTON_SIZE), 0, 1),
      y: clamp(top / Math.max(1, window.innerHeight - BUTTON_SIZE), 0, 1)
    };
  }

  function applyPosition() {
    if (!state.position || !state.host) return;
    const left = clamp(state.position.x * (window.innerWidth - BUTTON_SIZE), 4, window.innerWidth - BUTTON_SIZE - 4);
    const top = clamp(state.position.y * (window.innerHeight - BUTTON_SIZE), 4, window.innerHeight - BUTTON_SIZE - 4);
    if (state.host.style.left !== `${left}px`) state.host.style.left = `${left}px`;
    if (state.host.style.top !== `${top}px`) state.host.style.top = `${top}px`;
    state.host.style.right = "auto";
    state.host.style.bottom = "auto";
  }

  async function savePosition() {
    if (!state.position) return;
    const result = await chrome.storage.local.get(POSITION_KEY);
    const map = result[POSITION_KEY] || {};
    map[location.hostname] = state.position;
    await chrome.storage.local.set({ [POSITION_KEY]: map });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }
})();
