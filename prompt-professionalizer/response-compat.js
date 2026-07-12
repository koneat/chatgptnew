(() => {
  if (globalThis.__PROMPT_PROFESSIONALIZER_RESPONSE_COMPAT__) return;
  globalThis.__PROMPT_PROFESSIONALIZER_RESPONSE_COMPAT__ = true;

  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function promptProfessionalizerFetch(input, init = {}) {
    const prepared = prepareRequest(input, init);
    const response = await nativeFetch(prepared.input, prepared.init);
    if (!prepared.shouldNormalize || !response.ok) return response;

    let raw = "";
    try {
      raw = await response.clone().text();
    } catch {
      return response;
    }

    const contentType = response.headers.get("content-type") || "";
    const parsed = parsePayload(raw);
    const extracted = extractText(parsed, raw, contentType);

    if (extracted.text) {
      return jsonResponse(response, {
        choices: [{
          index: 0,
          message: { role: "assistant", content: extracted.text },
          finish_reason: readFinishReason(parsed) || "stop"
        }],
        prompt_professionalizer: {
          normalized: true,
          source_format: extracted.format
        }
      });
    }

    const diagnostic = buildEmptyDiagnostic(parsed, raw);
    return jsonResponse(response, {
      error: {
        message: `接口返回成功，但模型未生成可识别的最终文本。${diagnostic}`
      }
    }, 422, "Unprocessable Model Response");
  };

  function prepareRequest(input, init) {
    if (String(init?.method || "GET").toUpperCase() !== "POST" || typeof init?.body !== "string") {
      return { input, init, shouldNormalize: false };
    }

    let body;
    try {
      body = JSON.parse(init.body);
    } catch {
      return { input, init, shouldNormalize: false };
    }
    if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
      return { input, init, shouldNormalize: false };
    }

    const model = String(body.model || "").toLowerCase();
    const validation = isValidationRequest(body.messages);

    if (validation) {
      body.messages = [{ role: "user", content: "请只回复 OK" }];
      delete body.max_tokens;
      delete body.max_completion_tokens;
      delete body.max_output_tokens;
      if (isReasoningModel(model)) {
        delete body.temperature;
        delete body.n;
      }
    } else if (isReasoningModel(model)) {
      const current = Number(body.max_completion_tokens);
      if (Number.isFinite(current) && current > 0 && current < 512) {
        body.max_completion_tokens = 512;
      }
    }

    return {
      input,
      init: { ...init, body: JSON.stringify(body) },
      shouldNormalize: true
    };
  }

  function isValidationRequest(messages) {
    const userText = textFromValue(messages.findLast?.((item) => item?.role === "user")?.content
      ?? [...messages].reverse().find((item) => item?.role === "user")?.content).trim();
    const allText = messages.map((item) => textFromValue(item?.content)).join("\n");
    return userText === "OK" && /仅输出\s*OK|原样输出|只回复\s*OK/i.test(allText);
  }

  function isReasoningModel(model) {
    return /(^|\/)(o1|o3|o4)(?:[-.:/]|$)|(^|\/)gpt-5(?:[-.:/]|$)/i.test(String(model || ""));
  }

  function parsePayload(raw) {
    const text = String(raw || "").trim();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { raw: text }; }
  }

  function extractText(data, raw, contentType) {
    const candidates = [
      [data?.choices?.[0]?.message?.content, "openai.chat.message.content"],
      [data?.choices?.[0]?.message?.text, "openai.chat.message.text"],
      [data?.choices?.[0]?.text, "openai.completion.text"],
      [data?.choices?.[0]?.delta?.content, "openai.stream.delta"],
      [data?.output_text, "openai.responses.output_text"],
      [data?.output, "openai.responses.output"],
      [data?.content, "anthropic.content"],
      [data?.message?.content, "message.content"],
      [data?.message, "message"],
      [data?.response, "ollama.response"],
      [data?.result, "result"],
      [data?.answer, "answer"],
      [data?.generated_text, "generated_text"],
      [data?.text, "text"],
      [data?.candidates?.[0]?.content?.parts, "gemini.candidates.parts"],
      [data?.candidates?.[0]?.output, "gemini.candidates.output"],
      [data?.data?.choices?.[0]?.message?.content, "data.openai.chat.content"],
      [data?.data?.output_text, "data.output_text"],
      [data?.data?.content, "data.content"],
      [data?.data?.result, "data.result"],
      [data?.data?.text, "data.text"]
    ];

    for (const [value, format] of candidates) {
      const text = textFromValue(value).trim();
      if (text) return { text: cleanText(text), format };
    }

    const streamText = extractEventStreamText(raw);
    if (streamText) return { text: cleanText(streamText), format: "event-stream" };

    const plain = String(raw || "").trim();
    if (plain && isSafePlainText(plain, contentType)) {
      return { text: cleanText(plain), format: "plain-text" };
    }
    return { text: "", format: detectFormat(data, contentType) };
  }

  function textFromValue(value, depth = 0) {
    if (depth > 6 || value == null) return "";
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value)) {
      return value.map((item) => textFromValue(item, depth + 1)).filter(Boolean).join("\n");
    }
    if (typeof value !== "object") return "";

    for (const key of ["text", "content", "output_text", "value", "parts", "message", "response", "result", "answer", "generated_text", "completion"]) {
      if (!(key in value)) continue;
      const text = textFromValue(value[key], depth + 1);
      if (text) return text;
    }
    return "";
  }

  function extractEventStreamText(raw) {
    const source = String(raw || "");
    if (!/(^|\n)\s*data\s*:/.test(source)) return "";
    const chunks = [];
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*data\s*:\s*(.*)$/);
      if (!match) continue;
      const payload = match[1].trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const item = JSON.parse(payload);
        const text = textFromValue(
          item?.choices?.[0]?.delta?.content
          ?? item?.choices?.[0]?.message?.content
          ?? item?.choices?.[0]?.text
          ?? item?.delta?.text
          ?? item?.delta?.content
          ?? item?.content_block?.text
          ?? item?.output_text
          ?? item?.text
        );
        if (text) chunks.push(text);
      } catch {
        if (!/^[{[]/.test(payload)) chunks.push(payload);
      }
    }
    return chunks.join("").trim();
  }

  function isSafePlainText(raw, contentType) {
    if (!raw || /^\s*</.test(raw) || /^[{[]/.test(raw)) return false;
    return !/text\/html|application\/xml|text\/xml/i.test(contentType);
  }

  function cleanText(value) {
    return String(value || "")
      .trim()
      .replace(/^```(?:text|markdown)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  function readFinishReason(data) {
    return data?.choices?.[0]?.finish_reason
      || data?.finish_reason
      || data?.stop_reason
      || data?.candidates?.[0]?.finishReason
      || "";
  }

  function buildEmptyDiagnostic(data, raw) {
    const finishReason = readFinishReason(data) || "未知";
    const fields = data && typeof data === "object"
      ? Object.keys(data).slice(0, 10).join(", ")
      : "";
    const reasons = [];
    if (/length|max_tokens|max_output/i.test(String(finishReason))) reasons.push("输出额度不足");
    if (data?.choices?.[0]?.message?.reasoning_content) reasons.push("仅返回了推理内容，没有最终 content");
    if (!String(raw || "").trim()) reasons.push("响应体为空");
    const snippet = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 220);
    return [
      `finish_reason=${finishReason}`,
      fields ? `响应字段=${fields}` : "",
      reasons.length ? `可能原因=${reasons.join("、")}` : "",
      snippet ? `响应片段=${snippet}` : ""
    ].filter(Boolean).join("；");
  }

  function detectFormat(data, contentType) {
    if (/text\/event-stream/i.test(contentType)) return "event-stream";
    if (data?.choices) return "openai-compatible";
    if (data?.output || data?.output_text) return "openai-responses";
    if (data?.candidates) return "gemini-compatible";
    if (data?.content) return "anthropic-compatible";
    if (data?.message || data?.response) return "message-compatible";
    return contentType || "unknown";
  }

  function jsonResponse(original, payload, status = original.status, statusText = original.statusText) {
    const headers = new Headers(original.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.delete("content-length");
    return new Response(JSON.stringify(payload), { status, statusText, headers });
  }
})();