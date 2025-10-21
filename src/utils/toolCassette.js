import fs from "node:fs";
import path from "node:path";
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

function stableKey({ name, args }) {
  const payload = JSON.stringify({ name, args: deepSort(args || {}) });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function shardPath(baseDir, key) {
  const shard = key.slice(0, 2);
  return path.join(baseDir, shard, `${key}.json`);
}

export async function loadToolResult(dir, name, args) {
  const key = stableKey({ name, args });
  const file = shardPath(dir, key);
  try {
    const txt = await fs.promises.readFile(file, "utf8");
    return { key, file, json: JSON.parse(txt) };
  } catch {
    return { key, file, json: null };
  }
}

export async function saveToolResult(dir, name, args, result) {
  const key = stableKey({ name, args });
  const file = shardPath(dir, key);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, JSON.stringify(result, null, 2), "utf8");
  return { key, file };
}

/**
 * Get (and optionally record) a tool result with cassette semantics.
 * mode: "auto" | "record" | "replay" | "off"
 * onMiss: "live" | "mock" | "error"
 */
export async function getToolResult({ dir, mode = "auto", onMiss = "live", name, args, exec, verbose = false }) {
  const absDir = path.resolve(dir);
  const { key, file, json } = await loadToolResult(absDir, name, args);

  if (json) {
    if (verbose) console.log(`[ToolCassette] replay HIT ${name} -> ${path.relative(process.cwd(), file)}`);
    return { from: "replay", key, file, result: json };
  }

  if (mode === "replay") {
    if (onMiss === "error") {
      const err = new Error(`Tool replay miss for ${name}. Expected ${file}`);
      err.tool = name;
      err.file = file;
      throw err;
    }
    if (onMiss === "mock") {
      if (verbose) console.warn(`[ToolCassette] MISS ${name} -> MOCK fallback`);
      return { from: "mock", key, file, result: { mock: true, name, args } };
    }
    // fallthrough to live
    if (verbose) console.warn(`[ToolCassette] MISS ${name} -> LIVE fallback`);
  }

  if (mode === "off") {
    const live = await exec();
    return { from: "live", key, file, result: live };
  }

  // auto/record/live fallback → execute and save
  const res = await exec();
  await saveToolResult(absDir, name, args, res);
  if (verbose) console.log(`[ToolCassette] record ${name} -> ${path.relative(process.cwd(), file)}`);
  return { from: "record", key, file, result: res };
}