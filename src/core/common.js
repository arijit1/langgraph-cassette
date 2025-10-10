// src/core/common.js
import crypto from "node:crypto";

export function normalizeMessages(messages) {
  return (messages || []).map((m) => {
    const { role, content, name, tool_calls, function_call } = m || {};
    return { role, content, name, tool_calls, function_call };
  });
}

export function sha(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

export function hashInputs({ messages, model, tools, callOptions }) {
  const norm = {
    m: normalizeMessages(messages),
    model,
    tools: (tools || []).map((t) => ({
      name: t?.name || "",
      schemaHash: sha(JSON.stringify(t?.parameters || t?.schema || null)),
    })),
    callOptions: callOptions
      ? {
          temperature: callOptions.temperature ?? undefined,
          top_p: callOptions.top_p ?? undefined,
        }
      : {},
  };
  return sha(JSON.stringify(norm));
}

export function getEnvMode(defaultMode = "auto") {
  const v = process.env.CASSETTE_MODE?.toLowerCase();
  return ["live", "record", "replay", "auto"].includes(v) ? v : defaultMode;
}

export function getEnvDir(defaultDir = ".cassettes") {
  return process.env.CASSETTE_DIR || defaultDir;
}

export function getEnvOnReplayMiss(defaultBehavior = "error") {
  const v = (process.env.CASSETTE_REPLAY_MISS || "").toLowerCase();
  return ["error", "live", "mock"].includes(v) ? v : defaultBehavior;
}

// ✅ make sure this is exported
export function extractUsage(aiMessage) {
  const meta =
    aiMessage?.response_metadata || aiMessage?._metadata || aiMessage?.metadata;
  const u = meta?.tokenUsage || meta?.usage || meta?.openai?.usage;
  if (!u) return undefined;
  const prompt = u.promptTokens ?? u.prompt_tokens ?? u.input_tokens ?? 0;
  const completion =
    u.completionTokens ?? u.completion_tokens ?? u.output_tokens ?? 0;
  const total = u.totalTokens ?? u.total_tokens ?? prompt + completion;
  return {
    prompt_tokens: prompt || 0,
    completion_tokens: completion || 0,
    total_tokens: total || 0,
  };
}
