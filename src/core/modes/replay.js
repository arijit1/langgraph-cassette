// src/core/modes/replay.js
// Replay mode: return cassette; on miss, handle via policy (error|live|mock|callback).
import { loadCassette, shardPath } from "../../utils/cassette.js";
import { CassetteReplayMissError } from "../errors.js";
import { normalizeReplayResponse } from "../../utils/replayNormalize.js";

export async function runReplay(ctx, { messages, callOptions, key, modelId }) {
  const cassettePath = shardPath(ctx.cassetteDir, key);

  // 1) try load cassette (no provider touch)
  const cassette = await loadCassette(ctx.cassetteDir, key);
  if (cassette) {
    if (ctx.verbose) console.log(`[Cassette] replay HIT`);

    const aiNormalized = normalizeReplayResponse(cassette.response);

    ctx.logger.onCall({
      mode: "replay",
      key,
      usage: cassette.usage, // used to compute "saved" in logger
      model: cassette.llm?.model || modelId,
      at: Date.now(),
    });
    return { aiMessage: aiNormalized, hit: true };
  }

  // 2) miss handling
  if (ctx.verbose) {
    console.warn(
      `[Cassette] replay MISS for key=${key.slice(0, 12)} (expected ${cassettePath})`
    );
  }

  const behavior = ctx.onReplayMiss;

  // (a) custom callback
  if (typeof behavior === "function") {
    const maybe = await behavior({
      key,
      cassettePath,
      cassetteDir: ctx.cassetteDir,
      mode: ctx.mode,
      messages,
      modelId,
      callOptions,
    });
    if (maybe) return { aiMessage: maybe, hit: false };
  }

  // (b) explicit fallbacks
  if (behavior === "live") {
    console.warn(`[Cassette] replay MISS → falling back to LIVE (network) due to onReplayMiss=live`);
    const baseModel = await ctx._createRealModelIfNeeded();
    const aiMessage = await baseModel.invoke(messages, callOptions);
    return { aiMessage, hit: false, fellBackTo: "live" };
  }

  if (behavior === "mock") {
    console.warn(`[Cassette] replay MISS → returning MOCK due to onReplayMiss=mock`);
    const { MockLLM } = await import("../../mocks/MockLLM.js");
    const mock = new MockLLM();
    if (mock.bindTools) await mock.bindTools(ctx._tools);
    const aiMessage = await mock.invoke(messages, callOptions);
    ctx.logger.onCall({ mode: "mock", key, model: "mock", at: Date.now() });
    return { aiMessage, hit: false, fellBackTo: "mock" };
  }

  // (c) default: typed, helpful error
  const hint = `Record first, then replay:
  CASSETTE_MODE=record CASSETTE_DIR=${ctx.cassetteDir} node your-script.mjs
Then:
  CASSETTE_MODE=replay  CASSETTE_DIR=${ctx.cassetteDir} node your-script.mjs`;
  throw new CassetteReplayMissError({
    key,
    cassettePath,
    cassetteDir: ctx.cassetteDir,
    mode: ctx.mode,
    hint,
  });
}