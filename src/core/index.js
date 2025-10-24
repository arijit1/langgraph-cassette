// src/core/index.js
import path from "node:path";
import { fileURLToPath } from "node:url";

import { hashInputs, _debugHashParts } from "./common.js";
import { runRecord } from "./modes/record.js";
import { runReplay } from "./modes/replay.js";
import { runLive } from "./modes/live.js";

import { getToolResult } from "../utils/toolCassette.js";
import { getToolName, getToolArgs } from "../utils/normalizeToolCall.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default class CassetteLLM {
  constructor(opts = {}) {

    console.log('LangGraph Cassette Initiated');
    console.log('\x1b[36m╭────────────────────────────╮\x1b[0m');
    console.log('\x1b[36m│  ▒▒  LangGraph Cassette  ▒▒│\x1b[0m');
    console.log('\x1b[36m│  ▒  Record once. Replay  ▒ │\x1b[0m');
    console.log('\x1b[36m│  ▒      forever.         ▒ │\x1b[0m');
    console.log('\x1b[36m╰────────────────────────────╯\x1b[0m');

    
    this.mode = (opts.mode || process.env.CASSETTE_MODE || "auto").toLowerCase();
    const baseDir = opts.cassetteDir || process.env.CASSETTE_DIR || ".cassettes";
    this.cassetteDir = path.resolve(baseDir);
    this.modelOptions = opts.modelOptions || { model: "gpt-4o-mini", temperature: 0 };
    this.logger = opts.logger;
    this.verbose = Boolean(opts.verbose || process.env.CASSETTE_VERBOSE);

    // Tool cassette settings
    this.toolCassette = (opts.toolCassette || process.env.CASSETTE_TOOL_MODE || this.mode || "auto").toLowerCase();
    const toolDir = opts.toolCassetteDir || process.env.CASSETTE_TOOL_DIR || path.join(this.cassetteDir, "tools");
    this.toolCassetteDir = path.resolve(toolDir);
    this.onToolReplayMiss = (opts.onToolReplayMiss || process.env.CASSETTE_REPLAY_MISS || "live").toLowerCase();

    this.redact = typeof opts.redact === "function" ? opts.redact : null;

    this._tools = [];          // schemas exposed to the model
    this._toolHandlers = {};   // execution handlers keyed by name
    this._baseModel = null;

    if (this.verbose) {
      console.log(`[Cassette] cwd=${process.cwd()}`);
      console.log(`[Cassette] cassetteDir=${this.cassetteDir}`);
      console.log(`[Cassette] toolCassetteDir=${this.toolCassetteDir}`);
      console.log(`[Cassette] mode=${this.mode} toolMode=${this.toolCassette}`);
    }
  }

  async _createRealModelIfNeeded() {
    if (this._baseModel) return this._baseModel;
    // Lazy import to avoid pulling deps if not used in replay/mock modes
    const { ChatOpenAI } = await import("@langchain/openai");
    this._baseModel = new ChatOpenAI(this.modelOptions);
    if (this._tools?.length && this._baseModel.bindTools) {
      await this._baseModel.bindTools(this._tools);
    }
    return this._baseModel;
  }

  async bindTools(schemas = [], handlers = {}) {
    this._tools = Array.isArray(schemas) ? schemas : [];
    this._toolHandlers = handlers || {};
    if (this._baseModel?.bindTools) await this._baseModel.bindTools(this._tools);
    return this;
  }

  async invoke(messages, callOptions = {}) {
    const modelId = this.modelOptions?.model || "unknown-model";
    const key = hashInputs({
      model: modelId,
      messages,
      tools: this._tools || [],
      callOptions,
    });

    if (this.verbose) {
      const parts = _debugHashParts({ model: modelId, messages, tools: this._tools || [], callOptions });
      console.log("[Cassette] hash.parts", JSON.stringify(parts, null, 2));
      console.log("[Cassette] key", key);
    }

    // Try replay first in auto/replay
    if (this.mode === "replay" || this.mode === "auto") {
      const { aiMessage, hit, fellBackTo } = await runReplay(this, { messages, callOptions, key, modelId });
      if (hit) return aiMessage;
      if (fellBackTo) return aiMessage; // live/mock fallback already handled logging
    }

    // Record (or auto miss) → call real model and save
    if (this.mode === "record" || this.mode === "auto") {
      return await runRecord(this, { messages, callOptions, key, modelId });
    }

    // Live: call without saving
    if (this.mode === "live") {
      return await runLive(this, { messages, callOptions, key, modelId });
    }

    throw new Error(`Unknown CASSETTE_MODE=${this.mode}`);
  }

  /**
   * Execute tool calls with built-in cassette.
   * Returns [{ tool, args, result }] in the same order as toolCalls.
   */
  async executeTools(toolCalls = [], ctx = {}) {
    const out = [];
    for (const tc of toolCalls || []) {
      const name = getToolName(tc);
      const args = getToolArgs(tc);
      const handler = this._toolHandlers[name];
      if (!handler) {
        out.push({ tool: name || "unknown", error: "No handler registered" });
        continue;
      }
      const { result } = await getToolResult({
        dir: this.toolCassetteDir,
        mode: this.toolCassette,
        onMiss: this.onToolReplayMiss,
        name,
        args,
        exec: () => handler(args, ctx),
        verbose: this.verbose,
      });
      out.push({ tool: name, args, result });
    }
    return out;
  }

  /**
   * One-liner: invoke LLM, execute tools (with cassette), loop up to maxHops.
   * Returns { ai, toolResults } where ai is the final assistant message.
   */
  async invokeWithTools(messages, { maxHops = 1, ctx } = {}) {
    let ai = await this.invoke(messages);
    let allResults = [];

    for (let hop = 0; hop < maxHops; hop++) {
      const calls = Array.isArray(ai.tool_calls) ? ai.tool_calls : [];
      if (!calls.length) break;

      const results = await this.executeTools(calls, ctx);
      allResults = allResults.concat(results);

      // Append tool results as tool messages
      const toolMsgs = results.map((r) => ({
        role: "tool",
        // attempt to wire back by name; ids differ across SDKs, so optional
        content: JSON.stringify(r.result),
      }));

      // Continue conversation
      ai = await this.invoke([...messages, { role: "assistant", content: "", tool_calls: calls }, ...toolMsgs]);
    }

    return { ai, toolResults: allResults };
  }
}
