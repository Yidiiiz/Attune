// Owns: the weather element in the Today header (PROJECT.md §10.1) — a temperature and one of the
// eight condition icons, for today or for any day inside the forecast window.
//
// It fetches after mount rather than being rendered on the server, so a slow or unreachable
// Open-Meteo cannot hold up the day's list; the header's grid keeps the date centred whether this
// element is there or not, so arriving late moves nothing.
//
// Failure behavior: no location, no network, or a date outside the window all render exactly
// nothing. The element is absent, never a placeholder or an error — a missing temperature is not
// news worth taking space for, and `lib/weather.ts` has already logged the reason once.

"use client";

import { useEffect, useState } from "react";
import { ICON_GLYPH, ICON_LABEL, type Forecast, iconFor } from "@/lib/weather";
import styles from "./DayHeader.module.css";

export interface WeatherProps {
  date: string;
  today: string;
  /** False when `settings.weather` has no coordinates — the off-condition (Decision 51). */
  enabled: boolean;
}

interface Loaded extends Forecast {
  label: string;
}

export default function Weather({ date, today, enabled }: WeatherProps) {
  const [weather, setWeather] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;

    void (async () => {
      try {
        const response = await fetch("/api/weather", { cache: "no-store" });
        const data = await response.json();
        if (live && data.ok && data.weather) setWeather(data.weather as Loaded);
      } catch {
        // lib/weather.ts logged it; the element simply stays absent
      }
    })();

    return () => {
      live = false;
    };
  }, [enabled]);

  if (!enabled || !weather) return null;

  const day = weather.days.find((entry) => entry.date === date) ?? null;
  if (!day) return null; // outside the forecast window

  const isToday = date === today;
  const code = isToday && weather.current ? weather.current.code : day.code;
  const icon = iconFor(code);
  const temp = isToday && weather.current?.temp !== null && weather.current !== null
    ? weather.current.temp
    : day.max;
  if (temp === null) return null;

  const range = day.max !== null && day.min !== null ? `${Math.round(day.max)}° / ${Math.round(day.min)}°` : "";
  const place = weather.label ? `${weather.label} · ` : "";

  return (
    <div className={styles.weather} title={`${place}${ICON_LABEL[icon]}${range ? ` · ${range}` : ""}`}>
      <span className={styles.weatherIcon} aria-hidden="true">
        {ICON_GLYPH[icon]}
      </span>
      <span className={styles.weatherTemp}>{Math.round(temp)}°</span>
      <span className={styles.visuallyHidden}>
        {ICON_LABEL[icon]}
        {range ? `, ${range}` : ""}
      </span>
    </div>
  );
}
