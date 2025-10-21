// examples/travel_agent_real_api.mjs
// LangGraph Cassette demo (real APIs): flight + weather + cost synthesis.
// - Flights: TravelPayouts (freemium; requires TRAVELPAYOUTS_KEY)
// - Weather: Open-Meteo geocoding + forecast (no API key needed)
// - Deterministic fallbacks if APIs fail (keeps demo robust & cassettes recordable)
// - Uses proper OpenAI tool schemas (type:"function")

// ---------------- LangGraph import (guarded) ----------------
let StateGraph, START, END;
try {
  ({ StateGraph, START, END } = await import("@langchain/langgraph"));
} catch (e) {
  console.error("\nMissing dependency: @langchain/langgraph");
  console.error("Install it with:\n  npm i @langchain/langgraph\n");
  process.exit(1);
}

import { config } from "dotenv";
config(); // load env early (OPENAI_API_KEY, TRAVELPAYOUTS_KEY, etc.)

// ---------------- Cassette & utils ----------------
import CassetteLLM from "langgraph-cassette";
import { createTokenLogger } from "langgraph-cassette/utils/tokenLogger.js";
import { extractAssistantText } from "langgraph-cassette/utils/extractContent.js";

// ---------------- Tool schemas (OpenAI function schema) ----------------
const tools = [
  {
    type: "function",
    function: {
      name: "search_flights",
      description: "Find sample flights between two cities on a target date with rough prices (uses TravelPayouts).",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Origin IATA or city (e.g., NYC)" },
          to: { type: "string", description: "Destination IATA or city (e.g., PAR or Paris)" },
          date: { type: "string", description: "Departure date YYYY-MM-DD" },
          limit: { type: "number", description: "Max number of options to return", default: 3 }
        },
        required: ["from", "to", "date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get basic weather outlook for a city on a date (Open-Meteo).",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name (e.g., Paris)" },
          date: { type: "string", description: "YYYY-MM-DD (used for daily forecast lookup)" },
          units: { type: "string", enum: ["metric", "imperial"], default: "metric" }
        },
        required: ["city", "date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "estimate_cost",
      description: "Estimate total trip cost given a chosen flight and daily budget.",
      parameters: {
        type: "object",
        properties: {
          flight_price: { type: "number" },
          days: { type: "number" },
          daily_budget: { type: "number" }
        },
        required: ["flight_price", "days", "daily_budget"]
      }
    }
  }
];

// ---------------- Real API helpers (with safe fallbacks) ----------------

// --- tool-call normalizers (supports flat and function-wrapped shapes)
function getToolName(tc) {
  return tc?.name ?? tc?.function?.name ?? null;
}
function getToolArgs(tc) {
  if (tc?.args && typeof tc.args === "object") return tc.args;
  if (tc?.args && typeof tc.args === "string") { try { return JSON.parse(tc.args); } catch {} }
  const raw = tc?.function?.arguments;
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return {}; } }
  if (typeof raw === "object" && raw) return raw;
  return {};
}

// TravelPayouts: prices_for_dates
async function run_search_flights({ from, to, date, limit = 3 }) {
  const token = process.env.TRAVELPAYOUTS_KEY;
  if (!token) {
    // Deterministic fallback if no key present
    return deterministicFlights({ from, to, date, limit, reason: "no TRAVELPAYOUTS_KEY" });
  }
  try {
    const origin = (from || "").toUpperCase().slice(0, 3);
    const dest   = (to   || "").toUpperCase().slice(0, 3);

    const url = new URL("https://api.travelpayouts.com/aviasales/v3/prices_for_dates");
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", dest);
    url.searchParams.set("departure_at", date);
    url.searchParams.set("currency", "usd");
    url.searchParams.set("limit", String(Math.max(1, Math.min(5, limit))));
    url.searchParams.set("token", token);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`TravelPayouts HTTP ${res.status}`);
    const data = await res.json();

    const rows = Array.isArray(data?.data) ? data.data : [];
    const options = rows.slice(0, limit).map((r, i) => ({
      flight: `TP${100 + i}`,
      from: origin, to: dest,
      date: r.departure_at?.slice(0, 10) || date,
      price_usd: r.price,
      duration: `${Math.round((r.duration || 450) / 60)}h`,
      gate: r.gate || "partner",
      transfers: r.transfers ?? 0
    }));

    if (options.length === 0) {
      return deterministicFlights({ from, to, date, limit, reason: "no-results" });
    }
    return { source: "travelpayouts", options };
  } catch {
    return deterministicFlights({ from, to, date, limit, reason: "api-error" });
  }
}

// Open-Meteo geocoding + forecast (no key)
async function run_get_weather({ city, date, units = "metric" }) {
  try {
    const q = (city || "").trim();
    if (!q) throw new Error("no-city");
    // 1) geocode
    const gUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    gUrl.searchParams.set("name", q);
    gUrl.searchParams.set("count", "1");
    const gres = await fetch(gUrl);
    if (!gres.ok) throw new Error(`geocoding HTTP ${gres.status}`);
    const g = await gres.json();
    const hit = Array.isArray(g?.results) && g.results[0];
    if (!hit) throw new Error("no-geocode");
    const { latitude, longitude, name } = hit;

    // 2) forecast (daily temp + summary)
    const fUrl = new URL("https://api.open-meteo.com/v1/forecast");
    fUrl.searchParams.set("latitude", String(latitude));
    fUrl.searchParams.set("longitude", String(longitude));
    fUrl.searchParams.set("daily", "weathercode,temperature_2m_max,temperature_2m_min");
    fUrl.searchParams.set("timezone", "auto");
    fUrl.searchParams.set("start_date", date);
    fUrl.searchParams.set("end_date", date);

    const fres = await fetch(fUrl);
    if (!fres.ok) throw new Error(`forecast HTTP ${fres.status}`);
    const f = await fres.json();

    const idx = 0; // single day query
    const d = {
      date,
      t_min_c: f?.daily?.temperature_2m_min?.[idx],
      t_max_c: f?.daily?.temperature_2m_max?.[idx],
      weathercode: f?.daily?.weathercode?.[idx]
    };

    const summary = codeToSummary(d.weathercode);
    const toUnits = (c) => (units === "imperial" ? Math.round(c * 9/5 + 32) : c);
    const label = units === "imperial" ? "°F" : "°C";
    return {
      source: "open-meteo",
      city: name || city,
      date,
      summary,
      min: `${toUnits(d.t_min_c)}${label}`,
      max: `${toUnits(d.t_max_c)}${label}`
    };
  } catch {
    // deterministic fallback
    const tempC = 20 + ((city || "X").length % 4);
    const toUnits = (c) => (units === "imperial" ? Math.round(c * 9/5 + 32) : c);
    const label = units === "imperial" ? "°F" : "°C";
    return {
      source: "fallback",
      city,
      date,
      summary: "Partly cloudy (fallback)",
      min: `${toUnits(tempC - 3)}${label}`,
      max: `${toUnits(tempC + 2)}${label}`
    };
  }
}

function run_estimate_cost({ flight_price, days, daily_budget }) {
  const subtotal = (flight_price || 0) + (days || 0) * (daily_budget || 0);
  const buffer = Math.round(subtotal * 0.1);
  return { source: "local", subtotal, buffer, total_estimate: subtotal + buffer };
}

// --- helpers for deterministic fallbacks (so demo never breaks)
function deterministicFlights({ from, to, date, limit = 3, reason = "fallback" }) {
  const base = 480 + ((String(from) + String(to) + String(date)).length % 90);
  const options = Array.from({ length: Math.max(1, Math.min(5, limit)) }, (_, i) => ({
    flight: `DF${100 + i}`,
    from, to, date,
    depart: "09:30", arrive: "21:00",
    duration: "7h 30m",
    price_usd: base + i * 25,
    reason
  }));
  return { source: "deterministic", options };
}

function codeToSummary(code) {
  if (code === 0) return "Clear sky";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55].includes(code)) return "Drizzle";
  if ([61, 63, 65].includes(code)) return "Rain";
  if ([71, 73, 75].includes(code)) return "Snow";
  return "Mixed conditions";
}

// ---------------- Cassette LLM & logger ----------------
const logger = createTokenLogger();
const llm = new CassetteLLM({
  mode: process.env.CASSETTE_MODE || "auto",
  cassetteDir: process.env.CASSETTE_DIR || ".cassettes",
  modelOptions: { model: "gpt-4o-mini", temperature: 0 },
  logger,
  verbose: Boolean(process.env.CASSETTE_VERBOSE)
});

// Register tool schemas AND handlers.
// If your package includes built-in tool cassette (v1.1+), it'll use it.
// Otherwise, our toolsNode fallback (below) runs the handlers directly.
await llm.bindTools(
  tools,
  {
    search_flights: (args) => run_search_flights(args),
    get_weather: (args) => run_get_weather(args),
    estimate_cost: (args) => run_estimate_cost(args),
  }
);

// ---------------- Graph state ----------------
const initialState = {
  ask: "Plan a 2-day trip from NYC to Paris on 2025-11-10; include 2 flight options, weather that day, and keep total under $1200.",
  date: "2025-11-10",
  origin: "NYC",
  dest: "PAR",
  city: "Paris",
  constraints: { days: 2, daily_budget: 200, budget_usd: 1200 },
  messages: [],
  toolCalls: [],
  toolResults: [],
  loops: 0,
  answer: null
};

// ---------------- Nodes ----------------

// Planner asks for tools (flights + weather + maybe cost)
async function plannerNode(state) {
  const sys = { role: "system", content: "You plan trips. If asked about flights/weather/cost, request the matching tools via tool_calls." };
  const user = { role: "user", content: state.ask };
  const ai = await llm.invoke([sys, user]);
  const tool_calls = Array.isArray(ai.tool_calls) ? ai.tool_calls : [];
  const messages = [...state.messages, sys, user, ai];
  return { ...state, messages, toolCalls: tool_calls };
}

// Run tool calls — prefer package’s executeTools if available; otherwise fallback
async function toolsNode(state) {
  // Built-in (v1.1+) path:
  if (typeof llm.executeTools === "function") {
    const executed = await llm.executeTools(state.toolCalls, { state });
    return { ...state, toolResults: executed };
  }

  // Fallback path (no built-in tool cassette available):
  const results = [];
  for (const tc of state.toolCalls || []) {
    const fn = getToolName(tc);
    const args = getToolArgs(tc);
    if (fn === "search_flights") {
      const a = { ...args };
      a.from ??= state.origin; a.to ??= state.dest; a.date ??= state.date; a.limit ??= 2;
      results.push({ tool: "search_flights", result: await run_search_flights(a) });
    } else if (fn === "get_weather") {
      const a = { ...args };
      a.city ??= state.city; a.date ??= state.date; a.units ??= "metric";
      results.push({ tool: "get_weather", result: await run_get_weather(a) });
    } else if (fn === "estimate_cost") {
      results.push({ tool: "estimate_cost", result: run_estimate_cost(args) });
    } else {
      results.push({ tool: fn || "unknown", error: "Unsupported tool" });
    }
  }
  return { ...state, toolResults: results };
}

// Verify completeness; loop up to 1 extra time if missing
async function verifyNode(state) {
  const sys = {
    role: "system",
    content: "You verify trip completeness. If missing either flight options or a weather summary, respond 'MISSING:<what>'. Else 'OK'."
  };
  const ctx = { role: "system", content: JSON.stringify({ toolResults: state.toolResults }) };
  const user = { role: "user", content: "Is info sufficient to write a final 2-day plan?" };
  const ai = await llm.invoke([sys, ctx, user]);
  const verdict = (extractAssistantText(ai) || "").trim();
  return { ...state, verifyVerdict: verdict };
}

// Synthesize final answer
async function synthNode(state) {
  const flights = (state.toolResults || [])
    .filter(r => r.tool === "search_flights" && r.result?.options)
    .flatMap(r => r.result.options);
  const cheapest = flights.sort((a, b) => (a.price_usd ?? 9e9) - (b.price_usd ?? 9e9))[0];

  const cost = cheapest
    ? run_estimate_cost({ flight_price: cheapest.price_usd, days: state.constraints.days, daily_budget: state.constraints.daily_budget })
    : null;

  const sys = { role: "system", content: "You are a concise travel writer; produce a practical 2-day plan in 5–8 bullets." };
  const context = {
    flights: flights.slice(0, 2),
    weather: (state.toolResults || []).find(r => r.tool === "get_weather")?.result || null,
    cost
  };
  const ctx = { role: "system", content: `Context:\n${JSON.stringify(context, null, 2)}` };
  const user = { role: "user", content: state.ask };

  const ai = await llm.invoke([sys, ctx, user]);
  const answer = extractAssistantText(ai) || "(no content)";
  return { ...state, answer };
}

// --------------- Routing / loop control ---------------
function routeFromPlanner(state) {
  const needTools = Array.isArray(state.toolCalls) && state.toolCalls.length > 0;
  return needTools ? "tools" : "verify";
}
function routeFromVerify(state) {
  if ((state.verifyVerdict || "").startsWith("MISSING:") && state.loops < 1) return "incLoop";
  return "synth";
}
async function incLoopNode(state) { return { ...state, loops: (state.loops || 0) + 1 }; }

// --------------- Build graph ---------------
const graph = new StateGraph({
  channels: {
    ask: null, date: null, origin: null, dest: null, city: null,
    constraints: null, messages: null, toolCalls: null, toolResults: null,
    verifyVerdict: null, loops: null, answer: null
  }
});
graph.addNode("planner", plannerNode);
graph.addNode("tools", toolsNode);
graph.addNode("verify", verifyNode);
graph.addNode("incLoop", incLoopNode);
graph.addNode("synth", synthNode);

graph.addEdge(START, "planner");
graph.addConditionalEdges("planner", routeFromPlanner, { tools: "tools", verify: "verify" });
graph.addEdge("tools", "verify");
graph.addConditionalEdges("verify", routeFromVerify, { incLoop: "incLoop", synth: "synth" });
graph.addEdge("incLoop", "planner");
graph.addEdge("synth", END);

const app = graph.compile();

// --------------- Run ---------------
const final = await app.invoke(initialState);

// --------------- Output ---------------
console.log("\n=== Travel Agent (real APIs + Cassette) ===");
console.log("ASK     :", initialState.ask);
console.log("DATE    :", initialState.date);
console.log("ANSWER  :", final.answer);        // ✅ print the answer text
console.log("LOOPS   :", final.loops);
console.log("\nSESSION :", logger.summary());
console.log("==========================================\n");
