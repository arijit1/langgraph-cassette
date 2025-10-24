// src/utils/tokenLogger.js
// Adds "saved" accounting for replay (and optional for mock).

const DEFAULT_PRICING = {
  "gpt-4o-mini": { input: 0.150, output: 0.600 },
  "gpt-4o": { input: 2.50, output: 5.00 },
  "gpt-4.1-mini": { input: 0.150, output: 0.600 }
};

export function createTokenLogger({
  pricing = DEFAULT_PRICING,
  // Totals: include replay/mock as spend? (we’ll still compute "saved" below)
  includeReplayInTotals = false,
  includeMockInTotals = false,
  // Per-call display: show zero cost for replay/mock?
  zeroOutReplayInCalls = true,
  zeroOutMockInCalls = false
} = {}) {
  const calls = [];

  function price(model, usage) {
    if (!usage) return undefined;
    const p = pricing[model];
    if (!p) return undefined;
    const inT = Number(usage.prompt_tokens || 0);
    const outT = Number(usage.completion_tokens || 0);
    const cost = (inT / 1000) * p.input + (outT / 1000) * p.output;
    return Number.isFinite(cost) ? Number(cost.toFixed(6)) : undefined;
  }

  return {
    // onCall({ mode, key, usage, model, at, costUsd })
    onCall(evt) {
      const { mode, key, usage, model, at } = evt;
      let costUsd = evt.costUsd ?? price(model, usage);

      // Compute "saved" amounts for replay/mock
      let savedUsd = 0, savedTokens = 0;
      if (usage && (mode === "replay" || mode === "mock")) {
        const wouldHaveCost = price(model, usage) || 0;
        savedUsd = wouldHaveCost;
        savedTokens = usage.total_tokens ?? ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0));
      }

      // Zero-out displayed cost/usage for replay/mock if desired
      let shownUsage = usage;
      if (mode === "replay" && zeroOutReplayInCalls) {
        costUsd = 0;
        // keep usage visible so users see what they *would* have spent? your choice:
        // shownUsage = undefined; // uncomment to hide tokens in per-call list
      }
      if (mode === "mock" && zeroOutMockInCalls) {
        costUsd = 0;
        // shownUsage = undefined;
      }

      calls.push({
        mode, key, model, at: at || Date.now(),
        usage: shownUsage,
        costUsd,
        savedUsd,
        savedTokens
      });
    },

    summary() {
      const total = calls.reduce((acc, c) => {
        acc.calls += 1;

        // savings are always accumulated (they don’t inflate spend)
        acc.saved_usd += c.savedUsd || 0;
        acc.saved_tokens += c.savedTokens || 0;

        // spend totals (optionally exclude replay/mock)
        const countThis =
          (c.mode === "replay" ? includeReplayInTotals :
           c.mode === "mock"   ? includeMockInTotals   : true);

        if (countThis) {
          const pt = c.usage?.prompt_tokens || 0;
          const ct = c.usage?.completion_tokens || 0;
          const tt = c.usage?.total_tokens ?? (pt + ct);
          acc.prompt_tokens += pt;
          acc.completion_tokens += ct;
          acc.total_tokens += tt;
          acc.cost_usd += c.costUsd || 0;
        }
        return acc;
      }, {
        calls: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        cost_usd: 0,
        saved_usd: 0,
        saved_tokens: 0
      });

      total.cost_usd = Number(total.cost_usd.toFixed(6));
      total.saved_usd = Number(total.saved_usd.toFixed(6));

      return { total, calls };
    }
  };
}
