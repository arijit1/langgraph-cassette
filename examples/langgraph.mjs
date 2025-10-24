// examples/langgraph.mjs
// This is a placeholder to show how you'd wrap an LLM node in LangGraph.
import { config } from "dotenv";

import CassetteLLM from "../src/core/index.js";
import { createTokenLogger } from "../src/utils/tokenLogger.js";
import { extractAssistantText } from "../src/utils/extractContent.js";


config();

const logger = createTokenLogger();
const llm = new CassetteLLM({
  mode: process.env.CASSETTE_MODE || "auto",
  cassetteDir: process.env.CASSETTE_DIR || ".cassettes",
  modelOptions: { model: "gpt-4o-mini", temperature: 0 },
  logger,
  verbose: Boolean(process.env.CASSETTE_VERBOSE)
});

async function llmNode(state) {
  const messages = [
    { role: "system", content: "You are helpful." },
    { role: "user", content: state.question }
  ];
  const ai = await llm.invoke(messages);
  return { ...state, answer: extractAssistantText(ai) };
}

// fake run
const result = await llmNode({ question: "Capital of France?" });
console.log("ANSWER:", result.answer);
console.log("SESSION:", logger.summary());
