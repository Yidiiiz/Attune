// Owns: the two Open-Meteo calls this app makes (PROJECT.md §10.1, Decision 13) — forward geocoding
// for the Settings location field, and the forecast the Today header shows — plus the 30-minute
// cache in front of the second one. No key, 10,000 calls a day, CC-BY 4.0 attribution, which the
// Settings weather section carries.
//
// There is no reverse geocoding here and there will not be: Open-Meteo has no reverse endpoint, so
// a location found by browser geolocation has coordinates and the honest label "My location"
// (Decision 51). Coordinates are what this module needs; the query string is only how they were
// found.
//
// Failure behavior: every failure path returns null rather than throwing, and logs once per cache
// key so a flapping network cannot fill a terminal. The header then renders no weather element at
// all, which is the same thing it does when no location is set — one absent element, never a
// broken day.

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

/** §10.1: today plus six days, which is as far as the header will ever be asked about. */
export const FORECAST_DAYS = 7;

const CACHE_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 6000;

export type WeatherUnit = "fahrenheit" | "celsius";

export interface GeocodeHit {
  label: string;
  lat: number;
  lon: number;
  /** "New York, New York, United States" — what the picker shows to tell two matches apart. */
  detail: string;
}

export interface DayForecast {
  date: string;
  code: number;
  max: number | null;
  min: number | null;
}

export interface Forecast {
  current: { temp: number | null; code: number } | null;
  days: DayForecast[];
  unit: WeatherUnit;
  /** When this reading was taken, so a caller can say how stale it is. */
  fetchedAt: number;
}

export interface ForecastRequest {
  lat: number;
  lon: number;
  unit: WeatherUnit;
  timezone: string;
}

/**
 * The eight icons §10.1 asks for, keyed by WMO weather code. `unknown` is not a ninth icon — it is
 * the fallback that reuses `cloudy`, because a code this table has never heard of is still weather
 * and the honest thing is a neutral glyph rather than a blank.
 */
export type WeatherIcon = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export const ICON_GLYPH: Record<WeatherIcon, string> = {
  clear: "☀",
  partly: "⛅",
  cloudy: "☁",
  fog: "≡",
  drizzle: "☂",
  rain: "☔",
  snow: "❄",
  storm: "⚡",
};

export const ICON_LABEL: Record<WeatherIcon, string> = {
  clear: "Clear",
  partly: "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  snow: "Snow",
  storm: "Thunderstorm",
};

/** WMO 4677 as Open-Meteo publishes it, collapsed to the eight buckets a header can show. */
export function iconFor(code: number): WeatherIcon {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95 && code <= 99) return "storm";
  return "cloudy";
}

/** The cache key §10.1 names: one reading per place per unit. */
export function cacheKey(request: ForecastRequest): string {
  return `${request.lat.toFixed(4)},${request.lon.toFixed(4)},${request.unit}`;
}

/** The day in a forecast for `date`, or null when it is outside the window we asked for. */
export function forecastFor(forecast: Forecast, date: string): DayForecast | null {
  return forecast.days.find((day) => day.date === date) ?? null;
}

const cache = new Map<string, { at: number; value: Forecast }>();
const logged = new Set<string>();

/** Log a failing endpoint once per key. A network that is down is down; it is not news twice. */
function logOnce(key: string, message: string): void {
  if (logged.has(key)) return;
  logged.add(key);
  console.error(`weather: ${message}`);
}

async function getJson(url: string, logKey: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      logOnce(logKey, `${url.split("?")[0]} answered ${response.status}; weather is hidden`);
      return null;
    }
    logged.delete(logKey); // it worked, so the next failure is worth saying again
    return (await response.json()) as Record<string, unknown>;
  } catch (err) {
    logOnce(logKey, `${url.split("?")[0]} failed (${(err as Error).message}); weather is hidden`);
    return null;
  }
}

/** Forward geocode a place name. Null when nothing matched or the service could not be reached. */
export async function geocode(query: string, count = 5): Promise<GeocodeHit[]> {
  const trimmed = query.trim();
  if (trimmed === "") return [];

  const url = `${GEOCODE_URL}?name=${encodeURIComponent(trimmed)}&count=${count}&language=en&format=json`;
  const data = await getJson(url, "geocode");
  const results = Array.isArray(data?.results) ? (data.results as Record<string, unknown>[]) : [];

  return results.flatMap((hit) => {
    const lat = Number(hit.latitude);
    const lon = Number(hit.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const parts = [hit.name, hit.admin1, hit.country].filter((part) => typeof part === "string" && part !== "");
    return [{ label: String(hit.name ?? trimmed), lat, lon, detail: parts.join(", ") }];
  });
}

/** The forecast for a place, from the cache when it is under half an hour old. */
export async function getForecast(request: ForecastRequest): Promise<Forecast | null> {
  const key = cacheKey(request);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const url =
    `${FORECAST_URL}?latitude=${request.lat}&longitude=${request.lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&current=temperature_2m,weather_code` +
    `&timezone=${encodeURIComponent(request.timezone)}` +
    `&temperature_unit=${request.unit}&forecast_days=${FORECAST_DAYS}`;

  const data = await getJson(url, key);
  if (!data) return hit?.value ?? null; // a stale reading beats no reading at all

  const daily = (data.daily ?? {}) as Record<string, unknown[]>;
  const dates = Array.isArray(daily.time) ? daily.time : [];
  const codes = Array.isArray(daily.weather_code) ? daily.weather_code : [];
  const highs = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
  const lows = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];

  const current = (data.current ?? null) as Record<string, unknown> | null;
  const value: Forecast = {
    current: current
      ? { temp: numberOrNull(current.temperature_2m), code: Number(current.weather_code ?? 3) }
      : null,
    days: dates.map((date, index) => ({
      date: String(date),
      code: Number(codes[index] ?? 3),
      max: numberOrNull(highs[index]),
      min: numberOrNull(lows[index]),
    })),
    unit: request.unit,
    fetchedAt: Date.now(),
  };

  cache.set(key, { at: Date.now(), value });
  return value;
}

function numberOrNull(value: unknown): number | null {
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : null;
}

/** Drop every cached reading. Used by tests, and by a settings change that moves the location. */
export function clearWeatherCache(): void {
  cache.clear();
  logged.clear();
}
