// ─────────────────────────────────────────────────────────────────────────────
// src/tools/graph.js  (LangGraph wiring)
// ─────────────────────────────────────────────────────────────────────────────
import { START, END, StateGraph } from '@langchain/langgraph';
import { getWeather, parseCity } from './weather.mjs';

export function buildGraph() {
  const builder = new StateGraph({
    channels: { question: null, city: null, weather: null, answer: null },
  });

  builder.addNode('parse', async (state) => {
    const city = state.city || parseCity(state.question || '');
    if (!city) throw new Error("Couldn't detect a city. Try 'weather in Bengaluru'.");
    return { ...state, city };
  });

  builder.addNode('fetch', async (state) => {
    const weather = await getWeather(state.city);
    return { ...state, weather };
  });

  builder.addNode('answer', async (state) => {
    const w = state.weather;
    const answer = `Right now in ${state.city}: ${w.tempC}°C (${w.tempF}°F), ${w.description}. Humidity ${w.humidity}%, wind ${w.windKph} km/h.`;
    return { ...state, answer };
  });

  builder.addEdge(START, 'parse');
  builder.addEdge('parse', 'fetch');
  builder.addEdge('fetch', 'answer');
  builder.addEdge('answer', END);

  return builder.compile();
}