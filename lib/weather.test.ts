// Covers the parts of the weather module that have a right answer: which WMO code becomes which of
// the eight icons, and the cache in front of the forecast call — including the case that matters
// most, where the network fails and a reading we already have is better than an empty header.
//
// `fetch` is stubbed rather than called. A test that reaches Open-Meteo would be a test of the
// weather.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ICON_GLYPH,
  ICON_LABEL,
  cacheKey,
  clearWeatherCache,
  forecastFor,
  geocode,
  getForecast,
  iconFor,
} from "./weather.ts";

const REQUEST = { lat: 40.7128, lon: -74.006, unit: "fahrenheit" as const, timezone: "America/New_York" };

const FORECAST_BODY = {
  current: { temperature_2m: 71.4, weather_code: 2 },
  daily: {
    time: ["2026-09-08", "2026-09-09"],
    weather_code: [0, 61],
    temperature_2m_max: [78.1, 66.2],
    temperature_2m_min: [61.0, 55.4],
  },
};

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearWeatherCache();
  fetchMock = vi.fn(async () => okResponse(FORECAST_BODY));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("iconFor", () => {
  it("maps each WMO band to its bucket", () => {
    expect(iconFor(0)).toBe("clear");
    expect(iconFor(1)).toBe("partly");
    expect(iconFor(2)).toBe("partly");
    expect(iconFor(3)).toBe("cloudy");
    expect(iconFor(45)).toBe("fog");
    expect(iconFor(48)).toBe("fog");
    expect(iconFor(53)).toBe("drizzle");
    expect(iconFor(63)).toBe("rain");
    expect(iconFor(81)).toBe("rain");
    expect(iconFor(73)).toBe("snow");
    expect(iconFor(86)).toBe("snow");
    expect(iconFor(95)).toBe("storm");
    expect(iconFor(99)).toBe("storm");
  });

  it("falls back to a neutral glyph for a code it has never heard of", () => {
    expect(iconFor(-1)).toBe("cloudy");
    expect(iconFor(1000)).toBe("cloudy");
  });

  it("has exactly eight icons, each with a glyph and a word", () => {
    const icons = Object.keys(ICON_GLYPH);
    expect(icons).toHaveLength(8);
    expect(Object.keys(ICON_LABEL)).toEqual(icons);
  });
});

describe("cacheKey", () => {
  it("is one reading per place per unit", () => {
    expect(cacheKey(REQUEST)).toBe("40.7128,-74.0060,fahrenheit");
    expect(cacheKey({ ...REQUEST, unit: "celsius" })).not.toBe(cacheKey(REQUEST));
    expect(cacheKey({ ...REQUEST, lat: 41 })).not.toBe(cacheKey(REQUEST));
  });

  it("ignores a difference too small to move the weather", () => {
    expect(cacheKey({ ...REQUEST, lat: 40.712801 })).toBe(cacheKey(REQUEST));
  });
});

describe("getForecast", () => {
  it("parses the current reading and the daily rows", async () => {
    const forecast = await getForecast(REQUEST);
    expect(forecast?.current).toEqual({ temp: 71.4, code: 2 });
    expect(forecast?.days).toEqual([
      { date: "2026-09-08", code: 0, max: 78.1, min: 61.0 },
      { date: "2026-09-09", code: 61, max: 66.2, min: 55.4 },
    ]);
    expect(forecast?.unit).toBe("fahrenheit");
  });

  it("asks for the fields §10.1 names", async () => {
    await getForecast(REQUEST);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("daily=weather_code,temperature_2m_max,temperature_2m_min");
    expect(url).toContain("current=temperature_2m,weather_code");
    expect(url).toContain("temperature_unit=fahrenheit");
    expect(url).toContain("latitude=40.7128");
  });

  it("serves the second call from the cache", async () => {
    await getForecast(REQUEST);
    await getForecast(REQUEST);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches again for a different unit", async () => {
    await getForecast(REQUEST);
    await getForecast({ ...REQUEST, unit: "celsius" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-fetches once the reading is older than thirty minutes", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);
    await getForecast(REQUEST);
    now.mockReturnValue(1_000_000 + 29 * 60 * 1000);
    await getForecast(REQUEST);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_000_000 + 31 * 60 * 1000);
    await getForecast(REQUEST);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a stale reading when the service goes away", async () => {
    const first = await getForecast(REQUEST);
    clearCacheAge();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    const second = await getForecast(REQUEST);
    expect(second).toEqual(first);
  });

  it("returns null when it has never succeeded", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await getForecast(REQUEST)).toBeNull();
  });

  it("logs a failure once, not once per call", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await getForecast(REQUEST);
    await getForecast(REQUEST);
    await getForecast(REQUEST);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});

/** Push the cached reading past its 30 minutes without waiting for them. */
function clearCacheAge(): void {
  const now = vi.spyOn(Date, "now");
  now.mockReturnValue(Date.now() + 31 * 60 * 1000);
}

describe("forecastFor", () => {
  it("finds the day being viewed, and says nothing about one outside the window", async () => {
    const forecast = await getForecast(REQUEST);
    expect(forecastFor(forecast!, "2026-09-09")?.code).toBe(61);
    expect(forecastFor(forecast!, "2026-10-30")).toBeNull();
  });
});

describe("geocode", () => {
  it("returns every match with a label and coordinates", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        results: [
          { name: "New York", latitude: 40.7128, longitude: -74.006, admin1: "New York", country: "United States" },
          { name: "York", latitude: 53.96, longitude: -1.08, admin1: "England", country: "United Kingdom" },
        ],
      }),
    );
    const hits = await geocode("new york");
    expect(hits).toHaveLength(2);
    expect(hits[0]).toEqual({
      label: "New York",
      lat: 40.7128,
      lon: -74.006,
      detail: "New York, New York, United States",
    });
  });

  it("drops a match with no usable coordinates", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ results: [{ name: "Nowhere" }] }));
    expect(await geocode("nowhere")).toEqual([]);
  });

  it("does not call the service for an empty query", async () => {
    expect(await geocode("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is empty rather than thrown when the service fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await geocode("new york")).toEqual([]);
  });
});
