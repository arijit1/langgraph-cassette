// examples/langchain.mjs
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

const messages = [
  { role: "system", content: "You are concise." },
  { role: "user", content: "Say hi in 3 words." }
];

const res = await llm.invoke(messages);

// ✅ Always shows something meaningful across record/replay/live/auto
const text = JSON.parse(extractAssistantText(res));
const hasTools = (res.tool_calls || []).length > 0;
console.log("ASSISTANT:", text.kwargs.content);

console.log("SESSION:", logger.summary());
