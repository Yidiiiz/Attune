// Owns: section-scoped Settings writes, merged inside the transaction queue (§11.1).
// Failure behavior: preserve unrelated/unknown keys and let runBatch roll back any refusal.
import { SettingsSchema } from "../store/settings.ts";
import { sectionSchema } from "../settings/sections.ts";
import type { Section } from "../settings/sections.ts";
import { readTheme } from "../store/themes.ts";
import type { ActionSpec } from "./batch.ts";
export function updateSettingsSection(section: Section, value: unknown): ActionSpec {
  return { type: "settings.update", summary: `Change ${section}`, apply: async store => {
    const rel = store.settings.SETTINGS_PATH, before = await store.snapshotContent(rel);
    const current = await store.settings.readSettings();
    const checked = sectionSchema(section).parse(value);
    if (section === "theme" && typeof checked === "string" && !["light", "dark"].includes(checked)) await readTheme(checked);
    const old = current[section];
    const merged = old && checked && typeof old === "object" && typeof checked === "object" && !Array.isArray(checked)
      ? { ...old, ...checked } : checked;
    if (section === "weather" && merged && typeof merged === "object") {
      for (const key of ["lat", "lon", "label"]) if (!(key in (checked as object))) delete (merged as Record<string, unknown>)[key];
    }
    await store.settings.writeSettings(SettingsSchema.parse({ ...current, [section]: merged }));
    return { targets: [rel], before: { [rel]: before }, after: { [rel]: await store.snapshotContent(rel) } };
  } };
}
