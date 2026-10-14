// Owns: default and mode-specific model/effort controls using pure registry metadata (§11.4).
// Failure behavior: unsupported effort controls are disabled; drafts remain on save refusal.
"use client";
import { MODELS, modelEntry } from "@/lib/agent/models";
import type { Settings } from "@/lib/store/settings";
import styles from "./Settings.module.css";
export default function ModelSettings({ value, onChange, onSave }: { value: Settings["models"]; onChange: (next: Settings["models"]) => void; onSave: () => void }) {
  return <>{(["default", "extract", "build"] as const).map(mode => <div className={styles.row} key={mode}>
    <label>{mode} model<select value={value[mode].model} onChange={event => onChange({ ...value, [mode]: { ...value[mode], model: event.target.value } })} onBlur={onSave}>{MODELS.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label>
    <label>{mode} effort<select value={value[mode].effort ?? ""} disabled={!modelEntry(value[mode].model)?.effort} onChange={event => onChange({ ...value, [mode]: { ...value[mode], effort: event.target.value || undefined } })} onBlur={onSave}><option value="">Model default</option>{["low", "medium", "high", "xhigh", "max"].map(effort => <option key={effort}>{effort}</option>)}</select></label>
  </div>)}</>;
}
