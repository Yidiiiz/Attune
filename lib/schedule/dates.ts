// Owns: turning an instant into the strings PROJECT.md §4 asks for, in the user's timezone —
// `YYYY-MM-DD` for date-only fields and `YYYY-MM-DDTHH:mm:ss±HH:mm` for timestamps — and the
// calendar arithmetic the ranker and the repeat rule are built from.
//
// The date maths deliberately never constructs a local `Date`. Every date-only value is anchored at
// UTC noon and compared there, so a day that is 23 or 25 hours long in the user's zone is still one
// day apart. Doing it in local time is the classic off-by-one: 12:00 minus 24 hours across a
// spring-forward lands at 13:00 the previous day, and a naive divide-by-86400 floors that to 0.
//
// Failure behavior: an unknown timezone falls back to UTC rather than throwing. A history entry
// stamped in the wrong zone is a cosmetic problem; one that could not be written is a lost action.
// The date functions reject a malformed date string by throwing, because a silent NaN would spread
// into a task's `due` and only surface as a row sorted into the wrong day.

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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A date-only string as an instant at UTC noon. Noon, not midnight, so that nothing downstream can
 * round the value across a day boundary; UTC, so no zone's transitions are in play at all.
 */
function dateAnchor(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) throw new RangeError(`not a YYYY-MM-DD date: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

/** Calendar days from `from` to `to`, signed. Both may carry a time; only the date half is read. */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateAnchor(to) - dateAnchor(from)) / DAY_MS);
}

/**
 * Calendar days from `viewDate` until `due` — negative once `due` is in the past, which is what
 * makes the §10.1 urgency curve read `daysUntil <= 0` as "today or overdue". Null in, null out, so
 * a task with no deadline needs no special case at the call site.
 */
export function daysUntil(viewDate: string, due: string | null): number | null {
  return due ? daysBetween(viewDate, due) : null;
}

/** Minutes since local midnight, the unit `settings.day` and the timeline are written in. */
export function minutesFromMidnight(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  return Number(p.hour) * 60 + Number(p.minute);
}

export type Repeat = "daily" | "weekly" | "biweekly" | "monthly";

const STEP_DAYS: Record<Exclude<Repeat, "monthly">, number> = { daily: 1, weekly: 7, biweekly: 14 };

/**
 * The next occurrence of a date under a repeat rule (§4.1). Monthly adds one calendar month and
 * clamps to the last day, so January 31 repeats to February 28 rather than spilling into March —
 * which is what `Date.UTC(y, m + 1, 31)` would silently do.
 *
 * A time on the value is preserved: `scheduled` may carry one, and the next instance keeps it.
 */
export function advanceDate(value: string, repeat: Repeat): string {
  const time = value.length > 10 ? value.slice(10) : "";
  const anchor = new Date(dateAnchor(value));

  if (repeat !== "monthly") {
    const next = new Date(anchor.getTime() + STEP_DAYS[repeat] * DAY_MS);
    return `${next.toISOString().slice(0, 10)}${time}`;
  }

  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const day = anchor.getUTCDate();
  const lastOfNext = new Date(Date.UTC(year, month + 2, 0, 12)).getUTCDate();
  const next = new Date(Date.UTC(year, month + 1, Math.min(day, lastOfNext), 12));
  return `${next.toISOString().slice(0, 10)}${time}`;
}
