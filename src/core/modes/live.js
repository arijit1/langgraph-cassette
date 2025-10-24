// src/core/modes/live.js
// Live mode = call provider, no recording.
import { extractUsage } from "../common.js";

export async function runLive(ctx, { messages, callOptions, key, modelId }) {
  const baseModel = await ctx._createRealModelIfNeeded();
  if (ctx.verbose) console.log(`[Cassette] live → provider (no record)`);
  const aiMessage = await baseModel.invoke(messages, callOptions);
  const usage = extractUsage(aiMessage);
  ctx.logger.onCall({
    mode: "live",
    key,
    usage,
    model: modelId,
    at: Date.now(),
  });
  return aiMessage;
}
