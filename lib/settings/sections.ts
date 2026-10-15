// Owns: section-save request validation (§11.1), without changing legacy settings read/repair.
// Failure behavior: malformed or impossible sections fail before a history batch is started.
import { z } from "zod";
import { modelEntry } from "../agent/models.ts";
import { SettingsSchema } from "../store/settings.ts";
export const SECTION_KEYS = ["interface", "assistant", "identity", "timezone", "weather", "theme", "day", "list", "deadlines", "categories", "firstDayOfWeek", "models", "sync"] as const;
export const SectionKey = z.enum(SECTION_KEYS);
export type Section = z.infer<typeof SectionKey>;
const bounded = (max: number) => z.number().int().min(0).max(max);
const Day = SettingsSchema.shape.day.unwrap().extend({ startMin: bounded(1439), endMin: bounded(2880),
  breakMin: bounded(240), blocks: z.array(z.tuple([bounded(2880), bounded(2880)])).max(32) }).superRefine((day, ctx) => {
  if (day.endMin <= day.startMin) ctx.addIssue({ code: "custom", message: "End must follow start" });
  let last = day.startMin;
  for (const [start, end] of day.blocks) {
    if (start < last || end <= start || end > day.endMin) ctx.addIssue({ code: "custom", message: "Blocks must be ordered, nonoverlapping and inside the day" });
    last = end;
  }
});
export function sectionSchema(section: Section): z.ZodType {
  if (section === "models") return SettingsSchema.shape.models.refine(value =>
    [value.default, value.extract, value.build].every(choice => modelEntry(choice.model) !== null), "Unknown model")
    .refine(value => modelEntry(value.build.model)?.provider === "anthropic", "Build requires a Claude model");
  if (section === "day") return Day;
  if (section === "timezone") return z.string().refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } });
  if (section === "list") return SettingsSchema.shape.list.unwrap().extend({ focusSize: bounded(100), lookaheadDays: bounded(365) });
  if (section === "sync") return SettingsSchema.shape.sync.unwrap().extend({ pushDebounceMs: bounded(3600000) });
  if (section === "weather") return SettingsSchema.shape.weather.unwrap().extend({ lat: z.number().min(-90).max(90).optional(), lon: z.number().min(-180).max(180).optional() });
  if (section === "theme") return z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
  if (section === "categories") return z.array(z.string().trim().min(1).max(60)).max(100);
  return SettingsSchema.shape[section];
}
