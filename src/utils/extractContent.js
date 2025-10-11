// src/utils/extractContent.js
// Robustly extract assistant-visible text from a message or normalized replay.

export function extractAssistantText(msg) {
  if (!msg) return "";

  // If a whole cassette response slipped in
  if (msg.aiMessage) return extractAssistantText(msg.aiMessage);

  // Tool-call-only replies often have empty content
  const tcs = msg.tool_calls || msg.toolCalls || [];
  if ((tcs?.length || 0) > 0 && !msg.content) return "";

  if (typeof msg === "string") return msg;
  if (typeof msg.content === "string") return msg.content;

  // LangChain BaseMessage
  if (msg.lc_kwargs && typeof msg.lc_kwargs.content === "string") return msg.lc_kwargs.content;

  // Array of parts with all common shapes
  if (Array.isArray(msg.content)) {
    return msg.content
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
    const s = JSON.stringify(msg.content ?? msg);
    return s === "{}" ? "" : s;
  } catch {
    return "";
  }
}
