// Owns: the forecast the Today header shows (PROJECT.md §14, §10.1). Ten lines of adapter over
// `lib/weather.ts`, which owns the call and the cache.
//
// Failure behavior: `weather: null` covers both "no location set" and "the service could not be
// reached". The header treats them the same — it renders no element — so the route does not need a
// third answer, and a client that fails to reach even this route behaves identically.

import { readSettings } from "@/lib/store/settings";
import { getForecast } from "@/lib/weather";
import { handle, ok } from "../respond";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handle(async () => {
    const { weather, timezone } = await readSettings();
    // Decision 51: coordinates are the off-switch. A query with no coordinates is a search that
    // never resolved, and there is nothing to ask Open-Meteo for.
    if (weather.lat === undefined || weather.lon === undefined) return ok({ weather: null });

    const forecast = await getForecast({
      lat: weather.lat,
      lon: weather.lon,
      unit: weather.units,
      timezone,
    });
    if (!forecast) return ok({ weather: null });

    return ok({ weather: { ...forecast, label: weather.label ?? "" } });
  });
}
