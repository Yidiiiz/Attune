// Owns: the Settings shape, its defaults, and reading/writing data/settings/settings.json.
// The zod schema is loose at every level so a key this version does not know about survives a
// read-modify-write round trip (PROJECT.md §4.9).
//
// Failure behavior: a missing file yields defaults and writes nothing — a read that writes is a
// surprise. A file that will not parse is renamed to settings.json.broken-<ts> and replaced with
// defaults, so the app always starts; the rename is reported to the caller so the UI can toast it.
// Never throws on read.

import { rename, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveData } from "./paths.ts";

export const SETTINGS_PATH = "settings/settings.json";

const Effort = z.enum(["low", "medium", "high", "xhigh", "max"]);
const ModelChoice = z.looseObject({ model: z.string(), effort: Effort.optional() });

export const SettingsSchema = z.looseObject({
  schema: z.number().int().default(1),
  identity: z.looseObject({
    name: z.string().default(""),
    nickname: z.string().default(""),
  }).default({ name: "", nickname: "" }),
  timezone: z.string().default("America/New_York"),
  weather: z.looseObject({
    query: z.string().default(""),
    lat: z.number().optional(),
    lon: z.number().optional(),
    label: z.string().optional(),
    units: z.enum(["fahrenheit", "celsius"]).default("fahrenheit"),
  }).default({ query: "", units: "fahrenheit" }),
  theme: z.string().default("light"),
  day: z.looseObject({
    startMin: z.number().int().default(600),
    endMin: z.number().int().default(1440), // may exceed 1440: 1560 is 2:00 the next day
    blocks: z.array(z.tuple([z.number().int(), z.number().int()])).default([[600, 780], [840, 1080]]),
    breakMin: z.number().int().default(10),
  }).default({ startMin: 600, endMin: 1440, blocks: [[600, 780], [840, 1080]], breakMin: 10 }),
  list: z.looseObject({
    focusSize: z.number().int().default(5),
    lookaheadDays: z.number().int().default(14),
    showCompleted: z.boolean().default(true),
  }).default({ focusSize: 5, lookaheadDays: 14, showCompleted: true }),
  categories: z.array(z.string()).default(["school", "personal"]),
  firstDayOfWeek: z.enum(["monday", "sunday"]).default("monday"),
  models: z.looseObject({
    default: ModelChoice.default({ model: "claude-opus-5", effort: "high" }),
    extract: ModelChoice.default({ model: "claude-opus-5", effort: "medium" }),
    build: ModelChoice.default({ model: "claude-opus-5" }),
  }).default({
    default: { model: "claude-opus-5", effort: "high" },
    extract: { model: "claude-opus-5", effort: "medium" },
    build: { model: "claude-opus-5" },
  }),
  sync: z.looseObject({
    pushDebounceMs: z.number().int().default(30000),
    autoPush: z.boolean().default(true),
  }).default({ pushDebounceMs: 30000, autoPush: true }),
});

export type Settings = z.infer<typeof SettingsSchema>;

/** What a fresh clone gets: the §4.9 shape with weather off (Decision 38). */
export function defaultSettings(): Settings {
  return SettingsSchema.parse({});
}

export interface ReadSettingsResult {
  settings: Settings;
  /** Set when an unreadable file was moved aside, so the UI can say so. */
  recoveredFrom?: string;
}

/** Read settings, repairing an unparsable file rather than failing. */
export async function readSettingsResult(): Promise<ReadSettingsResult> {
  const abs = resolveData(SETTINGS_PATH);
  let text: string;
  try {
    text = await readFile(abs, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { settings: defaultSettings() };
    throw err;
  }

  try {
    return { settings: SettingsSchema.parse(JSON.parse(text)) };
  } catch {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const brokenRel = `${SETTINGS_PATH}.broken-${stamp}`;
    await rename(abs, resolveData(brokenRel));
    const settings = defaultSettings();
    await writeSettings(settings);
    return { settings, recoveredFrom: brokenRel };
  }
}

export async function readSettings(): Promise<Settings> {
  return (await readSettingsResult()).settings;
}

export async function writeSettings(settings: Settings): Promise<void> {
  await writeJsonAtomic(SETTINGS_PATH, SettingsSchema.parse(settings));
}

/**
 * LF-normalized, dirty-checked, atomic write. Shared by every JSON record the store owns.
 * Exported because themes (§4.10) will need exactly this in Phase 10.
 */
export async function writeJsonAtomic(rel: string, value: unknown): Promise<void> {
  const abs = resolveData(rel);
  const text = `${JSON.stringify(value, null, 2)}\n`.replace(/\r\n/g, "\n");

  try {
    if ((await readFile(abs, "utf8")) === text) return; // dirty check: never rewrite identical bytes
  } catch {
    // no existing file, or unreadable — fall through and write
  }

  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.tmp`);
  await writeFile(tmp, text, "utf8");
  await rename(tmp, abs);
}
