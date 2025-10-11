// src/utils/replayNormalize.js
// Normalize any recorded response shape into a simple assistant message.

export function normalizeReplayResponse(resp) {
  if (!resp) return { role: "assistant", content: "" };

  // If cassette saved the whole OpenAI payload
  const choiceMsg = resp?.choices?.[0]?.message;
  if (choiceMsg) return msg(choiceMsg);

  // If cassette saved { aiMessage: ... }
  if (resp.aiMessage) return msg(resp.aiMessage);

  // If cassette saved the message directly
  if (resp.role || resp.content || resp.tool_calls || resp.toolCalls || resp.lc_kwargs) {
    return msg(resp);
  }

  // Last resort
  try {
    const s = JSON.stringify(resp);
    return { role: "assistant", content: s === "{}" ? "" : s };
  } catch {
    return { role: "assistant", content: "" };
  }
}

function msg(m) {
  // LangChain BaseMessage sometimes sticks data under lc_kwargs
  const base = m?.lc_kwargs ? m.lc_kwargs : m;

  return {
    role: base.role || "assistant",
    content: textFrom(base),
    tool_calls: base.tool_calls || base.toolCalls || []
  };
}

function textFrom(m) {
  if (!m) return "";

  // Straight string
  if (typeof m === "string") return m;

  // Common: string content
  if (typeof m.content === "string") return m.content;

  // LangChain sometimes: m.lc_kwargs.content
  if (m.lc_kwargs && typeof m.lc_kwargs.content === "string") return m.lc_kwargs.content;

  // OpenAI / LC: array of parts
  if (Array.isArray(m.content)) {
    return m.content
      .map((part) => {
        if (!part) return "";
        if (typeof part === "string") return part;

        // Support multiple shapes:
        // - { text: "..." }
        // - { text: { value: "..." } }
        // - { content: "..." }
        // - { value: "..." }
        if (typeof part.text === "string") return part.text;
        if (part.text && typeof part.text.value === "string") return part.text.value;
        if (typeof part.content === "string") return part.content;
        if (typeof part.value === "string") return part.value;

        // Some SDKs: { type: "text", text: "..." } or { type: "text", text: { value: "..." } }
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

  // As a fallback, stringify small objects
  try {
    const s = JSON.stringify(m.content ?? m);
    return s === "{}" ? "" : s;
  } catch {
    return "";
  }
}
