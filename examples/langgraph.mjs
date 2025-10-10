// examples/langgraph.mjs
// This is a placeholder to show how you'd wrap an LLM node in LangGraph.
import { config } from "dotenv";
import DevLLM from "../src/core/index.js";
import { createTokenLogger } from "../src/utils/tokenLogger.js";

config();

const logger = createTokenLogger();

const dev = new DevLLM({
  mode: process.env.CASSETTE_MODE || "auto",
  cassetteDir: process.env.CASSETTE_DIR || ".cassettes",
  modelOptions: { model: "gpt-4o-mini", temperature: 0 },
  logger
});

// hypothetical "node" function that uses a chat model
async function llmNode(state) {
  const messages = [
    { role: "system", content: "You are helpful." },
    { role: "user", content: state.question }
  ];
  const ai = await dev.invoke(messages);
  return { ...state, answer: ai.content };
}

// fake run
const result = await llmNode({ question: "Capital of France?" });
console.log(result);
console.log("SESSION:", logger.summary());
