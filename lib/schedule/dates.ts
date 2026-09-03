// Owns: turning an instant into the strings PROJECT.md §4 asks for, in the user's timezone —
// `YYYY-MM-DD` for date-only fields and `YYYY-MM-DDTHH:mm:ss±HH:mm` for timestamps.
// Phase 2 needs only these; the ranking helpers (daysBetween, minutesFromMidnight) arrive in
// Phase 3 with lib/schedule/rank.ts, which is the module that reads them.
//
// Failure behavior: an unknown timezone falls back to UTC rather than throwing. A history entry
// stamped in the wrong zone is a cosmetic problem; one that could not be written is a lost action.

const PART_KEYS = ["year", "month", "day", "hour", "minute", "second"] as const;

export interface ZonedParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

function formatterFor(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });
  }
}

/** The wall-clock fields of `at`, as seen in `timeZone`. Every value is zero-padded. */
export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const found: Record<string, string> = {};
  for (const part of parts) found[part.type] = part.value;
  const result = {} as ZonedParts;
  for (const key of PART_KEYS) result[key] = found[key] ?? "00";
  return result;
}

/** The UTC offset in force at `at`, as `+HH:mm` / `-HH:mm`. */
export function zoneOffset(at: Date, timeZone: string): string {
  const name = formatterFor(timeZone, { timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = name ? /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name) : null;
  if (!match) return "+00:00";
  return `${match[1]}${match[2].padStart(2, "0")}:${match[3] ?? "00"}`;
}

/** `YYYY-MM-DD` in `timeZone`. The date every date-only field is written with. */
export function todayIn(timeZone: string, at: Date = new Date()): string {
  const p = zonedParts(at, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * An ISO timestamp carrying its own offset, which is what makes every stored `ts` readable as
 * local time by slicing it — see `splitLocalIso`, and the history mirror that groups by day.
 */
export function nowIso(timeZone: string, at: Date = new Date(), opts: { ms?: boolean } = {}): string {
  const p = zonedParts(at, timeZone);
  const ms = opts.ms ? `.${String(at.getMilliseconds()).padStart(3, "0")}` : "";
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${ms}${zoneOffset(at, timeZone)}`;
}

/**
 * Split a stored timestamp into its local date and `HH:mm`, with no timezone maths: the offset it
 * carries is the one it was written in, so the characters are already local.
 */
export function splitLocalIso(ts: string): { date: string; time: string } {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(ts);
  return match ? { date: match[1], time: match[2] } : { date: ts.slice(0, 10), time: "" };
}

/** The date half of a `due`/`scheduled` value, which may be a date or a date-time. */
export function datePart(value: string): string {
  return value.slice(0, 10);
}
