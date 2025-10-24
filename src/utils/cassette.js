// src/utils/cassette.js
// Filesystem-backed cassette store with sharded paths and atomic writes.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export function shardPath(dir, hash) {
  const a = hash.slice(0, 2);
  return path.join(dir, a, `${hash}.json`);
}

export async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

export async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function loadCassette(dir, hash) {
  const file = shardPath(dir, hash);
  try {
    const buf = await fs.readFile(file, "utf8");
    return JSON.parse(buf);
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) return null;
    throw err;
  }
}

export async function saveCassette(dir, hash, cassette) {
  const subdir = path.dirname(shardPath(dir, hash));
  await ensureDir(subdir);

  // atomic write: write temp then rename
  const tmp = path.join(subdir, `.${hash}.${process.pid}.${Date.now()}.tmp`);
  const file = shardPath(dir, hash);

  const data = JSON.stringify(
    {
      version: 1,
      created_at: new Date().toISOString(),
      ...cassette
    },
    null,
    2
  );

  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, file);
  return file;
}

/** Optional index for CLI "inspect". */
export async function appendIndex(dir, meta) {
  const indexPath = path.join(dir, "index.json");
  const idxExists = await exists(indexPath);
  let arr = [];
  if (idxExists) {
    try {
      const buf = await fs.readFile(indexPath, "utf8");
      arr = JSON.parse(buf);
      if (!Array.isArray(arr)) arr = [];
    } catch { arr = []; }
  }
  arr.push(meta);
  const tmp = path.join(dir, `.index.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(arr, null, 2), "utf8");
  await fs.rename(tmp, indexPath);
}

export function tmpDir() {
  return path.join(os.tmpdir(), "langgraph-cassette");
}
