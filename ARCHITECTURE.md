# LangGraph Cassette Architecture

## 1. Overview

LangGraph Cassette is a lightweight, file-backed recording and replay system for LangGraph / LangChain LLM nodes. It allows developers to **record once and replay forever** — dramatically reducing API costs and improving test determinism.

The package wraps LLM and tool calls, producing consistent cassette files for replay. It supports multiple modes (`auto`, `record`, `replay`, `live`), integrates with OpenAI via LangChain, includes a CLI, and provides a token logger for cost tracking.

---

## 2. Goals

* Deterministic replays of LLM & tool calls
* Plug-and-play with LangGraph / LangChain
* Configurable storage & hashing
* Seamless transition between record, replay, and live modes
* Developer-friendly debugging and CLI tools

---

## 3. Repository Layout

```
src/
  core/              # Core logic and orchestration
    index.js         # CassetteLLM class (main entry)
    common.js        # Hashing & canonicalization helpers
    errors.js        # Custom errors (CassetteReplayMissError)
    modes/           # Mode implementations
      record.js      # Record mode
      replay.js      # Replay mode
      live.js        # Live mode

  utils/             # Generic utilities
    cassette.js      # Filesystem-backed store
    toolCassette.js  # Tool recording/replay
    normalizeToolCall.js
    replayNormalize.js
    extractContent.js
    tokenLogger.js

  mocks/             # Local test mocks
    MockLLM.js

  cli/               # CLI entry
    cassette.js

examples/
  travel_agent_real_api.mjs  # Full demo (LangGraph + APIs)
```

---

## 4. Architecture Diagram

<img width="1456" height="959" alt="image" src="https://github.com/user-attachments/assets/e7b1e458-d208-4c78-bd19-3de9d0b6ccfa" />

---

## 5. Major Components

### 5.1 CassetteLLM (src/core/index.js)

* Main entry point.
* Wraps LLM and tool calls.
* Delegates to mode runners (`record`, `replay`, `live`).
* Handles tool cassette logic.

### 5.2 Mode Runners (src/core/modes/*)

* `record.js`: Executes model call, saves response.
* `replay.js`: Loads cassette, normalizes replay.
* `live.js`: Executes without recording.

### 5.3 Utilities

| File                     | Purpose                                |
| ------------------------ | -------------------------------------- |
| **cassette.js**          | File IO, sharded paths, atomic writes  |
| **toolCassette.js**      | Tool call record/replay with hash keys |
| **normalizeToolCall.js** | Normalizes OpenAI tool calls           |
| **replayNormalize.js**   | Normalizes replayed messages           |
| **extractContent.js**    | Extracts clean assistant text          |
| **tokenLogger.js**       | Tracks cost and savings                |

### 5.4 CLI

`src/cli/cassette.js` provides the following commands:

```
cassette auto   [--dir .cassettes] -- node script.mjs
cassette record [--dir .cassettes] -- node script.mjs
cassette replay [--dir .cassettes] -- node script.mjs
cassette live   [--dir .cassettes] -- node script.mjs
cassette inspect [--dir .cassettes] [--grep <text>]
```

### 5.5 MockLLM

* Lightweight mock that simulates OpenAI-like responses.
* Useful for tests and demos.

---

## 6. Data Model

### 6.1 LLM Cassette File

Path: `.cassettes/<hash[0..1]>/<hash>.json`

```json
{
  "version": 1,
  "created_at": "2025-10-25T12:34:56.789Z",
  "llm": { "provider": "openai", "model": "gpt-4o-mini", "parameters": { "temperature": 0 } },
  "key": {
    "hash": "<hash>",
    "inputs": { "messages": [...], "tools": [...], "callOptions": {...} }
  },
  "response": { /* model output */ },
  "usage": { "prompt_tokens": 120, "completion_tokens": 210, "total_tokens": 330 }
}
```

### 6.2 Tool Cassette File

Path: `.cassettes/tools/<key[0..1]>/<key>.json`

```json
{
  "flight": "DF101",
  "price_usd": 520,
  "duration": "7h 30m"
}
```

### 6.3 Index File

`.cassettes/index.json` accumulates summaries:

```json
[
  { "hash": "abcd1234", "file": "ab/abcd1234.json", "model": "gpt-4o-mini", "created_at": "...", "total_tokens": 330 }
]
```

---

## 7. Data Flow Diagrams

### 7.1 LLM Flow
<img width="1249" height="828" alt="image" src="https://github.com/user-attachments/assets/bcae8cf9-e678-4731-b803-6a8e06201f30" />


### 7.2 Tool Flow
<img width="1125" height="829" alt="image" src="https://github.com/user-attachments/assets/d1961f7d-0736-45e6-b435-43cf8245e27f" />

---

## 8. Storage Structure

```
.cassettes/
├─ index.json
├─ tools/
│  ├─ ab/
│  │  ├─ abcd1234.json
│  └─ ...
└─ 12/
   ├─ 12abc456.json
   └─ ...
```

---

## 9. Logger & CLI

* `tokenLogger.js` computes token cost/savings.
* CLI commands control `CASSETTE_MODE` and inspect stored cassettes.

---

## 10. Key Design Patterns

1. **Hash-based sharding:** ensures efficient file lookup.
2. **Atomic writes:** prevents corruption during concurrent writes.
3. **Canonicalization:** makes replays stable across SDK versions.
4. **Composable adapters:** enables new provider integrations.
5. **Replay normalization:** provides consistent outputs even when provider schemas change.

---

## 11. Extension Points

| Area                 | How to Extend                                                |
| -------------------- | ------------------------------------------------------------ |
| Storage              | Replace `saveCassette/loadCassette` with DB or cloud storage |
| Matching             | Override hashInputs to change matching strategy              |
| Logger               | Supply custom pricing model or callback hooks                |
| Tool Cassettes       | Extend `getToolResult` to support new miss policies          |
| Replay Normalization | Extend to support new LLM SDK shapes                         |

---

## 12. Operational Guidance

* **Dev:** `CASSETTE_MODE=auto` (record missing cassettes)
* **CI:** `CASSETTE_MODE=replay` (fail on miss)
* **Prod:** `CASSETTE_MODE=live`
* **Tool cassette misses:** set `CASSETTE_REPLAY_MISS=error` to fail explicitly.

---

## 13. Summary

LangGraph Cassette provides a reproducible, versioned, and modular architecture for recording and replaying LLM interactions. It isolates LLM I/O, tool execution, and file persistence while maintaining deterministic flows and developer ergonomics.

> Record once. Replay forever.
