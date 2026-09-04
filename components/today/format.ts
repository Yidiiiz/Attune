// Owns: the strings the Today tab shows — the header's date, a row's relative due date, its
// estimate and subtask count, and the timeline's clock labels. Pure and shared, because the same
// question ("what does this date say to a human?") is asked by the header, the rows, and the
// timeline, and three call sites answering it separately would drift.
//
// Nothing here touches the filesystem or the DOM, so client components import it directly (§3).
// Every date-only value is read at UTC noon, the same anchoring `lib/schedule/dates.ts` uses, so a
// formatter can never land on the previous day in a zone behind UTC.
//
// Failure behavior: a malformed date is returned as its own text rather than throwing. One bad
// `due` shows a strange chip; it never costs the row, and it never costs the list.

import { daysBetween } from "@/lib/schedule/dates";

/** A date-only string as the instant every formatter here reads: noon UTC, formatted in UTC. */
function noon(date: string): Date {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`);
}

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const MONTH_DAY_LONG = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });

const valid = (date: string): boolean => /^\d{4}-\d{2}-\d{2}/.test(date);

export interface DayLabel {
  weekday: string;
  long: string;
}

/**
 * The header's two lines. The year appears only when the day being viewed is not in the current
 * one — on any ordinary day it is noise, and eleven months out it is the only thing that matters.
 */
export function describeDate(date: string, todayDate: string): DayLabel {
  if (!valid(date)) return { weekday: "", long: date };
  const at = noon(date);
  const sameYear = date.slice(0, 4) === todayDate.slice(0, 4);
  return {
    weekday: WEEKDAY.format(at),
    long: (sameYear ? MONTH_DAY_LONG : MONTH_DAY_YEAR).format(at),
  };
}

/**
 * A due date as the row says it: "today", "in 3 days", "5 days ago". Past a fortnight the count
 * stops being something anyone can picture, so it becomes a plain date instead.
 */
export function relativeDue(viewDate: string, due: string | null): string | null {
  if (due === null) return null;
  if (!valid(due) || !valid(viewDate)) return due;

  const days = daysBetween(viewDate, due);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 1 && days < 14) return `in ${days} days`;
  if (days < -1 && days > -14) return `${-days} days ago`;
  return MONTH_DAY.format(noon(due));
}

/** An estimate in the shape people say it: `45m`, `1h`, `1h 30m`. */
export function durationLabel(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export interface Progress {
  done: number;
  total: number;
}

/**
 * The `2/4` chip: `- [ ]` and `- [x]` lines in the body (§4.1, Decision 3). Null when the body has
 * no checkboxes at all, because "0/0" is a claim about a task that never had subtasks.
 *
 * Indented boxes count: a nested checklist is still the work. Fenced code is not excluded — a task
 * body holding a code fence full of checkbox syntax is a case worth less than the lines it would
 * take to handle, and the count being one high is visible and harmless.
 */
export function subtaskProgress(body: string): Progress | null {
  const boxes = body.match(/^\s*[-*]\s*\[[ xX]\]/gm);
  if (!boxes || boxes.length === 0) return null;
  const done = boxes.filter((line) => /\[[xX]\]$/.test(line)).length;
  return { done, total: boxes.length };
}

/** §4.1's four priorities, in the words the menu and the row's tooltip use. */
export const PRIORITY_LABEL: Record<number, string> = {
  1: "Critical",
  2: "High",
  3: "Normal",
  4: "Someday",
};

/**
 * Whether the row draws a priority glyph. Normal is the default every task has until someone says
 * otherwise, so marking it says nothing; the other three are all a decision someone made.
 */
export function showsPriority(priority: number): boolean {
  return priority !== 3;
}

/**
 * Minutes from midnight as a 24-hour clock — the same form `scheduled` is stored in (§4), so what
 * the timeline shows is what you would type into the field. Past midnight wraps: `settings.day.endMin`
 * may be 1560, which is 02:00 the next day (§4.9).
 */
export function clockLabel(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  return `${String(hours).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}
