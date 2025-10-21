// src/core/common.js
import crypto from "node:crypto";

function deepSort(obj) {
  if (Array.isArray(obj)) return obj.map(deepSort);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const k of Object.keys(obj).sort()) out[k] = deepSort(obj[k]);
    return out;
  }
  return obj;
}

function contentToString(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) return "";
        if (typeof part === "string") return part;
        if (typeof part.text === "string") return part.text;
        if (part.text && typeof part.text.value === "string") return part.text.value;
        if (typeof part.content === "string") return part.content;
        if (typeof part.value === "string") return part.value;
        if (part.type === "text") {
          if (typeof part.text === "string") return part.text;
          if (part.text && typeof part.text.value === "string") return part.text.value;
        }
        return "";
      })
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  try {
    const s = JSON.stringify(content);
    return s === "{}" ? "" : s;
  } catch {
    return "";
  }
}

function canonicalizeMessages(messages = []) {
  return messages.map((m) => {
    const role = m?.role ?? m?.lc_kwargs?.role ?? "assistant";
    const raw = m?.content ?? m?.lc_kwargs?.content ?? "";
    return { role, content: contentToString(raw) };
  });
}

function canonicalizeTools(tools = []) {
  const norm = tools.map((t) => {
    const name = t?.function?.name ?? t?.name ?? "";
    const params = t?.function?.parameters ?? t?.parameters ?? {};
    return { name, parameters: deepSort(params) };
  });
  norm.sort((a, b) => a.name.localeCompare(b.name));
  return norm;
}

function canonicalizeCallOptions(callOptions = {}) {
  const cleaned = {};
  for (const [k, v] of Object.entries(callOptions)) {
    if (v === undefined) continue;
    cleaned[k] = v;
  }
  return deepSort(cleaned);
}

export function hashInputs({ model, messages, tools, callOptions }) {
  const canon = {
    model: String(model || ""),
    messages: canonicalizeMessages(messages),
    tools: canonicalizeTools(tools),
    callOptions: canonicalizeCallOptions(callOptions),
  };
  const payload = JSON.stringify(canon);
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function _debugHashParts({ model, messages, tools, callOptions }) {
  return {
    model: String(model || ""),
    messages: canonicalizeMessages(messages),
    tools: canonicalizeTools(tools),
    callOptions: canonicalizeCallOptions(callOptions),
  };
}

// Temporary backward compatibility: exports used by older mode files
export function extractUsage(resp) {
  // gracefully extract usage from LangChain / OpenAI-style responses
  if (!resp) return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const usage =
    resp.usage ||
    resp.response_metadata?.usage ||
    resp.response_metadata?.tokenUsage ||
    resp.tokenUsage ||
    {};
  const prompt = usage.prompt_tokens || usage.promptTokens || usage.prompt || 0;
  const comp = usage.completion_tokens || usage.completionTokens || usage.completion || 0;
  const total = usage.total_tokens || usage.totalTokens || prompt + comp;
  return { prompt_tokens: prompt, completion_tokens: comp, total_tokens: total };
}

export function normalizeMessages(messages = []) {
  // Flatten LangChain/LCEL messages to OpenAI-style [{role,content}]
  return messages.map((m) => {
    const role = m?.role ?? m?.lc_kwargs?.role ?? "assistant";
    const content =
      typeof m?.content === "string"
        ? m.content
        : Array.isArray(m?.content)
        ? m.content.map((p) => (typeof p === "string" ? p : p?.text || "")).join(" ")
        : (m?.lc_kwargs?.content || "");
    return { role, content: String(content).trim() };
  });
}
