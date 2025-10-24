// Accept both shapes:
//  - flat: { name, args, id? }
//  - wrapped: { function: { name, arguments }, id? }
export function getToolName(tc) {
  return tc?.name ?? tc?.function?.name ?? null;
}

export function getToolArgs(tc) {
  // flat
  if (tc?.args && typeof tc.args === "object") return tc.args;
  if (tc?.args && typeof tc.args === "string") { try { return JSON.parse(tc.args); } catch {} }

  // wrapped
  const raw = tc?.function?.arguments;
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return {}; } }
  if (typeof raw === "object" && raw) return raw;

  return {};
}
