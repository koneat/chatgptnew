(() => {
  if (globalThis.__PROMPT_PROFESSIONALIZER_LOADED__) return;
  globalThis.__PROMPT_PROFESSIONALIZER_LOADED__ = true;

  const PRIMARY_HOSTS = new Set(["chatgpt.com", "claude.ai", "gemini.google.com"]);

  const state = {
    activeElement: null,
    publicSettings: null,
    toolbarHost: null,
    toolbarRoot: null,
    menu: null,
    loading: false,
    repositionFrame: 0
  };

  init().catch((error) => console.warn("Prompt Professionalizer 初始化失败", error));

  async function init() {
    state.publicSettings = await getPublicSettings();
    createToolbar();
    observeInputs();

    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName !== "local" || !changes.promptProfessionalizerSettings) return;
      state.publicSettings = await getPublicSettings();
      renderMenu();
      renderActiveTemplate();
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.action !== "enhance-active") return false;
      const target = resolveActiveEditor();
      enhanceTarget(target, message.templateId || state.publicSettings?.defaultTemplateId)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    });
  }

  function observeInputs() {
    const activate = (node) => {
      const target = findUsableTarget(node);
      if (!target) return;
      state.activeElement = target;
      showToolbar();
    };

    document.addEventListener("focusin", (event) => activate(event.target), true);
    document.addEventListener("pointerdown", (event) => activate(event.target), true);
    document.addEventListener("input", (event) => activate(event.target), true);

    document.addEventListener("keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "m") return;
      const target = resolveActiveEditor();
      if (!target) return;
      event.preventDefault();
      enhanceTarget(target, state.publicSettings?.defaultTemplateId).catch(showError);
    }, true);

    window.addEventListener("scroll", scheduleReposition, true);
    window.addEventListener("resize", scheduleReposition, true);

    const observer = new MutationObserver(() => {
      if (!state.activeElement || !document.contains(state.activeElement) || !isUsableEditor(state.activeElement)) {
        state.activeElement = findBestVisibleEditor();
      }
      if (state.activeElement) showToolbar();
      else hideToolbar();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["contenteditable", "aria-label"] });

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
        :host { all:initial; }
        * { box-sizing:border-box; }
        .main { width:30px; height:30px; display:grid; place-items:center; border:1px solid rgba(148,163,184,.55); border-radius:999px; background:#334155; color:#fff; cursor:pointer; box-shadow:0 6px 18px rgba(0,0,0,.28); font:800 14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; user-select:none; }
        .main.available { border-color:#22c55e; background:#16a34a; box-shadow:0 0 0 2px rgba(34,197,94,.18),0 6px 18px rgba(0,0,0,.28); }
        .main:hover { filter:brightness(1.1); transform:translateY(-1px); }
        .main:disabled { opacity:.72; cursor:wait; }
        .main.loading { animation:pulse .8s ease-in-out infinite alternate; }
        .menu { position:absolute; right:0; bottom:36px; min-width:190px; max-width:280px; padding:6px; border:1px solid rgba(148,163,184,.35); border-radius:11px; background:#0f172a; box-shadow:0 12px 32px rgba(0,0,0,.35); display:none; font:12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        .menu.open { display:block; }
        .item { width:100%; min-height:34px; display:flex; align-items:center; justify-content:space-between; gap:10px; border:0; border-radius:8px; padding:8px 10px; background:transparent; color:#fff; cursor:pointer; text-align:left; font:600 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        .item:hover { background:rgba(255,255,255,.1); }
        .item.active::after { content:"当前"; color:#86efac; font-size:11px; font-weight:500; }
        .separator { height:1px; margin:5px 4px; background:#263449; }
        .toast { position:absolute; right:0; bottom:36px; min-width:160px; max-width:320px; padding:9px 11px; border-radius:9px; color:#fff; background:#14532d; box-shadow:0 10px 30px rgba(0,0,0,.25); font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        @keyframes pulse { from { transform:scale(.94); } to { transform:scale(1.05); } }
      </style>
      <button class="main" type="button" aria-label="优化提示词">P</button>
      <div class="menu"></div>
    `;

    const mainButton = root.querySelector(".main");
    mainButton.classList.toggle("available", PRIMARY_HOSTS.has(location.hostname));
    mainButton.addEventListener("click", (event) => {
      if (event.shiftKey) {
        event.stopPropagation();
        root.querySelector(".menu").classList.toggle("open");
        return;
      }
      enhanceTarget(resolveActiveEditor(), state.publicSettings?.defaultTemplateId).catch(showError);
    });
    mainButton.addEventListener("contextmenu", (event) => {
      event.preventDefault();
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
    renderActiveTemplate();
  }

  function renderActiveTemplate() {
    const button = state.toolbarRoot?.querySelector(".main");
    if (!button) return;
    const template = getActiveTemplate();
    button.textContent = "P";
    button.title = `左键：使用“${template?.name || "默认模板"}”优化并替换；右键：选择模板`;
  }

  function renderMenu() {
    if (!state.menu) return;
    state.menu.textContent = "";
    const activeId = state.publicSettings?.defaultTemplateId;
    for (const template of state.publicSettings?.templates || []) {
      const button = document.createElement("button");
      button.className = `item${template.id === activeId ? " active" : ""}`;
      button.type = "button";
      button.textContent = template.name;
      button.addEventListener("click", async () => {
        try {
          const response = await chrome.runtime.sendMessage({ action: "set-default-template", templateId: template.id });
          if (!response?.ok) throw new Error(response?.error || "模板保存失败");
          state.publicSettings.defaultTemplateId = template.id;
          state.menu.classList.remove("open");
          renderMenu();
          renderActiveTemplate();
          showSuccess(`已设为默认模式：${template.name}`);
        } catch (error) {
          showError(error);
        }
      });
      state.menu.appendChild(button);
    }

    const separator = document.createElement("div");
    separator.className = "separator";
    state.menu.appendChild(separator);

    const settingsButton = document.createElement("button");
    settingsButton.className = "item";
    settingsButton.type = "button";
    settingsButton.textContent = "接口与模板设置";
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
    try {
      const response = await chrome.runtime.sendMessage({
        action: "enhance-text",
        text: original,
        templateId: templateId || state.publicSettings?.defaultTemplateId
      });
      if (!response?.ok) throw new Error(response?.error || "优化失败");
      writeText(target, response.enhancedText);
      showSuccess(`已按“${response.templateName || "默认模板"}”替换`);
    } finally {
      setLoading(false);
    }
  }

  function resolveActiveEditor() {
    const focused = findUsableTarget(document.activeElement);
    if (focused) state.activeElement = focused;
    if (state.activeElement && document.contains(state.activeElement) && isUsableEditor(state.activeElement)) return state.activeElement;
    state.activeElement = findBestVisibleEditor();
    return state.activeElement;
  }

  function findUsableTarget(node) {
    if (!(node instanceof Element)) return null;

    const direct = node.matches?.(editorSelector()) ? node : node.closest?.(editorSelector());
    if (isUsableEditor(direct)) return direct;

    const nested = node.querySelector?.(editorSelector());
    if (isUsableEditor(nested)) return nested;
    return null;
  }

  function editorSelector() {
    return [
      "textarea",
      "input[type='text']",
      "input:not([type])",
      "[contenteditable='true'][role='textbox']",
      ".ProseMirror[contenteditable='true']",
      "rich-textarea .ql-editor[contenteditable='true']",
      ".ql-editor[contenteditable='true']",
      "div[contenteditable='true'][aria-label*='prompt' i]",
      "div[contenteditable='true'][aria-label*='message' i]",
      "div[contenteditable='true']",
      "[role='textbox'][contenteditable='true']"
    ].join(",");
  }

  function findBestVisibleEditor() {
    const siteSelectors = [];
    if (location.hostname === "chatgpt.com") {
      siteSelectors.push(
        "#prompt-textarea",
        "div[contenteditable='true'][data-testid*='composer' i]",
        "textarea[placeholder*='message' i]"
      );
    }
    if (location.hostname === "claude.ai") {
      siteSelectors.push(
        "div.ProseMirror[contenteditable='true']",
        "fieldset div[contenteditable='true'][role='textbox']",
        "div[contenteditable='true'][data-testid*='input' i]"
      );
    }
    if (location.hostname === "gemini.google.com") {
      siteSelectors.push(
        "rich-textarea .ql-editor[contenteditable='true']",
        "div.ql-editor[contenteditable='true']",
        "div[contenteditable='true'][aria-label*='prompt' i]"
      );
    }

    const selectors = [...siteSelectors, editorSelector()];
    const candidates = [...document.querySelectorAll(selectors.join(","))].filter(isUsableEditor);
    candidates.sort((a, b) => scoreEditor(b) - scoreEditor(a));
    return candidates[0] || null;
  }

  function scoreEditor(element) {
    const rect = element.getBoundingClientRect();
    let score = Math.min(rect.width * Math.max(rect.height, 40), 250000);
    const metadata = [
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      element.getAttribute("data-testid"),
      element.className
    ].filter(Boolean).join(" ").toLowerCase();

    if (/message|prompt|ask|chat|输入|提问|发送/.test(metadata)) score += 250000;
    if (element.matches(".ProseMirror, .ql-editor")) score += 220000;
    if (element.closest("rich-textarea,fieldset,form")) score += 80000;
    if (rect.bottom > window.innerHeight * 0.5) score += 70000;
    return score;
  }

  function isUsableEditor(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.closest("#prompt-professionalizer-host")) return false;
    if (element.matches("input[type='password'],input[type='hidden'],[readonly],[disabled],[aria-disabled='true']")) return false;
    if (!element.isContentEditable && !element.matches("textarea,input[type='text'],input:not([type])") && element.getAttribute("role") !== "textbox") return false;

    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0 && rect.width >= 120 && rect.height >= 20;
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
      dispatchInputEvents(element, value);
      return;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);

    element.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: value
    }));

    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, value);
    } catch {
      inserted = false;
    }

    if (!inserted || readText(element).trim() !== String(value).trim()) {
      if (element.matches(".ProseMirror")) {
        element.innerHTML = "";
        const paragraph = document.createElement("p");
        paragraph.textContent = value;
        element.appendChild(paragraph);
      } else {
        element.textContent = value;
      }
    }

    dispatchInputEvents(element, value);
    selection.removeAllRanges();
    placeCaretAtEnd(element);
  }

  function dispatchInputEvents(element, value) {
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: "insertText",
      data: value
    }));
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  }

  function placeCaretAtEnd(element) {
    if (!element.isContentEditable) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function getAnchorElement(element) {
    if (!element) return null;
    if (location.hostname === "gemini.google.com") return element.closest("rich-textarea") || element;
    if (location.hostname === "claude.ai") return element.closest("fieldset") || element.closest("form") || element;
    return element;
  }

  function showToolbar() {
    if (!state.toolbarHost || !state.activeElement) return;
    state.toolbarHost.style.display = "block";
    scheduleReposition();
  }

  function hideToolbar() {
    if (state.toolbarHost) state.toolbarHost.style.display = "none";
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
      hideToolbar();
      return;
    }

    const anchor = getAnchorElement(element);
    const rect = anchor.getBoundingClientRect();
    const buttonSize = 30;
    const trailingOffset = PRIMARY_HOSTS.has(location.hostname) ? 44 : 8;
    const top = Math.max(8, Math.min(window.innerHeight - buttonSize - 8, rect.bottom - buttonSize - 5));
    const left = Math.max(8, Math.min(window.innerWidth - buttonSize - 8, rect.right - buttonSize - trailingOffset));
    host.style.top = `${top}px`;
    host.style.left = `${left}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
    host.style.display = rect.bottom < 0 || rect.top > window.innerHeight ? "none" : "block";
  }

  function setLoading(loading) {
    state.loading = loading;
    const main = state.toolbarRoot?.querySelector(".main");
    if (!main) return;
    main.disabled = loading;
    main.classList.toggle("loading", loading);
    main.textContent = "P";
    if (!loading) renderActiveTemplate();
  }

  function getActiveTemplate() {
    const templates = state.publicSettings?.templates || [];
    return templates.find((item) => item.id === state.publicSettings?.defaultTemplateId) || templates[0];
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
    setTimeout(() => toast.remove(), 3000);
  }

  async function getPublicSettings() {
    const response = await chrome.runtime.sendMessage({ action: "get-public-settings" }).catch(() => null);
    return response?.settings || { defaultTemplateId: "professional", templates: [] };
  }
})();
