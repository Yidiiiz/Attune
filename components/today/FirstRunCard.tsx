// Owns: the one-time card at the top of Today (PROJECT.md §11.2) — your name, the timezone to
// confirm, and where the weather comes from. It is shown while `settings.identity.name` is empty
// and never again once it is set, so it has one job and no lifetime after it.
//
// "Use my location" sets coordinates and the label "My location", and leaves `query` empty: there
// is no reverse lookup to name the place, and coordinates are what the forecast needs anyway
// (Decision 51). A text search sets all four fields; the third choice sets none of them, which is
// what "weather is off" means.
//
// Failure behavior: geolocation denied, or a search that matches nothing, leaves the card exactly
// as it was with a line saying so. The card never blocks the day behind it — it can be dismissed
// without answering anything, and the same questions live in Settings afterwards.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Settings } from "@/lib/store/settings";
import styles from "./FirstRunCard.module.css";

export interface FirstRunCardProps {
  settings: Settings;
}

interface Place {
  label: string;
  lat: number;
  lon: number;
  detail: string;
  query: string;
}

export default function FirstRunCard({ settings }: FirstRunCardProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [name, setName] = useState(settings.identity.name);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [query, setQuery] = useState(settings.weather.query);
  const [place, setPlace] = useState<Place | null>(null);
  const [hits, setHits] = useState<Place[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const detected = typeof Intl === "undefined" ? timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (dismissed) return null;

  const search = async () => {
    setNote(null);
    setHits(null);
    if (query.trim() === "") return;
    setBusy(true);
    try {
      const response = await fetch(`/api/weather/geocode?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      const results: Place[] = data.ok
        ? (data.results as Omit<Place, "query">[]).map((hit) => ({ ...hit, query: query.trim() }))
        : [];
      setHits(results);
      if (results.length === 0) setNote("Nothing matched that name.");
    } finally {
      setBusy(false);
    }
  };

  const useMyLocation = () => {
    setNote(null);
    if (!navigator.geolocation) {
      setNote("This browser has no location service. Search by name instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPlace({
          label: "My location",
          lat: Number(position.coords.latitude.toFixed(4)),
          lon: Number(position.coords.longitude.toFixed(4)),
          detail: "From this browser",
          // Empty on purpose: nothing was typed, and Open-Meteo cannot name a coordinate.
          query: "",
        });
        setHits(null);
        setQuery("");
      },
      (error) => setNote(`Location was not available (${error.message}). Search by name instead.`),
    );
  };

  const save = async (weatherOff: boolean) => {
    setBusy(true);
    setNote(null);
    try {
      const weather = weatherOff
        ? { ...settings.weather, query: "", lat: undefined, lon: undefined, label: undefined }
        : place
          ? { ...settings.weather, query: place.query, lat: place.lat, lon: place.lon, label: place.label }
          : settings.weather;

      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...settings,
          identity: { ...settings.identity, name: name.trim() },
          timezone,
          weather,
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        setNote(data.error ?? "That could not be saved.");
        return;
      }
      if (name.trim() === "") setDismissed(true); // saved, but the card's own condition still holds
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-label="First run">
      <div className={styles.head}>
        <h2 className={styles.title}>Welcome</h2>
        <button type="button" className={styles.close} onClick={() => setDismissed(true)} aria-label="Dismiss">
          ×
        </button>
      </div>
      <p className={styles.lede}>Three things, once. All of them live in Settings afterwards.</p>

      <label className={styles.field}>
        <span>What should this call you?</span>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
      </label>

      <div className={styles.field}>
        <span>Timezone</span>
        <div className={styles.row}>
          <code className={styles.zone}>{timezone}</code>
          {detected && detected !== timezone ? (
            <button type="button" onClick={() => setTimezone(detected)}>
              Use {detected}
            </button>
          ) : (
            <span className={styles.muted}>matches this browser</span>
          )}
        </div>
      </div>

      <div className={styles.field}>
        <span>Weather</span>
        {place ? (
          <div className={styles.row}>
            <strong>{place.label}</strong>
            <span className={styles.muted}>{place.detail}</span>
            <button type="button" onClick={() => setPlace(null)}>
              Change
            </button>
          </div>
        ) : (
          <>
            <div className={styles.row}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void search();
                  }
                }}
                placeholder="City or town"
              />
              <button type="button" onClick={() => void search()} disabled={busy}>
                Search
              </button>
              <button type="button" onClick={useMyLocation}>
                Use my location
              </button>
            </div>
            {hits && hits.length > 0 ? (
              <ul className={styles.hits}>
                {hits.map((hit) => (
                  <li key={`${hit.lat},${hit.lon}`}>
                    <button type="button" onClick={() => setPlace(hit)}>
                      <strong>{hit.label}</strong> <span className={styles.muted}>{hit.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>

      {note ? (
        <p className={styles.note} role="alert">
          {note}
        </p>
      ) : null}

      <div className={styles.buttons}>
        <button type="button" className={styles.primary} onClick={() => void save(false)} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => void save(true)} disabled={busy}>
          Save without weather
        </button>
      </div>
      <p className={styles.attribution}>Weather data by Open-Meteo, CC-BY 4.0.</p>
    </section>
  );
}
