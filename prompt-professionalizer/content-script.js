(() => {
  if (globalThis.__PROMPT_PROFESSIONALIZER_LOADED__) return;
  globalThis.__PROMPT_PROFESSIONALIZER_LOADED__ = true;

  const state = {
    activeElement: null,
    originalText: "",
    publicSettings: null,
    toolbarHost: null,
    toolbarRoot: null,
    menu: null,
    preview: null,
    loading: false,
    repositionFrame: 0
  };

  init();

  async function init() {
    state.publicSettings = await getPublicSettings();
    createToolbar();
    observeInputs();
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName !== "local" || !changes.promptProfessionalizerSettings) return;
      state.publicSettings = await getPublicSettings();
      renderMenu();
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.action === "enhance-active") {
        const target = findUsableTarget(document.activeElement) || state.activeElement || findBestVisibleEditor();
        if (target) state.activeElement = target;
        enhanceTarget(target, message.templateId || state.publicSettings?.defaultTemplateId)
          .then(() => sendResponse({ ok: true }))
          .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }
      return false;
    });
  }

  function observeInputs() {
    document.addEventListener("focusin", (event) => {
      const target = findUsableTarget(event.target);
      if (!target) return;
      state.activeElement = target;
      showToolbar();
      scheduleReposition();
    }, true);

    document.addEventListener("pointerdown", (event) => {
      const target = findUsableTarget(event.target);
      if (target) {
        state.activeElement = target;
        showToolbar();
        scheduleReposition();
      }
    }, true);

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "m") {
        const target = findUsableTarget(document.activeElement) || state.activeElement;
        if (!target) return;
        event.preventDefault();
        enhanceTarget(target, state.publicSettings?.defaultTemplateId).catch(showError);
      }
    }, true);

    window.addEventListener("scroll", scheduleReposition, true);
    window.addEventListener("resize", scheduleReposition, true);

    const observer = new MutationObserver(() => {
      if (!state.activeElement || !document.contains(state.activeElement)) {
        state.activeElement = findBestVisibleEditor();
      }
      scheduleReposition();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    state.activeElement = findBestVisibleEditor();
    if (state.activeElement) showToolbar();
  }

  function createToolbar() {
    const host = document.createElement("div");
    host.id = "prompt-professionalizer-host";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483646;display:none;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .bar { display:flex; align-items:center; overflow:hidden; border:1px solid rgba(148,163,184,.5); border-radius:10px; background:rgba(15,23,42,.94); box-shadow:0 8px 24px rgba(0,0,0,.25); backdrop-filter:blur(8px); font:12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        button { border:0; color:#fff; background:transparent; cursor:pointer; height:30px; padding:0 9px; font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        button:hover { background:rgba(255,255,255,.12); }
        button:disabled { opacity:.55; cursor:wait; }
        .main { display:flex; align-items:center; gap:5px; }
        .toggle { width:27px; padding:0; border-left:1px solid rgba(255,255,255,.14); }
        .spinner { width:12px; height:12px; border:2px solid rgba(255,255,255,.35); border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; }
        .menu { position:absolute; right:0; bottom:36px; min-width:180px; padding:6px; border:1px solid rgba(148,163,184,.35); border-radius:12px; background:#0f172a; box-shadow:0 12px 32px rgba(0,0,0,.35); display:none; }
        .menu.open { display:block; }
        .item { width:100%; height:auto; min-height:34px; display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; text-align:left; }
        .icon { width:20px; height:20px; border-radius:6px; display:grid; place-items:center; background:rgba(99,102,241,.28); font-size:11px; }
        .toast { position:absolute; right:0; bottom:36px; max-width:300px; padding:9px 11px; border-radius:9px; color:#fff; background:#7f1d1d; box-shadow:0 10px 30px rgba(0,0,0,.25); font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        @keyframes spin { to { transform:rotate(360deg); } }
      </style>
      <div class="bar">
        <button class="main" type="button" title="使用默认模板优化（Ctrl/Command+Shift+M）"><span class="spark">✨</span><span>增强</span></button>
        <button class="toggle" type="button" aria-label="选择优化模板">▾</button>
      </div>
      <div class="menu"></div>
    `;

    root.querySelector(".main").addEventListener("click", () => {
      enhanceTarget(state.activeElement, state.publicSettings?.defaultTemplateId).catch(showError);
    });
    root.querySelector(".toggle").addEventListener("click", (event) => {
      event.stopPropagation();
      root.querySelector(".menu").classList.toggle("open");
    });
    document.addEventListener("pointerdown", (event) => {
      if (!event.composedPath().includes(host)) root.querySelector(".menu").classList.remove("open");
    }, true);

    document.documentElement.appendChild(host);
    state.toolbarHost = host;
    state.toolbarRoot = root;
    state.menu = root.querySelector(".menu");
    renderMenu();
  }

  function renderMenu() {
    if (!state.menu) return;
    const templates = state.publicSettings?.templates || [];
    state.menu.textContent = "";
    for (const template of templates) {
      const button = document.createElement("button");
      button.className = "item";
      button.type = "button";
      button.innerHTML = `<span class="icon"></span><span class="label"></span>`;
      button.querySelector(".icon").textContent = template.icon || "优";
      button.querySelector(".label").textContent = template.name;
      button.addEventListener("click", () => {
        state.menu.classList.remove("open");
        enhanceTarget(state.activeElement, template.id).catch(showError);
      });
      state.menu.appendChild(button);
    }
    const settingsButton = document.createElement("button");
    settingsButton.className = "item";
    settingsButton.type = "button";
    settingsButton.innerHTML = '<span class="icon">⚙</span><span class="label">模型与模板设置</span>';
    settingsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
    state.menu.appendChild(settingsButton);
  }

  async function enhanceTarget(target, templateId) {
    if (state.loading) return;
    target = findUsableTarget(target) || findBestVisibleEditor();
    if (!target) throw new Error("没有找到可编辑的 AI 对话框");
    state.activeElement = target;

    const original = readText(target).trim();
    if (!original) throw new Error("当前输入框没有内容");

    setLoading(true);
    state.originalText = readText(target);
    try {
      const response = await chrome.runtime.sendMessage({
        action: "enhance-text",
        text: original,
        templateId: templateId || state.publicSettings?.defaultTemplateId
      });
      if (!response?.ok) throw new Error(response?.error || "优化失败");
      if (state.publicSettings?.showPreview === false) {
        writeText(target, response.enhancedText);
        showSuccess("已替换为优化后的提示词");
      } else {
        showPreview(target, original, response.enhancedText, response.templateName);
      }
    } finally {
      setLoading(false);
    }
  }

  function showPreview(target, original, enhanced, templateName) {
    closePreview();
    const host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(2,6,23,.42);padding:20px;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        * { box-sizing:border-box; }
        .panel { width:min(780px,calc(100vw - 32px)); max-height:min(760px,calc(100vh - 32px)); display:flex; flex-direction:column; overflow:hidden; border:1px solid #334155; border-radius:16px; background:#0f172a; color:#e2e8f0; box-shadow:0 24px 80px rgba(0,0,0,.45); font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        .head { display:flex; justify-content:space-between; align-items:center; padding:14px 16px; border-bottom:1px solid #243244; }
        .title { font-weight:700; }
        .tag { margin-left:8px; padding:3px 7px; border-radius:999px; background:#312e81; color:#c7d2fe; font-size:12px; }
        .close { border:0; background:transparent; color:#94a3b8; cursor:pointer; font-size:20px; }
        .body { display:grid; grid-template-columns:1fr 1fr; gap:12px; overflow:auto; padding:14px; }
        .col { min-width:0; }
        .label { margin-bottom:6px; color:#94a3b8; font-size:12px; }
        textarea { width:100%; min-height:300px; resize:vertical; border:1px solid #334155; border-radius:10px; padding:12px; outline:none; background:#020617; color:#e2e8f0; font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; }
        textarea:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.18); }
        .foot { display:flex; justify-content:flex-end; gap:8px; padding:12px 14px; border-top:1px solid #243244; }
        button { border:1px solid #475569; border-radius:9px; padding:8px 12px; background:#1e293b; color:#e2e8f0; cursor:pointer; font-weight:600; }
        button:hover { background:#334155; }
        .primary { border-color:#4f46e5; background:#4f46e5; color:#fff; }
        .primary:hover { background:#4338ca; }
        @media (max-width:720px) { .body { grid-template-columns:1fr; } textarea { min-height:180px; } }
      </style>
      <div class="panel" role="dialog" aria-modal="true" aria-label="提示词优化预览">
        <div class="head"><div><span class="title">优化预览</span><span class="tag"></span></div><button class="close" type="button">×</button></div>
        <div class="body">
          <div class="col"><div class="label">原始输入</div><textarea class="original" readonly></textarea></div>
          <div class="col"><div class="label">优化结果（可继续编辑）</div><textarea class="enhanced"></textarea></div>
        </div>
        <div class="foot">
          <button class="cancel" type="button">取消</button>
          <button class="copy" type="button">复制</button>
          <button class="append" type="button">追加</button>
          <button class="replace primary" type="button">替换输入框</button>
        </div>
      </div>
    `;
    root.querySelector(".tag").textContent = templateName || "优化";
    root.querySelector(".original").value = original;
    root.querySelector(".enhanced").value = enhanced;
    const close = () => closePreview();
    root.querySelector(".close").addEventListener("click", close);
    root.querySelector(".cancel").addEventListener("click", close);
    root.querySelector(".replace").addEventListener("click", () => {
      writeText(target, root.querySelector(".enhanced").value);
      close();
      showSuccess("已替换输入框内容");
    });
    root.querySelector(".append").addEventListener("click", () => {
      const current = readText(target).trimEnd();
      const next = root.querySelector(".enhanced").value.trim();
      writeText(target, `${current}${current ? "\n\n" : ""}${next}`);
      close();
      showSuccess("已追加优化结果");
    });
    root.querySelector(".copy").addEventListener("click", async () => {
      await navigator.clipboard.writeText(root.querySelector(".enhanced").value);
      root.querySelector(".copy").textContent = "已复制";
    });
    host.addEventListener("pointerdown", (event) => {
      const panel = root.querySelector(".panel");
      if (!event.composedPath().includes(panel)) close();
    });
    document.documentElement.appendChild(host);
    state.preview = host;
    setTimeout(() => root.querySelector(".enhanced").focus(), 0);
  }

  function closePreview() {
    state.preview?.remove();
    state.preview = null;
  }

  function findUsableTarget(node) {
    if (!(node instanceof Element)) return null;
    const candidate = node.matches?.("textarea,input,[contenteditable='true'],[role='textbox']")
      ? node
      : node.closest?.("textarea,input,[contenteditable='true'],[role='textbox']");
    return isUsableEditor(candidate) ? candidate : null;
  }

  function findBestVisibleEditor() {
    const selectors = [
      "textarea",
      "[contenteditable='true'][role='textbox']",
      ".ProseMirror[contenteditable='true']",
      "[contenteditable='true']",
      "input[type='text']"
    ];
    const candidates = [...document.querySelectorAll(selectors.join(","))].filter(isUsableEditor);
    candidates.sort((a, b) => scoreEditor(b) - scoreEditor(a));
    return candidates[0] || null;
  }

  function scoreEditor(element) {
    const rect = element.getBoundingClientRect();
    let score = Math.min(rect.width * rect.height, 200000);
    const aria = `${element.getAttribute("aria-label") || ""} ${element.getAttribute("placeholder") || ""}`.toLowerCase();
    if (/message|prompt|ask|chat|输入|提问|发送/.test(aria)) score += 200000;
    if (rect.bottom > window.innerHeight * 0.55) score += 50000;
    return score;
  }

  function isUsableEditor(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.closest("#prompt-professionalizer-host")) return false;
    if (element.matches("input[type='password'],input[type='hidden'],[readonly],[disabled],[aria-disabled='true']")) return false;
    if (!element.isContentEditable && !element.matches("textarea,input[type='text'],input:not([type])") && element.getAttribute("role") !== "textbox") return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width >= 120 && rect.height >= 24;
  }

  function readText(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.value || "";
    return element.innerText || element.textContent || "";
  }

  function writeText(element, value) {
    element.focus();
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(element, value);
      else element.value = value;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    const inserted = document.execCommand?.("insertText", false, value);
    if (!inserted) {
      element.textContent = value;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    }
    element.dispatchEvent(new Event("change", { bubbles: true }));
    selection.removeAllRanges();
  }

  function showToolbar() {
    if (!state.toolbarHost || !state.activeElement) return;
    state.toolbarHost.style.display = "block";
    scheduleReposition();
  }

  function scheduleReposition() {
    if (state.repositionFrame) return;
    state.repositionFrame = requestAnimationFrame(() => {
      state.repositionFrame = 0;
      repositionToolbar();
    });
  }

  function repositionToolbar() {
    const element = state.activeElement;
    const host = state.toolbarHost;
    if (!element || !host || !document.contains(element) || !isUsableEditor(element)) {
      if (host) host.style.display = "none";
      return;
    }
    const rect = element.getBoundingClientRect();
    const top = Math.max(8, Math.min(window.innerHeight - 38, rect.bottom - 36));
    const left = Math.max(8, Math.min(window.innerWidth - 86, rect.right - 82));
    host.style.top = `${top}px`;
    host.style.left = `${left}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
    host.style.display = rect.bottom < 0 || rect.top > window.innerHeight ? "none" : "block";
  }

  function setLoading(loading) {
    state.loading = loading;
    const main = state.toolbarRoot?.querySelector(".main");
    const toggle = state.toolbarRoot?.querySelector(".toggle");
    if (!main || !toggle) return;
    main.disabled = loading;
    toggle.disabled = loading;
    main.querySelector(".spark").innerHTML = loading ? '<span class="spinner"></span>' : "✨";
  }

  function showError(error) {
    showToast(error instanceof Error ? error.message : String(error), true);
  }

  function showSuccess(message) {
    showToast(message, false);
  }

  function showToast(message, isError) {
    const existing = state.toolbarRoot?.querySelector(".toast");
    existing?.remove();
    if (!state.toolbarRoot) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.style.background = isError ? "#7f1d1d" : "#14532d";
    toast.textContent = message;
    state.toolbarRoot.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  async function getPublicSettings() {
    const response = await chrome.runtime.sendMessage({ action: "get-public-settings" }).catch(() => null);
    return response?.settings || { defaultTemplateId: "professional", showPreview: true, templates: [] };
  }
})();
