#!/usr/bin/env node
// src/cli/cassette.js
// Simple runner that injects CASSETTE_* env vars, plus a basic "inspect" command.

import fs from "node:fs/promises";
import path from "node:path";

const [, , cmd, ...rest] = process.argv;

async function runSpawn(mode) {
  const idx = rest.indexOf("--");
  if (idx === -1) {
    console.error("Usage: cassette <auto|record|replay|live> [--dir <path>] -- node yourscript.mjs");
    process.exit(1);
  }
  const args = rest.slice(0, idx);
  const child = rest.slice(idx + 1);
  const dirFlag = args.findIndex(a => a === "--dir");
  const dir = dirFlag >= 0 ? args[dirFlag + 1] : undefined;

  const env = { ...process.env, CASSETTE_MODE: mode };
  if (dir) env.CASSETTE_DIR = dir;

  const { spawn } = await import("node:child_process");
  const p = spawn(child[0], child.slice(1), { stdio: "inherit", env });
  p.on("exit", (code) => process.exit(code ?? 0));
}

async function inspect() {
  const dirFlag = rest.findIndex(a => a === "--dir");
  const dir = dirFlag >= 0 ? rest[dirFlag + 1] : (process.env.CASSETTE_DIR || ".cassettes");
  const indexPath = path.join(dir, "index.json");
  try {
    const buf = await fs.readFile(indexPath, "utf8");
    const arr = JSON.parse(buf);
    const total = arr.length;
    const tokens = arr.reduce((acc, x) => acc + (x.total_tokens || 0), 0);
    console.log(`Cassettes: ${total}`);
    console.log(`Approx tokens: ${tokens}`);
    const grepFlag = rest.findIndex(a => a === "--grep");
    const grep = grepFlag >= 0 ? rest[grepFlag + 1] : null;
    const rows = grep ? arr.filter(x => (x.model || "").includes(grep) || (x.hash || "").includes(grep)) : arr;
    rows.slice(0, 50).forEach((x) => {
      console.log(`- ${x.model || "model"}  ${x.hash?.slice(0,8)}  ${x.file}`);
    });
  } catch (err) {
    console.error(`inspect: no index at ${indexPath} or invalid.`, err?.message || "");
    process.exit(2);
  }
}

(async () => {
  if (["auto","record","replay","live"].includes(cmd)) return runSpawn(cmd);
  if (cmd === "inspect") return inspect();
  console.log(`Usage:
  cassette auto   [--dir .cassettes] -- node script.mjs
  cassette record [--dir .cassettes] -- node script.mjs
  cassette replay [--dir .cassettes] -- node script.mjs
  cassette live   [--dir .cassettes] -- node script.mjs
  cassette inspect [--dir .cassettes] [--grep <text>]`);
})();
