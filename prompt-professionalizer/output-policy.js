(() => {
  if (globalThis.__PROMPT_PROFESSIONALIZER_OUTPUT_POLICY__) return;
  globalThis.__PROMPT_PROFESSIONALIZER_OUTPUT_POLICY__ = true;

  const nextFetch = globalThis.fetch.bind(globalThis);
  const PLACEHOLDER_PREFIX = "__PP_AT_KEEP_";
  const MAX_QUALITY_ATTEMPTS = 2;

  globalThis.fetch = async function promptProfessionalizerPolicyFetch(input, init = {}) {
    const prepared = prepareRequest(input, init);
    if (!prepared.enforce) return nextFetch(input, init);

    let lastError = "";
    for (let attempt = 0; attempt < MAX_QUALITY_ATTEMPTS; attempt += 1) {
      const requestInit = buildAttemptInit(prepared, attempt);
      const response = await nextFetch(input, requestInit);
      if (!response.ok) return response;

      const checked = await validateResponse(response, prepared.segments);
      if (checked.ok) return checked.response;
      lastError = checked.error;
    }

    return jsonResponse(null, {
      error: {
        message: `模型输出未通过稳定性校验：${lastError || "结果不符合中文与 @ 原样保留要求"}`
      }
    }, 422, "Unprocessable Model Output");
  };

  function prepareRequest(input, init) {
    if (String(init?.method || "GET").toUpperCase() !== "POST" || typeof init?.body !== "string") {
      return { enforce: false };
    }

    let body;
    try {
      body = JSON.parse(init.body);
    } catch {
      return { enforce: false };
    }
    if (!body || !Array.isArray(body.messages)) return { enforce: false };

    const userIndex = findLastUserIndex(body.messages);
    if (userIndex < 0) return { enforce: false };
    const originalText = textFromValue(body.messages[userIndex]?.content).trim();
    if (!originalText || isValidationRequest(body.messages, originalText)) return { enforce: false };

    const protectedInput = protectAtSegments(originalText);
    const messages = structuredClone(body.messages);
    messages[userIndex] = { ...messages[userIndex], content: protectedInput.text };

    return {
      enforce: true,
      originalInit: init,
      body: { ...body, messages },
      segments: protectedInput.segments
    };
  }

  function buildAttemptInit(prepared, attempt) {
    const body = structuredClone(prepared.body);
    body.temperature = 0.1;
    if (Number.isFinite(Number(body.max_tokens))) body.max_tokens = Math.min(640, Math.max(192, Number(body.max_tokens)));
    if (Number.isFinite(Number(body.max_completion_tokens))) {
      body.max_completion_tokens = Math.min(640, Math.max(512, Number(body.max_completion_tokens)));
    }

    const strictRules = [
      "【不可违反】最终输出必须使用简体中文。",
      `【不可违反】所有 ${PLACEHOLDER_PREFIX}...__ 占位符必须逐字保留，不能删除、翻译、改写、拆分、复制、调换或改变次数。`,
      "【不可违反】不得回答原始问题，只能优化原始提示词。",
      "只输出优化后的提示词正文，不要解释、不要加标题、不要使用代码围栏。"
    ];
    if (attempt > 0) {
      strictRules.unshift("上一次输出未通过自动校验。本次必须严格遵守以下规则，否则结果会被拒绝。");
    }

    const systemIndex = body.messages.findIndex((item) => item?.role === "system");
    const policy = strictRules.join("\n");
    if (systemIndex >= 0) {
      body.messages[systemIndex] = {
        ...body.messages[systemIndex],
        content: `${textFromValue(body.messages[systemIndex].content).trim()}\n\n${policy}`.trim()
      };
    } else {
      body.messages.unshift({ role: "system", content: policy });
    }

    const userIndex = findLastUserIndex(body.messages);
    if (userIndex >= 0) {
      body.messages[userIndex] = {
        ...body.messages[userIndex],
        content: [
          "请优化下面的原始提示词。",
          "返回必须是简体中文。",
          `所有 ${PLACEHOLDER_PREFIX}...__ 占位符必须原样保留且各出现一次。`,
          "",
          "原始提示词：",
          textFromValue(body.messages[userIndex].content)
        ].join("\n")
      };
    }

    return { ...prepared.originalInit, body: JSON.stringify(body) };
  }

  async function validateResponse(response, segments) {
    let data;
    try {
      data = JSON.parse(await response.clone().text());
    } catch {
      return { ok: false, error: "接口返回的不是可解析 JSON" };
    }

    const candidate = extractOutput(data).trim();
    if (!candidate) return { ok: false, error: "模型未返回最终文本" };

    let restored = candidate;
    for (const segment of segments) {
      const count = countOccurrences(restored, segment.marker);
      if (count !== 1) {
        return {
          ok: false,
          error: `带 @ 的原始片段“${segment.value}”未被完整保留（占位符出现 ${count} 次）`
        };
      }
      restored = restored.replace(segment.marker, segment.value);
    }

    if (restored.includes(PLACEHOLDER_PREFIX)) {
      return { ok: false, error: "返回内容包含无法识别的 @ 占位符" };
    }
    if (!/[\u3400-\u9fff]/u.test(restored)) {
      return { ok: false, error: "返回内容不是中文" };
    }

    const expectedCounts = new Map();
    for (const segment of segments) {
      expectedCounts.set(segment.value, (expectedCounts.get(segment.value) || 0) + 1);
    }
    for (const [value, expected] of expectedCounts) {
      const actual = countOccurrences(restored, value);
      if (actual !== expected) {
        return { ok: false, error: `带 @ 的片段“${value}”数量从 ${expected} 变为 ${actual}` };
      }
    }

    const normalized = structuredClone(data);
    if (!normalized.choices?.[0]?.message) {
      normalized.choices = [{ index: 0, message: { role: "assistant", content: restored }, finish_reason: "stop" }];
    } else {
      normalized.choices[0].message.content = restored;
    }
    normalized.prompt_professionalizer = {
      ...(normalized.prompt_professionalizer || {}),
      output_policy: "zh-CN-and-at-preserved"
    };

    return { ok: true, response: jsonResponse(response, normalized) };
  }

  function protectAtSegments(text) {
    const source = String(text || "");
    const matches = [];
    const occupied = [];
    const patterns = [
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu,
      /@[\p{L}\p{N}_./:+-]+/gu
    ];

    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        if (occupied.some(([left, right]) => start < right && end > left)) continue;
        occupied.push([start, end]);
        matches.push({ start, end, value: match[0] });
      }
    }

    matches.sort((a, b) => a.start - b.start);
    let cursor = 0;
    let protectedText = "";
    const segments = matches.map((item, index) => {
      const marker = `${PLACEHOLDER_PREFIX}${index}_${fingerprint(item.value)}__`;
      protectedText += source.slice(cursor, item.start) + marker;
      cursor = item.end;
      return { ...item, marker };
    });
    protectedText += source.slice(cursor);
    return { text: protectedText, segments };
  }

  function isValidationRequest(messages, userText) {
    const allText = messages.map((item) => textFromValue(item?.content)).join("\n");
    return userText === "OK" && /仅输出\s*OK|原样输出|只回复\s*OK/i.test(allText);
  }

  function findLastUserIndex(messages) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "user") return index;
    }
    return -1;
  }

  function extractOutput(data) {
    return textFromValue(
      data?.choices?.[0]?.message?.content
      ?? data?.choices?.[0]?.text
      ?? data?.output_text
      ?? data?.content
      ?? data?.message?.content
      ?? data?.response
      ?? data?.result
      ?? data?.text
    );
  }

  function textFromValue(value, depth = 0) {
    if (depth > 6 || value == null) return "";
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.map((item) => textFromValue(item, depth + 1)).filter(Boolean).join("\n");
    if (typeof value !== "object") return "";
    for (const key of ["text", "content", "output_text", "value", "parts", "message", "response", "result"]) {
      if (!(key in value)) continue;
      const text = textFromValue(value[key], depth + 1);
      if (text) return text;
    }
    return "";
  }

  function countOccurrences(source, value) {
    if (!value) return 0;
    let count = 0;
    let offset = 0;
    while (true) {
      const index = String(source).indexOf(value, offset);
      if (index < 0) return count;
      count += 1;
      offset = index + value.length;
    }
  }

  function fingerprint(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function jsonResponse(original, payload, status = original?.status || 200, statusText = original?.statusText || "OK") {
    const headers = new Headers(original?.headers || {});
    headers.set("content-type", "application/json; charset=utf-8");
    headers.delete("content-length");
    return new Response(JSON.stringify(payload), { status, statusText, headers });
  }
})();
