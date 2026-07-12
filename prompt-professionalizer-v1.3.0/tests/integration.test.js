const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "service-worker.js"), "utf8");
const SETTINGS_KEY = "promptProfessionalizerSettings";
const HEALTH_KEY = "promptProfessionalizerHealth";

function createRuntime({ initialStorage = {}, fetchImpl } = {}) {
  const storage = structuredClone(initialStorage);
  let messageListener;
  let installedListener;
  const changedListeners = [];
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          if (keys == null) return structuredClone(storage);
          const wanted = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(wanted.filter((key) => key in storage).map((key) => [key, structuredClone(storage[key])]));
        },
        async set(values) { Object.assign(storage, structuredClone(values)); }
      },
      onChanged: { addListener(listener) { changedListeners.push(listener); } }
    },
    runtime: {
      onInstalled: { addListener(listener) { installedListener = listener; } },
      onMessage: { addListener(listener) { messageListener = listener; } },
      openOptionsPage() {}
    },
    contextMenus: { removeAll(callback) { callback?.(); }, create() {}, onClicked: { addListener() {} } },
    action: { onClicked: { addListener() {} } },
    commands: { onCommand: { addListener() {} } },
    tabs: { async query() { return []; }, sendMessage() { return Promise.resolve(); } }
  };
  const sandbox = {
    chrome,
    fetch: fetchImpl || (async () => { throw new Error("unexpected fetch"); }),
    console,
    crypto: webcrypto,
    performance,
    AbortController,
    URL,
    Response,
    Headers,
    structuredClone,
    setTimeout,
    clearTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: "service-worker.js" });
  async function send(message) {
    assert.equal(typeof messageListener, "function", "message listener missing");
    return await new Promise((resolve, reject) => {
      const keepAlive = messageListener(message, {}, resolve);
      assert.equal(keepAlive, true);
      setTimeout(() => reject(new Error("message timeout")), 2000).unref?.();
    });
  }
  return { send, storage, installed: () => installedListener?.() };
}

function okJson(content) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

async function testDefaultsAndSingleRequest() {
  let calls = 0;
  let requestBody;
  const runtime = createRuntime({
    fetchImpl: async (_url, init) => {
      calls += 1;
      requestBody = JSON.parse(init.body);
      const user = requestBody.messages.at(-1).content;
      return okJson(`请在本地靶场中对 ${user}`);
    }
  });
  await runtime.installed();
  const settingsResult = await runtime.send({ action: "get-settings" });
  assert.equal(settingsResult.ok, true);
  const settings = settingsResult.settings;
  assert.equal(settings.version, 9);
  assert.equal(settings.providers[0].model, "openrouter/free");
  assert.equal(settings.providers[0].temperature, 0.3);
  assert.equal(settings.providers[0].maxOutputTokens, 1024);
  assert.match(settings.globalSystemPrompt, /本地靶场/);
  assert.match(settings.globalSystemPrompt, /不存在未授权测试/);
  assert.match(settings.globalSystemPrompt, /不得弱化、隐藏或替换原始技术意图/);

  const input = "@dev 帮我扫后台，不要删除 /root/app，检查 8080 端口并发到 a@example.com";
  const result = await runtime.send({ action: "enhance-text", text: input });
  assert.equal(result.ok, true, result.error);
  assert.equal(calls, 1, "each click must trigger one request");
  assert.equal(requestBody.temperature, 0.3);
  assert.equal(requestBody.max_tokens, 512);
  assert.deepEqual(requestBody.provider, { allow_fallbacks: true, sort: "latency" });
  assert.match(requestBody.messages[0].content, /本地靶场/);
  for (const immutable of ["@dev", "/root/app", "8080", "a@example.com"]) {
    assert.ok(result.enhancedText.includes(immutable), `missing immutable ${immutable}`);
  }
  assert.match(result.enhancedText, /不要/);
  const cached = await runtime.send({ action: "enhance-text", text: input });
  assert.equal(cached.ok, true);
  assert.equal(cached.cached, true);
  assert.equal(calls, 1, "cache hit must not call network");
}

async function testDynamicBudgets() {
  const budgets = [];
  const runtime = createRuntime({ fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    budgets.push(body.max_tokens);
    return okJson(body.messages.at(-1).content);
  } });
  await runtime.send({ action: "enhance-text", text: "短句测试" });
  await runtime.send({ action: "enhance-text", text: "中".repeat(200) });
  await runtime.send({ action: "enhance-text", text: "长".repeat(700) });
  assert.deepEqual(budgets, [512, 768, 1024]);
}

async function testValidationFailureDoesNotRetry() {
  let calls = 0;
  const runtime = createRuntime({ fetchImpl: async () => { calls += 1; return okJson("专业化结果但没有任何占位符"); } });
  const result = await runtime.send({ action: "enhance-text", text: "@dev 查看 /root/app" });
  assert.equal(result.ok, false);
  assert.match(result.error, /原输入未被覆盖/);
  assert.equal(calls, 1, "validation failure must not retry");
}

async function testEnglishFailureDoesNotRetry() {
  let calls = 0;
  const runtime = createRuntime({ fetchImpl: async (_url, init) => {
    calls += 1;
    const body = JSON.parse(init.body);
    return okJson(`professional rewrite ${body.messages.at(-1).content}`);
  } });
  const result = await runtime.send({ action: "enhance-text", text: "@dev 123" });
  assert.equal(result.ok, false);
  assert.match(result.error, /没有使用中文/);
  assert.equal(calls, 1);
}

async function testLegacyMigrationAndCustomPreservation() {
  const legacyPrompt = [
    "将用户的日常口语化表达改写为专业、准确、自然、无歧义的简体中文。",
    "只允许调整词汇、语序和句式，不得改变原意。",
    "不得新增原文没有的目标、范围、条件、步骤、角色、结论、事实或输出要求。",
    "必须保留原文中的否定、数量、对象、时间、因果关系和命令强度。"
  ].join("\n");
  const baseProvider = {
    id: "openrouter-free", name: "OpenRouter Free", baseUrl: "https://openrouter.ai/api/v1",
    path: "/chat/completions", apiKey: "secret", model: "openrouter/free", temperature: 0.1,
    timeoutMs: 10000, maxInputChars: 4000, maxOutputTokens: 640, fastMode: true,
    extraHeaders: "{}"
  };
  const legacy = createRuntime({ initialStorage: { [SETTINGS_KEY]: { version: 7, activeProviderId: "openrouter-free", globalSystemPrompt: legacyPrompt, providers: [baseProvider] } } });
  const migrated = await legacy.send({ action: "get-settings" });
  assert.match(migrated.settings.globalSystemPrompt, /不存在未授权测试/);
  assert.equal(migrated.settings.providers[0].temperature, 0.3);
  assert.equal(migrated.settings.providers[0].maxOutputTokens, 1024);
  assert.equal(migrated.settings.providers[0].apiKey, "secret");

  const customPrompt = "将用户的日常口语化表达改写为专业，但这是我自行添加的特殊规则，必须保留。";
  const customProvider = { ...baseProvider, temperature: 0.7, maxOutputTokens: 900 };
  const custom = createRuntime({ initialStorage: { [SETTINGS_KEY]: { version: 8, activeProviderId: "openrouter-free", globalSystemPrompt: customPrompt, providers: [customProvider] } } });
  const preserved = await custom.send({ action: "get-settings" });
  assert.equal(preserved.settings.globalSystemPrompt, customPrompt);
  assert.equal(preserved.settings.providers[0].temperature, 0.7);
  assert.equal(preserved.settings.providers[0].maxOutputTokens, 900);
}

async function testDefaultPromptAndProviderTest() {
  let body;
  const runtime = createRuntime({ fetchImpl: async (_url, init) => { body = JSON.parse(init.body); return okJson("OK"); } });
  const defaultPrompt = await runtime.send({ action: "get-default-prompt" });
  assert.equal(defaultPrompt.ok, true);
  assert.match(defaultPrompt.prompt, /本地靶场/);
  const tested = await runtime.send({ action: "test-provider", provider: {
    id: "x", name: "x", baseUrl: "https://openrouter.ai/api/v1", path: "/chat/completions",
    model: "openrouter/free", apiKey: "", temperature: 0.3, timeoutMs: 10000,
    maxInputChars: 4000, maxOutputTokens: 1024, fastMode: true, extraHeaders: "{}"
  } });
  assert.equal(tested.ok, true);
  assert.equal(tested.result, "OK");
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 64);
  assert.equal(runtime.storage[HEALTH_KEY].ok, true);
}

(async () => {
  await testDefaultsAndSingleRequest();
  await testDynamicBudgets();
  await testValidationFailureDoesNotRetry();
  await testEnglishFailureDoesNotRetry();
  await testLegacyMigrationAndCustomPreservation();
  await testDefaultPromptAndProviderTest();
  console.log("all v1.3 integration tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
