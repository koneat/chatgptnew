(() => {
  if (window.__PP_LOADED__) return;
  window.__PP_LOADED__ = true;

  const POSITION_KEY = "promptProfessionalizerPositions";
  const state = { target: null, host: null, root: null, button: null, loading: false, position: null, drag: null, suppressUntil: 0 };

  init().catch((error) => console.warn("Prompt Professionalizer 初始化失败", error));

  async function init() {
    createButton();
    state.position = await loadPosition();
    observeEditors();
    installMessages();
    installShortcut();
    installDrag();
    applyPosition();
    refreshButton();
  }

  function createButton() {
    const host = document.createElement("div");
    host.id = "prompt-professionalizer-host";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483646;display:none;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        *{box-sizing:border-box}.main{width:30px;height:30px;border:1px solid #64748b;border-radius:999px;background:#475569;color:#fff;font:800 14px Arial;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.28)}
        .main.ok{background:#16a34a;border-color:#22c55e}.main.loading{animation:pulse .8s infinite alternate}.main:disabled{opacity:.75;cursor:wait}
        .menu{display:none;position:absolute;right:0;bottom:36px;min-width:210px;padding:6px;border:1px solid #334155;border-radius:10px;background:#0f172a;box-shadow:0 12px 32px rgba(0,0,0,.35)}
        .menu.open{display:block}.item{width:100%;border:0;border-radius:7px;padding:9px 10px;background:transparent;color:#fff;text-align:left;cursor:pointer;font:600 12px Arial}.item:hover{background:#1e293b}
        .toast{position:absolute;right:0;bottom:36px;min-width:170px;max-width:330px;padding:9px 11px;border-radius:9px;background:#14532d;color:#fff;font:12px/1.4 Arial;box-shadow:0 10px 30px rgba(0,0,0,.25)}
        .toast.error{background:#7f1d1d}@keyframes pulse{from{transform:scale(.94)}to{transform:scale(1.05)}}
      </style>
      <button class="main" type="button" title="严格保真专业化">P</button>
      <div class="menu"><button class="item" data-action="enhance">严格保真专业化</button><button class="item" data-action="reset">恢复默认位置</button><button class="item" data-action="settings">接口与改写规则设置</button></div>`;
    document.documentElement.appendChild(host);
    state.host = host; state.root = root; state.button = root.querySelector(".main");
    state.button.addEventListener("click", (event) => {
      if (Date.now() < state.suppressUntil) return;
      if (event.shiftKey) return toggleMenu();
      enhance().catch(showError);
    });
    state.button.addEventListener("contextmenu", (event) => { event.preventDefault(); toggleMenu(); });
    root.querySelector('[data-action="enhance"]').addEventListener("click", () => { closeMenu(); enhance().catch(showError); });
    root.querySelector('[data-action="settings"]').addEventListener("click", () => chrome.runtime.openOptionsPage());
    root.querySelector('[data-action="reset"]').addEventListener("click", resetPosition);
    document.addEventListener("pointerdown", (event) => { if (!event.composedPath().includes(host)) closeMenu(); }, true);
  }

  function observeEditors() {
    const activate = (node) => {
      const target = findEditor(node);
      if (target) { state.target = target; showButton(); }
    };
    document.addEventListener("focusin", (event) => activate(event.target), true);
    document.addEventListener("pointerdown", (event) => activate(event.target), true);
    const observer = new MutationObserver(() => {
      if (state.target && document.contains(state.target) && usable(state.target)) return;
      state.target = bestEditor();
      if (state.target) showButton(); else state.host.style.display = "none";
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["contenteditable", "aria-label"] });
    state.target = bestEditor();
    if (state.target) showButton();
    addEventListener("scroll", applyPosition, true);
    addEventListener("resize", applyPosition, true);
  }

  function installMessages() {
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
      if (message?.action !== "enhance-active") return false;
      enhance().then(() => respond({ ok: true })).catch((error) => respond({ ok: false, error: error.message }));
      return true;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.promptProfessionalizerHealth) refreshButton();
    });
  }

  function installShortcut() {
    document.addEventListener("keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "m") return;
      event.preventDefault(); enhance().catch(showError);
    }, true);
  }

  async function enhance() {
    if (state.loading) return;
    const target = findEditor(document.activeElement) || (state.target && usable(state.target) ? state.target : bestEditor());
    if (!target) throw new Error("没有找到可编辑的 AI 输入框");
    const original = readText(target).trim();
    if (!original) throw new Error("当前输入框没有内容");
    state.loading = true; state.button.disabled = true; state.button.classList.add("loading");
    try {
      const response = await chrome.runtime.sendMessage({ action: "enhance-text", text: original });
      if (!response?.ok) throw new Error(response?.error || "改写失败");
      writeText(target, response.enhancedText);
      state.target = target;
      const timing = response.cached ? "缓存命中" : `${(response.elapsedMs / 1000).toFixed(1)}s`;
      showToast(`已完成严格保真专业化（${timing}）`);
      refreshButton();
    } finally {
      state.loading = false; state.button.disabled = false; state.button.classList.remove("loading");
    }
  }

  function editorSelector() {
    return ["#prompt-textarea", "textarea", "input[type='text']", "input:not([type])", ".ProseMirror[contenteditable='true']", ".ql-editor[contenteditable='true']", "[contenteditable='true'][role='textbox']", "div[contenteditable='true']"].join(",");
  }
  function findEditor(node) {
    if (!(node instanceof Element)) return null;
    const direct = node.matches?.(editorSelector()) ? node : node.closest?.(editorSelector());
    return usable(direct) ? direct : null;
  }
  function bestEditor() {
    return [...document.querySelectorAll(editorSelector())].filter(usable).sort((a, b) => score(b) - score(a))[0] || null;
  }
  function usable(element) {
    if (!(element instanceof HTMLElement) || element.closest("#prompt-professionalizer-host")) return false;
    if (element.matches("[readonly],[disabled],input[type='password'],input[type='hidden']")) return false;
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return rect.width >= 120 && rect.height >= 20 && style.display !== "none" && style.visibility !== "hidden";
  }
  function score(element) {
    const rect = element.getBoundingClientRect();
    const meta = [element.id, element.className, element.getAttribute("aria-label"), element.getAttribute("placeholder")].filter(Boolean).join(" ").toLowerCase();
    return rect.width * Math.max(rect.height, 40) + (/prompt|message|chat|输入|提问/.test(meta) ? 300000 : 0) + (rect.bottom > innerHeight * .5 ? 80000 : 0);
  }
  function readText(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.value;
    return element.innerText || element.textContent || "";
  }
  function writeText(element, text) {
    element.focus();
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
      setter ? setter.call(element, text) : element.value = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const selection = getSelection(); selection.removeAllRanges();
    const range = document.createRange(); range.selectNodeContents(element); selection.addRange(range);
    if (!document.execCommand("insertText", false, text)) element.textContent = text;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }

  function showButton() {
    state.host.style.display = "block";
    if (!state.position) {
      const rect = state.target.getBoundingClientRect();
      state.host.style.left = `${Math.max(4, Math.min(innerWidth - 34, rect.right - 34))}px`;
      state.host.style.top = `${Math.max(4, Math.min(innerHeight - 34, rect.top - 36))}px`;
    } else applyPosition();
  }
  function installDrag() {
    state.button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const rect = state.host.getBoundingClientRect();
      state.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
      state.button.setPointerCapture?.(event.pointerId);
    });
    state.button.addEventListener("pointermove", (event) => {
      const d = state.drag; if (!d || d.id !== event.pointerId) return;
      const dx = event.clientX - d.x, dy = event.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true; event.preventDefault();
      state.position = { x: clamp((d.left + dx) / Math.max(1, innerWidth - 30)), y: clamp((d.top + dy) / Math.max(1, innerHeight - 30)) };
      applyPosition();
    });
    const finish = async (event) => {
      const d = state.drag; if (!d || d.id !== event.pointerId) return;
      state.drag = null;
      if (d.moved) { state.suppressUntil = Date.now() + 350; await savePosition(); }
    };
    state.button.addEventListener("pointerup", finish); state.button.addEventListener("pointercancel", finish);
  }
  function applyPosition() {
    if (!state.position || !state.host) return;
    state.host.style.left = `${Math.max(4, Math.min(innerWidth - 34, state.position.x * (innerWidth - 30)))}px`;
    state.host.style.top = `${Math.max(4, Math.min(innerHeight - 34, state.position.y * (innerHeight - 30)))}px`;
  }
  async function loadPosition() { const map = (await chrome.storage.local.get(POSITION_KEY))[POSITION_KEY] || {}; return map[location.hostname] || null; }
  async function savePosition() { const data = await chrome.storage.local.get(POSITION_KEY), map = data[POSITION_KEY] || {}; map[location.hostname] = state.position; await chrome.storage.local.set({ [POSITION_KEY]: map }); }
  async function resetPosition() { const data = await chrome.storage.local.get(POSITION_KEY), map = data[POSITION_KEY] || {}; delete map[location.hostname]; await chrome.storage.local.set({ [POSITION_KEY]: map }); state.position = null; closeMenu(); showButton(); }
  async function refreshButton() { const response = await chrome.runtime.sendMessage({ action: "get-public-settings" }).catch(() => null); state.button?.classList.toggle("ok", response?.settings?.health?.ok === true); }
  function toggleMenu() { state.root.querySelector(".menu").classList.toggle("open"); }
  function closeMenu() { state.root.querySelector(".menu").classList.remove("open"); }
  function showToast(message, error = false) { const old = state.root.querySelector(".toast"); old?.remove(); const node = document.createElement("div"); node.className = `toast${error ? " error" : ""}`; node.textContent = message; state.root.appendChild(node); setTimeout(() => node.remove(), 3200); }
  function showError(error) { showToast(error instanceof Error ? error.message : String(error), true); }
  function clamp(value) { return Math.min(1, Math.max(0, Number(value) || 0)); }
})();
