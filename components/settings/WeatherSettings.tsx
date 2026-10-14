// Owns: location search, browser geolocation and weather clearing (§11.1).
// Failure behavior: permission/service failures keep current settings and appear inline.
"use client";
import { useState } from "react";
import type { Settings } from "@/lib/store/settings";
import { send } from "@/components/tasks/writes";
import styles from "./Settings.module.css";
interface Place { label: string; lat: number; lon: number; detail: string }
export default function WeatherSettings({ value, onChange, onSave }: { value: Settings["weather"]; onChange: (next: Settings["weather"]) => void; onSave: (next: Settings["weather"]) => void }) {
  const [hits, setHits] = useState<Place[]>([]), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const apply = (next: Settings["weather"]) => { onChange(next); onSave(next); setHits([]); };
  async function resolve() {
    setBusy(true); setError(null); const result = await send(`/api/weather/geocode?q=${encodeURIComponent(value.query)}`); setBusy(false);
    if (result.error) setError(result.error); else { setHits(result.data.results as Place[]); if (!(result.data.results as Place[]).length) setError("Nothing matched that name."); }
  }
  function locate() {
    if (!navigator.geolocation) { setError("Geolocation is unavailable in this browser."); return; }
    setBusy(true); setError(null);
    navigator.geolocation.getCurrentPosition(position => { setBusy(false); apply({ ...value, query: "", lat: position.coords.latitude, lon: position.coords.longitude, label: "My location" }); }, error => { setBusy(false); setError(error.message); }, { timeout: 10000 });
  }
  return <>
    <div className={styles.row}><label>Weather location<input disabled={busy} value={value.query} onChange={event => onChange({ ...value, query: event.target.value })} onBlur={() => onSave(value)} /></label><button disabled={busy || !value.query.trim()} onClick={() => void resolve()}>Resolve</button><button disabled={busy} onClick={locate}>Use my location</button><button disabled={busy} onClick={() => { const { lat, lon, label, ...rest } = value; void lat; void lon; void label; apply({ ...rest, query: "" }); }}>Clear weather</button></div>
    {hits.map(hit => <button key={`${hit.lat},${hit.lon}`} onClick={() => apply({ ...value, query: value.query, lat: hit.lat, lon: hit.lon, label: hit.label })}>{hit.detail}</button>)}
    <label>Weather units<select disabled={busy} value={value.units} onChange={event => onChange({ ...value, units: event.target.value as Settings["weather"]["units"] })} onBlur={() => onSave(value)}><option value="fahrenheit">Fahrenheit</option><option value="celsius">Celsius</option></select></label>
    <p>{value.label ?? "Weather is off"}</p>{error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <p className={styles.note}>Weather data by <a href="https://open-meteo.com/">Open-Meteo</a>, CC-BY 4.0</p>
  </>;
}
