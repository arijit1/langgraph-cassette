// src/core/index.js
import { ChatOpenAI } from "@langchain/openai";
import {
  hashInputs,
  getEnvMode,
  getEnvDir,
  getEnvOnReplayMiss,   // 👈 import it here
} from "./common.js";
import { runLive } from "./modes/live.js";
import { runRecord } from "./modes/record.js";
import { runReplay } from "./modes/replay.js";
import { shardPath } from "../utils/cassette.js";

export class CassetteLLM {
  constructor(opts = {}) {
    this.mode = opts.mode || getEnvMode("auto");
    this.cassetteDir = opts.cassetteDir || getEnvDir(".cassettes");
    this.modelOptions = opts.modelOptions || {};
    this.logger = opts.logger || { onCall() {}, summary() { return null; } };
    this.redact = opts.redact;
    this.verbose = Boolean(opts.verbose || process.env.CASSETTE_VERBOSE);
    this.onReplayMiss =
      typeof opts.onReplayMiss === "undefined"
        ? getEnvOnReplayMiss("error")   // 👈 use it here
        : opts.onReplayMiss;

    this._tools = [];
    this._model = null;
  }

  async _createRealModelIfNeeded() {
    if (!this._model) {
      const m = new ChatOpenAI(this.modelOptions);
      if (typeof m.bindTools === "function" && this._tools?.length) {
        this._model = m.bindTools(this._tools) || m;
      } else {
        this._model = m;
      }
    }
    return this._model;
  }

  async bindTools(tools) {
    this._tools = tools || [];
    return this;
  }

  async invoke(messages, callOptions = {}) {
    const modelId = this.modelOptions?.model || "unknown-model";
    const key = hashInputs({ messages, model: modelId, tools: this._tools, callOptions });

    if (this.verbose) {
      const cassettePath = shardPath(this.cassetteDir, key);
      console.log(`[Cassette] mode=${this.mode} model=${modelId} key=${key.slice(0,12)} dir=${this.cassetteDir}`);
      console.log(`[Cassette] cassettePath=${cassettePath}`);
    }

    if (this.mode === "replay" || this.mode === "auto") {
      const { aiMessage, hit, fellBackTo } = await runReplay(this, { messages, callOptions, key, modelId });
      if (hit) return aiMessage;
      if (this.mode === "auto" && !hit && !fellBackTo) {
        return await runRecord(this, { messages, callOptions, key, modelId });
      }
      if (!hit && fellBackTo) return aiMessage;
      return aiMessage; // unreachable if error thrown inside replay
    }

    if (this.mode === "live") {
      return await runLive(this, { messages, callOptions, key, modelId });
    }

    return await runRecord(this, { messages, callOptions, key, modelId });
  }
}

export default CassetteLLM;
