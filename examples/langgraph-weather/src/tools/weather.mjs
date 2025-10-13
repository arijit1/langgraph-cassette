// ─────────────────────────────────────────────────────────────────────────────
// src/tools/weather.js  (OpenWeatherMap tool using cassette-aware fetch)
// ─────────────────────────────────────────────────────────────────────────────
import { cassetteFetch } from './cassette.js';

export async function getWeather(city) {
  const key = process.env.OPENWEATHERMAP_API_KEY;
  if (!key) throw new Error('Missing OPENWEATHERMAP_API_KEY');
  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('q', city);
  url.searchParams.set('appid', key);
  url.searchParams.set('units', 'metric');

  const res = await cassetteFetch(url.toString());
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  const json = await res.json();
  const tempC = json.main.temp;
  return {
    city,
    tempC,
    tempF: Math.round((tempC * 9) / 5 + 32),
    description: json.weather?.[0]?.description ?? '',
    humidity: json.main.humidity,
    windKph: Math.round((json.wind.speed ?? 0) * 3.6),
  };
}

export function parseCity(question) {
  const inMatch = question.match(/\bin\s+([A-Za-z][A-Za-z\s\-]{1,40})/i);
  if (inMatch) return inMatch[1].trim();
  const cap = question.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})$/);
  return cap?.[1];
}