# LangGraph Cassette — API Reference

> Code-accurate reference for all exported classes/functions across the repository you shared. Organized by file with signatures, parameters, return values, side‑effects, usage notes, and examples.

---

## Table of Contents

* [src/core/index.js](#srccoreindexjs)
* [src/core/common.js](#srccorecommonjs)
* [src/core/errors.js](#srccoreerrorsjs)
* [src/core/modes/replay.js](#srccoremodesreplayjs)
* [src/core/modes/record.js](#srccoremodesrecordjs)
* [src/core/modes/live.js](#srccoremodeslivejs)
* [src/utils/cassette.js](#srcutilscassettejs)
* [src/utils/toolCassette.js](#srcutilstoolcassettejs)
* [src/utils/normalizeToolCall.js](#srcutilsnormalizetoolcalljs)
* [src/utils/replayNormalize.js](#srcutilsreplaynormalizejs)
* [src/utils/extractContent.js](#srcutilsextractcontentjs)
* [src/utils/tokenLogger.js](#srcutilstokenloggerjs)
* [src/mocks/MockLLM.js](#srcmocksmockllmjs)
* [src/cli/cassette.js](#srcclicassettejs)

---

## src/core/index.js

### `class CassetteLLM`

Cassette-aware orchestrator for LLM calls and tool execution.

#### **constructor**`(opts = {})`

**Options**

* `mode: "auto" | "record" | "replay" | "live"` — default: env `CASSETTE_MODE` or `"auto"`.
* `cassetteDir: string` — directory for LLM cassettes. Default: env `CASSETTE_DIR` or `.cassettes`.
* `modelOptions: object` — passed to `@langchain/openai` `ChatOpenAI` (e.g., `{ model: "gpt-4o-mini", temperature: 0 }`).
* `logger: ReturnType<createTokenLogger>` — optional token/cost logger.
* `verbose: boolean` — enable debug logging (or set env `CASSETTE_VERBOSE`).
* **Tool cassette options**

  * `toolCassette: "auto" | "record" | "replay" | "live" | "off"` — default: same as `mode` or env `CASSETTE_TOOL_MODE`.
  * `toolCassetteDir: string` — directory for tool cassette files; default: `<cassetteDir>/tools` or env `CASSETTE_TOOL_DIR`.
  * `onToolReplayMiss: "live" | "mock" | "error"` — policy when `toolCassette === "replay"` and a key is missing. Default: env `CASSETTE_REPLAY_MISS` or `"live"`.
* `redact?: (cassetteJson: any) => any` — optional hook to scrub data before saving.

**Side‑effects**: prints an ASCII banner on construction; logs config when `verbose`.

---

#### **async bindTools**`(schemas: Array<object> = [], handlers: Record<string,Function> = {}) : Promise<this>`

Registers tool schemas (exposed to provider in live/record) and handler functions used during execution.

**Parameters**

* `schemas` — OpenAI function tool schemas (e.g., `{ type: "function", function: { name, parameters } }`).
* `handlers` — map of tool name → `(args, ctx) => any | Promise<any>`.

**Returns**

* the CassetteLLM instance for chaining.

**Notes**

* If a real model has already been created and supports `.bindTools`, schemas are forwarded immediately.

---

#### **async invoke**`(messages: Array<any>, callOptions: object = {}) : Promise<{ role: "assistant", content: string, tool_calls?: Array<any> }>`

Cassette-aware LLM invocation.

**Behavior**

1. Computes a stable key via `hashInputs({ model, messages, tools, callOptions })`.
2. Mode routing:

   * `"replay"` or `"auto"` → `runReplay(...)`. On hit, returns normalized assistant message.
   * `"record"`/`"auto"` (miss) → `runRecord(...)` to call provider and save.
   * `"live"` → `runLive(...)` to call provider without saving.

**Returns**

* Normalized assistant message shaped for OpenAI-style consumption.

---

#### **async executeTools**`(toolCalls: Array<any> = [], ctx: any = {}) : Promise<Array<{ tool: string, args: object, result: any }>>`

Executes tool calls with cassette semantics.

**Behavior**

* For each call, extracts `{ name, args }` using `getToolName()`/`getToolArgs()`.
* Delegates to `getToolResult({ dir, mode, onMiss, name, args, exec, verbose })`.

**Returns**

* An array with one element per input call: `{ tool, args, result }`.

---

#### **async invokeWithTools**`(messages: Array<any>, opts?: { maxHops?: number, ctx?: any }) : Promise<{ ai: any, toolResults: Array<any> }>`

Single-call convenience for LLM → tools → LLM loops.

**Parameters**

* `messages` — initial conversation messages.
* `opts.maxHops` — number of tool→LLM cycles (default `1`).
* `opts.ctx` — optional context passed to tool handlers.

**Returns**

* `{ ai, toolResults }` where `ai` is the final assistant message and `toolResults` is a concatenation of all tool batches.

---

#### **async _createRealModelIfNeeded**`() : Promise<any>`

Internal. Lazily imports `@langchain/openai`, creates `new ChatOpenAI(this.modelOptions)`, and binds tools if available.

---

## src/core/common.js

### `hashInputs({ model, messages, tools, callOptions }) : string`

Builds a deterministic `sha256` hex digest over a canonical representation of inputs.

**Canonicalization rules**

* `canonicalizeMessages(messages)` → `[{ role, content:string }]` (LC/OpenAI tolerant).
* `canonicalizeTools(tools)` → `[{ name, parameters: deepSorted }]` (sorted by name).
* `canonicalizeCallOptions(callOptions)` → prune `undefined`, deep-sort.

---

### `_debugHashParts({ model, messages, tools, callOptions }) : object`

Returns the exact canonical object used in `hashInputs` for debugging.

---

### `extractUsage(resp) : { prompt_tokens: number, completion_tokens: number, total_tokens: number }`

Best-effort token usage extraction supporting multiple SDKs (OpenAI via LangChain, etc.).

---

### `normalizeMessages(messages = []) : Array<{ role: string, content: string }>`

Flattens LC messages to OpenAI-like simple format.

---

### *(internal helpers)*

* `deepSort(obj)` — recursively sorts object keys; maps arrays.
* `contentToString(content)` — extracts text from strings/parts/objects.
* `canonicalizeMessages`, `canonicalizeTools`, `canonicalizeCallOptions` — see rules above.

---

## src/core/errors.js

### `class CassetteReplayMissError extends Error`

Error thrown when a cassette is missing in `replay` mode.

**constructor**`({ key, cassettePath, cassetteDir, mode, hint })`

* Sets a detailed message and stores the parameters on the instance.

**Properties**

* `name = "CassetteReplayMissError"`
* `key: string`
* `cassettePath: string`
* `cassetteDir: string`
* `mode: string`

---

## src/core/modes/replay.js

### `runReplay(ctx: CassetteLLM, { messages, callOptions, key, modelId }): Promise<{ aiMessage: any, hit: boolean, fellBackTo?: "live" | "record" }>`

Attempts to read a cassette and normalize it for return.

**Parameters**

* `ctx` — the `CassetteLLM` instance.
* `messages`, `callOptions` — original inputs (unused for hashing here, provided for parity).
* `key` — precomputed input hash.
* `modelId` — the model name id (used in logging).

**Behavior**

* Loads sharded file via `loadCassette(ctx.cassetteDir, key)`.
* On **hit**: `normalizeReplayResponse(cassette.response)`; log via `ctx.logger?.onCall({ mode:"replay", usage:cassette.usage, model, key })`.
* On **miss**: in strict `replay` mode, throws `CassetteReplayMissError`; in `auto`, may fall back to live/record behavior.

**Returns**

* `{ aiMessage, hit: true }` on hit.
* If an `auto` fallback is performed by the runner, `{ aiMessage, hit: false, fellBackTo: "live" | "record" }`.

---

## src/core/modes/record.js

### `runRecord(ctx: CassetteLLM, { messages, callOptions, key, modelId }): Promise<any>`

Calls the provider, saves the cassette, returns the assistant message.

**Behavior**

* Creates provider via `ctx._createRealModelIfNeeded()`.
* Invokes model; extracts `usage` via `extractUsage`.
* Builds a cassette JSON object (model metadata, inputs, response, usage), applies `ctx.redact` if provided.
* Saves via `saveCassette(ctx.cassetteDir, key, cassette)` and appends `index.json` via `appendIndex`.
* Logs `logger.onCall({ mode:"record", ... })`.

**Returns**

* The provider’s assistant message (OpenAI/LC message shape).

---

## src/core/modes/live.js

### `runLive(ctx: CassetteLLM, { messages, callOptions, key, modelId }): Promise<any>`

Calls the provider without saving.

**Behavior**

* Creates provider via `ctx._createRealModelIfNeeded()`.
* Returns the provider’s assistant message; logs with `mode:"live"`.

---

## src/utils/cassette.js

### `shardPath(dir: string, hash: string) : string`

Returns `"<dir>/<hash[0..1]>/<hash>.json"`.

### `ensureDir(p: string) : Promise<void>`

Recursively creates a directory.

### `exists(p: string) : Promise<boolean>`

Resolves `true` if path is accessible; `false` otherwise.

### `loadCassette(dir: string, hash: string) : Promise<object | null>`

Reads sharded JSON; returns parsed object or `null` on ENOENT/ENOTDIR.

### `saveCassette(dir: string, hash: string, cassette: object) : Promise<string>`

Atomically writes cassette JSON, wrapping with:

```json
{ "version": 1, "created_at": "<ISO>", ...cassette }
```

Returns the final absolute file path.

### `appendIndex(dir: string, meta: object) : Promise<void>`

Maintains `<dir>/index.json` as an array; atomic update via temp-rename.

### `tmpDir() : string`

Returns OS tmp path for `langgraph-cassette`.

---

## src/utils/toolCassette.js

### `loadToolResult(dir: string, name: string, args: object) : Promise<{ key: string, file: string, json: any | null }>`

Loads a previously saved tool result using a stable key derived from `{ name, deepSorted(args) }`.

### `saveToolResult(dir: string, name: string, args: object, result: any) : Promise<{ key: string, file: string }>`

Saves tool result JSON to sharded path.

### `getToolResult({ dir, mode = "auto", onMiss = "live", name, args, exec, verbose = false }) : Promise<{ from: "replay" | "record" | "live" | "mock", key: string, file: string, result: any }>`

Cassette wrapper for tools.

**Modes & behavior**

* `replay`: return saved; on miss → `onMiss` policy (`error` → throw, `mock` → `{ mock: true, name, args }`, `live` → run and record).
* `off`: run `exec()` (no save).
* `auto|record|live`: run `exec()` and **save**.

---

## src/utils/normalizeToolCall.js

### `getToolName(tc: any) : string | null`

Accepts flat (`{ name }`) or wrapped (`{ function: { name } }`).

### `getToolArgs(tc: any) : object`

Parses `{ args }` (object or string JSON) or `{ function: { arguments } }`; returns `{}` on failure.

---

## src/utils/replayNormalize.js

### `normalizeReplayResponse(resp: any) : { role: "assistant", content: string, tool_calls?: Array<any> }`

Best-effort normalization of a replayed payload; supports `resp.choices[0].message`, `resp.aiMessage`, raw message objects, or stringifies as a last resort.

---

## src/utils/extractContent.js

### `extractAssistantText(msg: any) : string`

Extracts plaintext from a single assistant message across OpenAI and LangChain shapes (supports LC-serialized JSON strings, array parts, `kwargs.content`, and `additional_kwargs.message`).

---

## src/utils/tokenLogger.js

### `createTokenLogger(opts?: { pricing?: Record<string,{input:number,output:number}>, includeReplayInTotals?: boolean, includeMockInTotals?: boolean, zeroOutReplayInCalls?: boolean, zeroOutMockInCalls?: boolean }) : { onCall: Function, summary: Function }`

Creates a token/cost logger with savings accounting.

#### `onCall({ mode: "record" | "replay" | "live" | "mock", key: string, usage?: { prompt_tokens:number, completion_tokens:number, total_tokens:number }, model: string, at?: number, costUsd?: number }) : void`

Adds a call record; computes cost from pricing if not provided; sets `savedUsd/savedTokens` for replay/mock; optionally zeroes out displayed cost for replay/mock.

#### `summary() : { total: { calls:number, prompt_tokens:number, completion_tokens:number, total_tokens:number, cost_usd:number, saved_usd:number, saved_tokens:number }, calls: Array<any> }`

Aggregates totals and returns the per-call list.

---

## src/mocks/MockLLM.js

### `class MockLLM`

Simple, tool-aware mock model.

**constructor**`({ behavior = "echo" | "template", template = "Mock response: {{lastUser}}" } = {})`

* Sets behavior mode and template.

**setTools(tools: Array<any>) : void**

* Saves schemas.

**async bindTools(tools: Array<any>) : Promise<this>**

* Calls `setTools` and returns `this`.

**async invoke(messages: Array<any>) : Promise<{ role:"assistant", content:string, tool_calls?:Array<any>, response_metadata:{ tokenUsage: { promptTokens:number, completionTokens:number, totalTokens:number } } }>`

* Echoes or templates the last user message.
* If any registered tool name appears in the user message, emits an OpenAI-style `tool_calls` array and leaves `content` empty.

---

## src/cli/cassette.js

### CLI Commands

```
cassette auto   [--dir .cassettes] -- node script.mjs
cassette record [--dir .cassettes] -- node script.mjs
cassette replay [--dir .cassettes] -- node script.mjs
cassette live   [--dir .cassettes] -- node script.mjs
cassette inspect [--dir .cassettes] [--grep <text>]
```

### `async runSpawn(mode: "auto" | "record" | "replay" | "live") : Promise<void>`

* Parses args; spawns `node` with `CASSETTE_MODE=<mode>` and optional `CASSETTE_DIR`.

### `async inspect() : Promise<void>`

* Reads `<dir>/index.json` and prints count, approx tokens, and up to 50 entries (supports `--grep`).

### Main IIFE

* Delegates to `runSpawn`/`inspect` or prints usage.

---

## Usage Examples

### Minimal LLM usage

```js
import CassetteLLM from "langgraph-cassette";

const llm = new CassetteLLM({ mode: process.env.CASSETTE_MODE || "auto" });
const ai = await llm.invoke([
  { role: "system", content: "Be concise" },
  { role: "user", content: "Hello" }
]);
console.log(ai.content);
```

### With tools (and automatic recording)

```js
await llm.bindTools(
  [{ type: "function", function: { name: "get_weather", parameters: {/*...*/} } }],
  { get_weather: (args) => fetchWeather(args) }
);

const { ai, toolResults } = await llm.invokeWithTools(
  [{ role: "user", content: "Weather in Paris tomorrow?" }],
  { maxHops: 1 }
);
```

### CLI

```bash
cassette auto -- node examples/travel_agent_real_api.mjs
cassette replay -- node examples/travel_agent_real_api.mjs
cassette inspect --dir .cassettes --grep gpt-4o-mini
```