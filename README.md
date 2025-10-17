# 🎞️ LangGraph Cassette

> Record once. Replay forever.  
> Build and debug LangGraph / LangChain agents **without burning tokens**.

---

## 🚀 Why

Calling real LLMs for every test or iteration is **slow** and **expensive**.  
**LangGraph Cassette** lets you:

- Record real API responses once
- Re-run them offline, deterministically
- Inspect token usage and costs per call

---

## ✨ Features

- 🔄 **Record → Replay** OpenAI (or any LangChain model) calls
- 💾 **JSON cassettes** for easy diffing and version control
- 💰 **Token & Cost logger**
- 🧩 **Mock LLM** for offline prototyping
- ⚙️ **Modes:** `live`, `record`, `replay`, `auto`
- 🪄 **LangGraph-first ergonomics**

---

## 📦 Installation

npm install langgraph-cassette

## Usage in code

```
import CassetteLLM from "langgraph-cassette/core/index.js";
import { createTokenLogger } from "langgraph-cassette/utils/tokenLogger.js";

const logger = createTokenLogger();
const llm = new CassetteLLM({
  mode: process.env.CASSETTE_MODE || "auto",
  cassetteDir: ".cassettes",
  modelOptions: { model: "gpt-4o-mini", temperature: 0 },
  logger,
  verbose: true,
});

const messages = [{ role: "user", content: "Explain LangGraph Cassette." }];
const ai = await llm.invoke(messages);

console.log(ai.content);
console.log("Session summary:", logger.summary());
```
<img width="673" height="436" alt="image" src="https://github.com/user-attachments/assets/310658d5-9862-49bf-bca8-1970c4ec27e3" />

## Raise Issues 
https://github.com/arijit1/langgraph-cassette/issues


### Example
## Record Once

CASSETTE_MODE=record CASSETTE_DIR=.cassettes \
node examples/langgraph.mjs

## Replay offline

CASSETTE_MODE=replay CASSETTE_DIR=.cassettes node examples/langgraph.mjs


## TERMINAL COMMANDS

CASSETTE_MODE=record CASSETTE_DIR=.cassettes node examples/langchain.mjs
# or
CASSETTE_MODE=replay CASSETTE_DIR=.cassettes node examples/langchain.mjs
# or
CASSETTE_REPLAY_MISS=mock CASSETTE_MODE=replay node examples/langchain.mjs
# or
CASSETTE_REPLAY_MISS=live CASSETTE_MODE=replay node examples/langchain.mjs
# or
CASSETTE_MODE=record CASSETTE_DIR=.cassettes node examples/langgraph.mjs
