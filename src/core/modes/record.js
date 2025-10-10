// src/core/modes/record.js
// Record mode (and auto-miss path): call provider, then write cassette.
import { extractUsage, normalizeMessages } from "../common.js";
import { saveCassette, appendIndex } from "../../utils/cassette.js";

export async function runRecord(ctx, { messages, callOptions, key, modelId }) {
  const baseModel = await ctx._createRealModelIfNeeded();
  if (ctx.verbose) console.log(`[Cassette] record → provider then save cassette`);
  const aiMessage = await baseModel.invoke(messages, callOptions);
  const usage = extractUsage(aiMessage);

  let cassette = {
    llm: {
      provider: "openai",
      model: modelId,
      parameters: { ...ctx.modelOptions },
    },
    key: {
      hash: key,
      inputs: {
        messages: normalizeMessages(messages),
        tools: (ctx._tools || []).map((t) => ({
          name: t?.name,
          parameters: t?.parameters || t?.schema || null,
        })),
        extras: { callOptions },
      },
    },
    request: { messages, tools: ctx._tools },
    response: { aiMessage },
    usage: usage
      ? {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
          cost_usd: undefined, // logger computes cost; don't persist
        }
      : undefined,
  };

  if (ctx.redact) {
    try { cassette = ctx.redact(cassette) || cassette; } catch {}
  }

  const file = await saveCassette(ctx.cassetteDir, key, cassette);
  try {
    await appendIndex(ctx.cassetteDir, {
      hash: key,
      file,
      model: modelId,
      created_at: new Date().toISOString(),
      total_tokens: cassette.usage?.total_tokens || 0,
    });
  } catch {}

  ctx.logger.onCall({
    mode: "record",
    key,
    usage,
    model: modelId,
    at: Date.now(),
  });
  if (ctx.verbose) console.log(`[Cassette] recorded → ${file}`);
  return aiMessage;
}
