// examples/langchain.mjs
import { config } from "dotenv";
import { ChatOpenAI } from "@langchain/openai"; // just to show parity
import CassetteLLM from "../src/core/index.js";
import { createTokenLogger } from "../src/utils/tokenLogger.js";

config();

const logger = createTokenLogger({
  includeReplayInTotals: false, // spend totals exclude replays
  zeroOutReplayInCalls: true    // per-call cost shows 0 for replays
});

const dev = new CassetteLLM({
  // Try: DEVKIT_MODE=auto DEVKIT_DIR=.cassettes node examples/langchain.mjs
  mode: process.env.CASSETTE_MODE || "auto",
  cassetteDir: process.env.CASSETTE_DIR || ".cassettes",
  modelOptions: { model: "gpt-4o-mini", temperature: 0 },
  logger
});

const messages = [
  { role: "system", content: "You are concise." },
  { role: "user", content: "Say hi in 3 words." }
];

const res = await dev.invoke(messages);
console.log("ASSISTANT:", res.content || (res.tool_calls?.length ? "(tool_calls)" : ""));
console.log("SESSION:", logger.summary());
