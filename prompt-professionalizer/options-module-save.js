(() => {
  const SETTINGS_KEY = "promptProfessionalizerSettings";
  const MAX_TEMPLATES = 50;
  const MAX_TEMPLATE_NAME = 80;
  const MAX_TEMPLATE_RULE = 20000;
  const MAX_GLOBAL_PROMPT = 30000;

  init().catch((error) => showStatus(error.message, true));

  async function init() {
    const saveTemplatesButton = document.getElementById("save-templates");
    const saveGlobalButton = document.getElementById("save-global-prompt");
    const defaultTemplate = document.getElementById("default-template");
    const templateList = document.getElementById("template-list");
    const globalPrompt = document.getElementById("global-system-prompt");

    if (!saveTemplatesButton || !saveGlobalButton || !defaultTemplate || !templateList || !globalPrompt) {
      throw new Error("模块保存控件初始化失败");
    }

    saveTemplatesButton.addEventListener("click", () => saveTemplates());
    saveGlobalButton.addEventListener("click", saveGlobalPrompt);

    // 原逻辑会在切换默认模板时调用“保存全部”，这里在捕获阶段改为只保存模板模块。
    document.addEventListener("change", (event) => {
      if (event.target !== defaultTemplate) return;
      event.stopImmediatePropagation();
      saveTemplates({ successMessage: "默认模板已保存" });
    }, true);

    templateList.addEventListener("input", () => markDirty(saveTemplatesButton, "保存模板"), true);
    globalPrompt.addEventListener("input", () => markDirty(saveGlobalButton, "保存系统提示词"));

    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.id === "add-template" || target.closest(".template-card .delete")) {
        setTimeout(() => markDirty(saveTemplatesButton, "保存模板"), 0);
      }
    }, true);
  }

  async function saveTemplates({ successMessage = "模板已保存" } = {}) {
    const button = document.getElementById("save-templates");
    const defaultSelect = document.getElementById("default-template");
    const cards = [...document.querySelectorAll(".template-card")];
    const templates = cards.map((card, index) => readTemplate(card, index));

    if (!templates.length) throw new Error("至少需要一个优化模板");
    if (templates.length > MAX_TEMPLATES) throw new Error(`优化模板最多保存 ${MAX_TEMPLATES} 个`);

    const requestedDefault = String(defaultSelect?.value || "");
    const defaultTemplateId = templates.some((item) => item.id === requestedDefault)
      ? requestedDefault
      : templates[0].id;

    await withButtonBusy(button, "保存中…", async () => {
      await patchSettings({ templates, defaultTemplateId });
      syncPageSettings({ templates, defaultTemplateId });
      button.dataset.dirty = "false";
      showStatus(successMessage);
    });
  }

  async function saveGlobalPrompt() {
    const button = document.getElementById("save-global-prompt");
    const input = document.getElementById("global-system-prompt");
    const globalSystemPrompt = String(input?.value || "").trim();

    if (!globalSystemPrompt) throw new Error("系统提示词不能为空");
    if (globalSystemPrompt.length > MAX_GLOBAL_PROMPT) {
      throw new Error(`系统提示词不能超过 ${MAX_GLOBAL_PROMPT} 个字符`);
    }

    await withButtonBusy(button, "保存中…", async () => {
      await patchSettings({ globalSystemPrompt });
      syncPageSettings({ globalSystemPrompt });
      input.value = globalSystemPrompt;
      button.dataset.dirty = "false";
      showStatus("系统提示词已保存");
    });
  }

  function readTemplate(card, index) {
    const name = String(card.querySelector(".name")?.value || "").trim();
    const instruction = String(card.querySelector("textarea")?.value || "").trim();
    const id = String(card.dataset.id || crypto.randomUUID());

    if (!name) throw new Error(`第 ${index + 1} 个模板名称不能为空`);
    if (!instruction) throw new Error(`模板“${name}”的优化规则不能为空`);
    if (name.length > MAX_TEMPLATE_NAME) throw new Error(`模板名称不能超过 ${MAX_TEMPLATE_NAME} 个字符`);
    if (instruction.length > MAX_TEMPLATE_RULE) {
      throw new Error(`模板“${name}”的优化规则不能超过 ${MAX_TEMPLATE_RULE} 个字符`);
    }
    return { id, name, instruction };
  }

  async function patchSettings(patch) {
    const result = await chrome.storage.local.get(SETTINGS_KEY);
    const current = result[SETTINGS_KEY] || {};
    await chrome.storage.local.set({
      [SETTINGS_KEY]: {
        ...current,
        ...structuredClone(patch)
      }
    });
  }

  function syncPageSettings(patch) {
    // options.js 使用全局词法变量 settings；可访问时同步，保证后续“保存全部”不会回滚模块值。
    try {
      if (typeof settings === "object" && settings) Object.assign(settings, structuredClone(patch));
    } catch {}
  }

  async function withButtonBusy(button, busyText, operation) {
    if (!button || button.disabled) return;
    const cleanLabel = button.textContent.replace(/^●\s*/, "");
    button.disabled = true;
    button.textContent = busyText;
    try {
      await operation();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      button.disabled = false;
      button.textContent = cleanLabel;
    }
  }

  function markDirty(button, label) {
    if (!button || button.disabled) return;
    button.dataset.dirty = "true";
    button.textContent = `● ${label}`;
  }

  function showStatus(message, error = false) {
    const element = document.getElementById("save-status");
    if (!element) return;
    element.textContent = message;
    element.className = `save-status show${error ? " error" : ""}`;
    clearTimeout(showStatus.timer);
    showStatus.timer = setTimeout(() => { element.className = "save-status"; }, 3200);
  }
})();
