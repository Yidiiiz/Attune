// Owns: all ordinary Settings sections and their blur-save boundaries (§11.1).
// Failure behavior: keep invalid drafts with inline errors; saving one section preserves the others.
"use client";
import { useEffect, useState } from "react";
import type { Settings } from "@/lib/store/settings";
import type { Section } from "@/lib/settings/sections";
import { send } from "@/components/tasks/writes";
import { useSettings } from "./useSettings";
import ThemeSettings from "./ThemeSettings";
import WeatherSettings from "./WeatherSettings";
import DaySettings from "./DaySettings";
import ModelSettings from "./ModelSettings";
import styles from "./Settings.module.css";
export default function SettingsForm({ initial }: { initial: Settings }) {
  const form = useSettings(initial), value = form.value;
  const [zones, setZones] = useState([initial.timezone]), [category, setCategory] = useState("");
  const [remote, setRemote] = useState(""), [syncNote, setSyncNote] = useState(""), [syncing, setSyncing] = useState(false);
  useEffect(() => {
    setZones([...new Set([initial.timezone, "UTC", ...Intl.supportedValuesOf("timeZone")])].sort());
    void send("/api/sync/status").then(answer => { if (!answer.error) setRemote(String(answer.data.remoteUrl ?? "No remote configured")); });
  }, [initial.timezone]);
  function section(key: Section, title: string, children: React.ReactNode) {
    return <section className={styles.section} aria-label={title}><h2>{title}</h2>{children}{form.errors[key] ? <p role="alert" className={styles.error}>{form.errors[key]}</p> : null}</section>;
  }
  function addCategory() {
    const typed = category.trim(); if (!typed || value.categories.includes(typed)) return;
    form.change("categories", [...value.categories, typed]); setCategory(""); void form.save("categories");
  }
  async function syncNow() {
    if (syncing) return; setSyncing(true); const answer = await send("/api/sync/now", { method: "POST" }); setSyncing(false);
    setSyncNote(answer.error ?? String(answer.data.lastError ?? answer.data.state ?? "Sync finished"));
  }
  return <div className={styles.form}>
    <div role="status" aria-live="polite" className={styles.status}>{form.saving ? "Saving…" : form.saved}</div>
    {section("identity", "Identity", <div className={styles.row}>
      <label>Name<input value={value.identity.name} onChange={event => form.change("identity", { ...value.identity, name: event.target.value })} onBlur={() => void form.save("identity")} /></label>
      <label>Nickname<input value={value.identity.nickname} onChange={event => form.change("identity", { ...value.identity, nickname: event.target.value })} onBlur={() => void form.save("identity")} /></label>
    </div>)}
    {section("timezone", "Timezone", <label>Timezone<select value={value.timezone} onChange={event => form.change("timezone", event.target.value)} onBlur={() => void form.save("timezone")}>{zones.map(zone => <option key={zone}>{zone}</option>)}</select></label>)}
    {section("weather", "Weather", <WeatherSettings value={value.weather} onChange={next => form.change("weather", next)} onSave={next => void form.save("weather", next)} />)}
    {section("theme", "Theme", <ThemeSettings value={value.theme} onChange={name => form.change("theme", name)} onSave={name => { form.change("theme", name); void form.save("theme", name); }} onReload={() => void form.reload()} />)}
    {section("day", "Day shape", <DaySettings value={value.day} onChange={next => form.change("day", next)} onSave={() => void form.save("day")} />)}
    {section("list", "List behavior", <div className={styles.row}>
      <label>Focus size<input type="number" min="0" max="100" value={value.list.focusSize} onChange={event => form.change("list", { ...value.list, focusSize: Number(event.target.value) })} onBlur={() => void form.save("list")} /></label>
      <label>Lookahead days<input type="number" min="0" max="365" value={value.list.lookaheadDays} onChange={event => form.change("list", { ...value.list, lookaheadDays: Number(event.target.value) })} onBlur={() => void form.save("list")} /></label>
      <label>Show completed<input type="checkbox" checked={value.list.showCompleted} onChange={event => form.change("list", { ...value.list, showCompleted: event.target.checked })} onBlur={() => void form.save("list")} /></label>
    </div>)}
    {section("deadlines", "Deadlines", <>
      <label>Untimed due time<input type="time" value={value.deadlines.defaultTime} onChange={event => form.change("deadlines", { ...value.deadlines, defaultTime: event.target.value })} onBlur={() => void form.save("deadlines")} /></label>
      <p className={styles.note}>Midnight ends the due date. Specific task times take precedence.</p>
    </>)}
    {section("categories", "Categories", <>
      <div className={styles.chips}>{value.categories.map((item, index) => <div key={index} className={styles.row}>
        <label>Category {index + 1}<input value={item} onChange={event => form.change("categories", value.categories.map((old, at) => at === index ? event.target.value : old))} onBlur={() => void form.save("categories")} /></label>
        <button aria-label={`Remove category ${item}`} onClick={() => { form.change("categories", value.categories.filter((_, at) => at !== index)); void form.save("categories"); }}>×</button>
      </div>)}</div>
      <div className={styles.row}><label>New category<input value={category} onChange={event => setCategory(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addCategory(); } }} /></label><button disabled={!category.trim()} onClick={addCategory}>Add category</button></div>
    </>)}
    {section("firstDayOfWeek", "First day of week", <label>Week starts<select value={value.firstDayOfWeek} onChange={event => form.change("firstDayOfWeek", event.target.value as Settings["firstDayOfWeek"])} onBlur={() => void form.save("firstDayOfWeek")}><option value="monday">Monday</option><option value="sunday">Sunday</option></select></label>)}
    {section("interface", "Interface", <label>Technical file view<input type="checkbox" checked={value.interface.technicalFiles} onChange={event => { const next={...value.interface,technicalFiles:event.target.checked}; form.change("interface",next); void form.save("interface",next); }} /></label>)}
    {section("assistant", "Chat connection", <label>Chat connection<select value={value.assistant.transport} onChange={event => { const next={...value.assistant,transport:event.target.value as "terminal" | "api"}; form.change("assistant",next); void form.save("assistant",next); }}><option value="terminal">Terminal sign-in</option><option value="api">API key</option></select></label>)}
    {section("models", "Models", <ModelSettings value={value.models} onChange={next => form.change("models", next)} onSave={() => void form.save("models")} />)}
    <section className={styles.section} aria-label="History"><h2>History</h2><p className={styles.note}>Review actions and choose Undo or Redo. Ctrl/Cmd+Z outside an editor opens the same sheet.</p><button onClick={() => window.dispatchEvent(new Event("history:open"))}>Open History</button></section>
    {section("sync", "Sync", <>
      <div className={styles.row}><label>Automatically push project commits<input type="checkbox" checked={value.sync.autoPush} onChange={event => form.change("sync", { ...value.sync, autoPush: event.target.checked })} onBlur={() => void form.save("sync")} /></label>
      <label>Push debounce (milliseconds)<input type="number" min="0" max="3600000" value={value.sync.pushDebounceMs} onChange={event => form.change("sync", { ...value.sync, pushDebounceMs: Number(event.target.value) })} onBlur={() => void form.save("sync")} /></label></div>
      <label>Remote URL<input readOnly value={remote} /></label><button disabled={syncing} onClick={() => void syncNow()}>Sync now</button>{syncNote ? <p role="status">{syncNote}</p> : null}
    </>)}
  </div>;
}
