// src/utils/extractContent.js
function looksLikeLCJSON(s) {
  return typeof s === "string" && s.startsWith('{"lc":1') && s.includes('"kwargs":');
}

function partsToText(parts) {
  return parts
    .map((p) => {
      if (!p) return "";
      if (typeof p === "string") return p;
      if (typeof p.text === "string") return p.text;
      if (p.text && typeof p.text.value === "string") return p.text.value;
      if (typeof p.content === "string") return p.content;
      if (typeof p.value === "string") return p.value;
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function extractAssistantText(msg) {
  if (!msg) return "";

  // 1) direct string content
  if (typeof msg.content === "string") {
    // Could be a serialized LC JSON string
    if (looksLikeLCJSON(msg.content)) {
      try {
        const j = JSON.parse(msg.content);
        return j?.kwargs?.content ?? msg.content;
      } catch {
        return msg.content;
      }
    }
    return msg.content;
  }

  // 2) array content (parts)
  if (Array.isArray(msg.content)) {
    return partsToText(msg.content);
  }

  // 3) LangChain-style kwargs
  if (msg?.kwargs?.content) {
    if (typeof msg.kwargs.content === "string") return msg.kwargs.content;
    if (Array.isArray(msg.kwargs.content)) return partsToText(msg.kwargs.content);
  }

  // 4) whole message comes in as a serialized LC JSON string
  if (typeof msg === "string" && looksLikeLCJSON(msg)) {
    try {
      const j = JSON.parse(msg);
      return j?.kwargs?.content ?? "";
    } catch {
      return "";
    }
  }

  // 5) fallback
  try {
    // some SDKs stash content in additional_kwargs.message or similar
    if (msg?.additional_kwargs?.message && typeof msg.additional_kwargs.message === "string") {
      return msg.additional_kwargs.message;
    }
  } catch {}

  return "";
}
