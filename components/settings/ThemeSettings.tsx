// Owns: protected base choices, custom token editing and unsaved generated palettes (§11.3).
// Failure behavior: keep rejected drafts and prompt with an inline error; nothing auto-saves a generated theme.
"use client";
import { useCallback, useEffect, useState } from "react";
import { send } from "@/components/tasks/writes";
import { TOKENS, ThemeSchema, colorToken } from "@/lib/theme/tokens";
import type { Theme } from "@/lib/theme/tokens";
import { previewTheme } from "./theme-preview";
import styles from "./Settings.module.css";
export default function ThemeSettings({ value, onChange, onSave, onReload }: { value: string; onChange: (name: string) => void; onSave: (name: string) => void; onReload: () => void }) {
  const [themes, setThemes] = useState<Theme[]>([]), [draft, setDraft] = useState<Theme | null>(null);
  const [name, setName] = useState(""), [prompt, setPrompt] = useState(""), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const selected = themes.find(theme => theme.name === value);
  const load = useCallback(async () => { const result = await send("/api/settings/themes"); if (result.error) setError(result.error); else setThemes(result.data.themes as Theme[]); }, []);
  useEffect(() => {
    if (!draft) return;
    const checked = ThemeSchema.safeParse(draft);
    if (checked.success) previewTheme(checked.data.name, checked.data);
  }, [draft]);
  useEffect(() => { void load(); window.addEventListener("history:changed", load); return () => window.removeEventListener("history:changed", load); }, [load]);
  const choose = (next: string) => { onChange(next); previewTheme(next, themes.find(theme => theme.name === next)); setDraft(null); };
  async function save(next: Theme, activate = false) {
    const parsed = ThemeSchema.safeParse(next);
    if (!parsed.success) { setError("Use a lowercase theme name and valid token values; base names are protected."); return; }
    setBusy(true); setError(null);
    const result = await send("/api/settings/themes", { method: "PUT", body: JSON.stringify(parsed.data) });
    setBusy(false);
    if (result.error) { setError(result.error); return; }
    setDraft(parsed.data); await load();
    if (activate || value === next.name) { onSave(next.name); previewTheme(next.name, parsed.data); }
  }
  async function duplicate() {
    if (["light", "dark", ...themes.map(theme => theme.name)].includes(name)) { setError("Choose a new theme name."); return; }
    await save({ schema: 1, name, base: selected?.base ?? (value === "dark" ? "dark" : "light"), tokens: { ...selected?.tokens } }, true);
  }
  async function remove() {
    if (!selected || !window.confirm(`Delete theme ${selected.name}? History can undo this.`)) return;
    setBusy(true); const result = await send("/api/settings/themes", { method: "DELETE", body: JSON.stringify({ name: selected.name }) }); setBusy(false);
    if (result.error) setError(result.error); else { setDraft(null); await load(); onReload(); window.dispatchEvent(new Event("settings:changed")); }
  }
  async function generate() {
    setBusy(true); setError(null);
    const result = await send("/api/agent/theme", { method: "POST", body: JSON.stringify({ prompt }) }); setBusy(false);
    if (result.error) { setError(result.error); return; }
    setDraft({ schema: 1, name: name || "new-theme", base: selected?.base ?? (value === "dark" ? "dark" : "light"), tokens: result.data.tokens as Theme["tokens"] });
  }
  return <>
    <label>Theme<select aria-label="Theme" value={value} onChange={event => choose(event.target.value)} onBlur={() => onSave(value)} disabled={busy}>
      <option value="light">Light — protected</option><option value="dark">Dark — protected</option>
      {themes.map(theme => <option key={theme.name} value={theme.name}>{theme.name}</option>)}
    </select></label>
    <div className={styles.row}><label>New theme name<input value={name} onChange={event => setName(event.target.value)} placeholder="warm-evening" /></label>
      <button disabled={busy || !name} onClick={() => void duplicate()}>Duplicate to new theme</button>
      {selected ? <><button onClick={() => setDraft(selected)}>Edit tokens</button><button disabled={busy} onClick={() => void remove()}>Delete theme</button></> : null}</div>
    <div className={styles.row}><label>Create by prompting<input value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="warm sepia, low contrast" /></label><button disabled={busy || !prompt.trim()} onClick={() => void generate()}>Generate preview</button></div>
    {draft ? <div className={styles.editor} data-ui="theme-editor">
      <h3>{themes.some(theme => theme.name === draft.name) ? `Edit ${draft.name}` : "Unsaved theme"}</h3>
      <label>Theme name<input value={draft.name} disabled={themes.some(theme => theme.name === draft.name)} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>Base<select aria-label="Theme base" value={draft.base} onChange={event => setDraft({ ...draft, base: event.target.value as Theme["base"] })}><option>light</option><option>dark</option></select></label>
      <p>Empty values inherit the base. Save to keep this palette.</p>
      <div className={styles.tokens}>{TOKENS.map(token => <label key={token}>{token}<div className={styles.row}>
        {colorToken(token) ? <input type="color" aria-label={`${token} color`} value={/^#[a-f0-9]{6}$/i.test(draft.tokens[token] ?? "") ? draft.tokens[token] : "#000000"} onChange={event => setDraft({ ...draft, tokens: { ...draft.tokens, [token]: event.target.value } })} /> : null}
        <input aria-label={token} value={draft.tokens[token] ?? ""} placeholder="inherit" onChange={event => { const tokens = { ...draft.tokens }; if (event.target.value) tokens[token] = event.target.value; else delete tokens[token]; setDraft({ ...draft, tokens }); }} />
      </div></label>)}</div>
      <div className={styles.row}><button disabled={busy} onClick={() => void save(draft, true)}>Save theme</button><button disabled={busy} onClick={() => { setDraft(null); previewTheme(value, selected); }}>Discard preview</button></div>
    </div> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </>;
}
