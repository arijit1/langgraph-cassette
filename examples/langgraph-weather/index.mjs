// Build a tiny weather "agent" using CassetteLLM + simple routing/tooling.

import { config } from "dotenv";
import CassetteLLM from "langgraph-cassette";

import { createTokenLogger } from "langgraph-cassette/utils/tokenLogger.js";
import { extractAssistantText } from "langgraph-cassette/utils/extractContent.js";

config();

// ---------- LLM setup ----------
const logger = createTokenLogger();
const llm = new CassetteLLM({
  mode: process.env.CASSETTE_MODE || "auto",
  cassetteDir: process.env.CASSETTE_DIR || ".cassettes",
  modelOptions: { model: "gpt-4o-mini", temperature: 0 },
  logger,
  verbose: Boolean(process.env.CASSETTE_VERBOSE),
});

// ---------- Helpers ----------
function toISODate(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

async function geocodeCity(name) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "1");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
  const data = await res.json();
  if (!data.results?.length) throw new Error(`City not found: ${name}`);
  const c = data.results[0];
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    city: c.name,
    country: c.country,
    timezone: c.timezone,
  };
}

async function fetchWeather({ city, dateISO, units = "C" }) {
  const loc = await geocodeCity(city);

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(loc.latitude));
  url.searchParams.set("longitude", String(loc.longitude));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("daily", [
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "weathercode",
  ].join(","));
  url.searchParams.set("temperature_unit", units.toUpperCase() === "F" ? "fahrenheit" : "celsius");
  url.searchParams.set("start_date", dateISO);
  url.searchParams.set("end_date", dateISO);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Forecast failed: ${res.status}`);
  const data = await res.json();

  const i = 0; // single-day request (start=end)
  return {
    location: loc,
    dateISO,
    units: units.toUpperCase() === "F" ? "F" : "C",
    tMax: data.daily?.temperature_2m_max?.[i],
    tMin: data.daily?.temperature_2m_min?.[i],
    precipitation: data.daily?.precipitation_sum?.[i],
    weathercode: data.daily?.weathercode?.[i],
  };
}

// Basic WMO weather code mapping (compact)
const WEATHER_CODES = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ slight hail",
  99: "Thunderstorm w/ heavy hail",
};

// ---------- Agent nodes ----------

// 1) Router / parser: turn a user question into a structured query (JSON).
async function parseQueryNode(state) {
  const messages = [
    {
      role: "system",
      content:
        "You extract weather intents. Reply with ONLY valid JSON {intent:'weather'|'chitchat', city?:string, dateISO?:string, units?:'C'|'F'}.\n" +
        "If the user asks about weather anywhere/time, set intent='weather' and infer missing fields:\n" +
        "- city: best guess from question; if none, use 'San Francisco'\n" +
        "- dateISO: ISO date YYYY-MM-DD; if missing, use today's date\n" +
        "- units: 'C' (default) or 'F' if user says Fahrenheit/imperial",
    },
    { role: "user", content: state.question },
  ];
  const ai = await llm.invoke(messages);
  const text = extractAssistantText(ai);

  // robust JSON parse
  const jsonStr = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    parsed = { intent: "chitchat" };
  }

  const dateISO = parsed.dateISO || toISODate();
  return { ...state, parsed: { ...parsed, dateISO } };
}

// 2) Weather tool node: call Open-Meteo with parsed query.
async function weatherToolNode(state) {
  const { parsed } = state;
  const units = parsed.units || "C";
  const result = await fetchWeather({
    city: parsed.city,
    dateISO: parsed.dateISO,
    units,
  });
  return { ...state, weather: result };
}

// 3) Answer node: let LLM compose a nice reply with the tool result.
async function answerNode(state) {
  if (state.parsed?.intent !== "weather" || !state.weather) {
    // fallback: just answer like a normal LLM
    const ai = await llm.invoke([
      { role: "system", content: "You are helpful." },
      { role: "user", content: state.question },
    ]);
    return { ...state, answer: extractAssistantText(ai) };
  }

  const w = state.weather;
  const summary =
    (w.weathercode in WEATHER_CODES ? WEATHER_CODES[w.weathercode] : "Weather") +
    (typeof w.precipitation === "number" ? `, precip ${w.precipitation} mm` : "");
  const unitsSym = w.units === "F" ? "°F" : "°C";

  const prompt = [
    { role: "system", content: "You are a concise, friendly weather assistant." },
    {
      role: "user",
      content:
        `User asked: "${state.question}"\n\n` +
        `Normalized query -> city="${w.location.city}", country="${w.location.country}", date=${w.dateISO}, units=${w.units}\n` +
        `Forecast: ${summary}; low ${w.tMin}${unitsSym}, high ${w.tMax}${unitsSym}.\n` +
        `Timezone: ${w.location.timezone}\n\n` +
        `Write a short answer (2-5 sentences). Mention the city and date. Include highs/lows. If uncertainty, say so briefly.`,
    },
  ];

  const ai = await llm.invoke(prompt);
  return { ...state, answer: extractAssistantText(ai) };
}

// ---------- Orchestrator ----------
export async function runWeatherAgent(question) {
  let state = { question };

  // 1) Parse/route
  state = await parseQueryNode(state);

  // 2) If weather intent, call the tool
  if (state.parsed?.intent === "weather" && state.parsed?.city) {
    try {
      state = await weatherToolNode(state);
    } catch (err) {
      state.toolError = String(err.message || err);
    }
  }

  // 3) Answer
  state = await answerNode(state);
  return state;
}

// ---------- Fake runs ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  // Examples you can tweak:
  const queries = [
    "Weather in Tokyo tomorrow in Fahrenheit?",
    "Will it rain in Bengaluru on Friday?",
    "How's the weather in Paris?",
    "hi there", // falls back to chitchat
  ];

  for (const q of queries) {
    const result = await runWeatherAgent(q);
    console.log("\nQ:", q);
    if (result.toolError) console.warn("TOOL ERROR:", result.toolError);
    console.log("ANSWER:", result.answer);
  }

  console.log("\nSESSION:", logger.summary());
}
