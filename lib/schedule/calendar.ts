// Owns: the calendar's two pure questions (PROJECT.md §10.3) — which dates a view shows, and which
// tasks belong to each of them. No filesystem, no DOM: `app/calendar/page.tsx` and
// `GET /api/calendar` both need the same answer, and a pure module is the only thing §3 lets both
// import.
//
// Every date is a `YYYY-MM-DD` string moved with `addDays`, which anchors at UTC noon — so a week
// containing a DST transition is still seven cells, and a month view still starts on the right
// weekday. Nothing here constructs a local `Date` for date arithmetic.
//
// Grouping is two lists per day rather than one, because a past cell shows both what was finished
// and what was due and missed (Decision 54). Failure behavior: a task whose `due` will not parse is
// treated as undated rather than throwing, the same trade `rank.ts` makes — one bad field costs
// that task its cell, never the grid.

import { addDays, datePart } from "./dates.ts";
import type { Task } from "../store/tasks.ts";

export type CalendarView = "rolling" | "month" | "week";

export const CALENDAR_VIEWS: readonly CalendarView[] = ["rolling", "month", "week"];

export function isCalendarView(value: unknown): value is CalendarView {
  return typeof value === "string" && (CALENDAR_VIEWS as readonly string[]).includes(value);
}

export type FirstDayOfWeek = "monday" | "sunday";

export interface CalendarGrid {
  view: CalendarView;
  /** The date the view sits on: the first cell in Rolling, a day inside the unit otherwise. */
  anchor: string;
  /** First and last date in `rows`, inclusive — the range `GET /api/calendar` is asked for. */
  from: string;
  to: string;
  /** Column labels, `Mon`-first or `Sun`-first. Empty for Rolling, which has no fixed weekdays. */
  weekdays: string[];
  /** Rows of exactly seven dates. */
  rows: string[][];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The date as a whole number of days since the epoch. Anchored at UTC midnight rather than the UTC
 * noon `dates.ts` uses, because this one is divided: noon leaves a half-day remainder that rounds
 * the epoch itself to day 1 and shifts every weekday by one. No zone is involved either way.
 */
function daysFromEpoch(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) throw new RangeError(`not a YYYY-MM-DD date: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

/** Day of week for a date-only string, 0 = Sunday. 1970-01-01 was a Thursday, hence the +4. */
export function weekdayOf(date: string): number {
  return (((daysFromEpoch(date) + 4) % 7) + 7) % 7;
}

/** The `firstDayOfWeek`-aligned week start on or before `date`. */
export function startOfWeek(date: string, firstDay: FirstDayOfWeek): string {
  const offset = firstDay === "monday" ? (weekdayOf(date) + 6) % 7 : weekdayOf(date);
  return addDays(date, -offset);
}

function rowsFrom(start: string, count: number): string[][] {
  const rows: string[][] = [];
  for (let row = 0; row < count; row += 1) {
    const days: string[] = [];
    for (let col = 0; col < 7; col += 1) days.push(addDays(start, row * 7 + col));
    rows.push(days);
  }
  return rows;
}

function weekdayLabels(firstDay: FirstDayOfWeek): string[] {
  const start = firstDay === "monday" ? 1 : 0;
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS[(start + i) % 7]);
}

/** The first of `date`'s month, and how many days it has. */
function monthBounds(date: string): { first: string; days: number } {
  const first = `${date.slice(0, 7)}-01`;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return { first, days: new Date(Date.UTC(year, month, 0, 12)).getUTCDate() };
}

/**
 * The dates a view shows, as rows of seven.
 *
 * Rolling starts *at* the anchor rather than at a week boundary — §10.3 asks for "today plus the
 * next 27 days", which is deliberately not week-aligned, so it carries no weekday header: column
 * three is a different weekday next week. Month and Week align to `firstDayOfWeek` and do have
 * one. Month pads with adjacent-month days to whole weeks: four rows for a 28-day February that
 * starts in the first column, six for a 31-day month that starts late in the week.
 */
export function gridFor(view: CalendarView, anchor: string, firstDay: FirstDayOfWeek): CalendarGrid {
  if (view === "rolling") {
    return { view, anchor, from: anchor, to: addDays(anchor, 27), weekdays: [], rows: rowsFrom(anchor, 4) };
  }

  if (view === "week") {
    const start = startOfWeek(anchor, firstDay);
    return {
      view,
      anchor,
      from: start,
      to: addDays(start, 6),
      weekdays: weekdayLabels(firstDay),
      rows: rowsFrom(start, 1),
    };
  }

  const { first, days } = monthBounds(anchor);
  const start = startOfWeek(first, firstDay);
  const span = daysFromEpoch(addDays(first, days - 1)) - daysFromEpoch(start) + 1;
  const rowCount = Math.ceil(span / 7);
  return {
    view,
    anchor,
    from: start,
    to: addDays(start, rowCount * 7 - 1),
    weekdays: weekdayLabels(firstDay),
    rows: rowsFrom(start, rowCount),
  };
}

/**
 * The anchor one unit earlier or later. Rolling and Week both move a week; Month moves a calendar
 * month and clamps to the last day, so the 31st steps to the 28th rather than spilling forward —
 * the same clamp `advanceDate` makes for a monthly repeat.
 */
export function shiftAnchor(view: CalendarView, anchor: string, direction: -1 | 1): string {
  if (view !== "month") return addDays(anchor, 7 * direction);
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  const day = Number(anchor.slice(8, 10));
  const lastOfTarget = new Date(Date.UTC(year, month + direction, 0, 12)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + direction, Math.min(day, lastOfTarget), 12))
    .toISOString()
    .slice(0, 10);
}

export interface CalendarDay {
  /** Open or done tasks placed by `due`, or by `scheduled` when there is no `due`. */
  due: Task[];
  /** Tasks whose `completedAt` fell on this day. */
  completed: Task[];
}

export type CalendarDays = Record<string, CalendarDay>;

/** The date a task hangs on in the due list, or null when it has neither field (§10.3). */
export function cellDate(task: Task): string | null {
  const value = task.due ?? task.scheduled;
  if (value === null) return null;
  const date = datePart(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** Time of day carried by `due`/`scheduled`, or `99:99` for a date with none, so timed items lead. */
function timeOf(task: Task): string {
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(task.due ?? task.scheduled ?? "");
  return match ? match[1] : "99:99";
}

/**
 * Cell order, fully determined so two renders of the same set are byte-identical: time of day,
 * then priority, then title, then id. `id` is the tiebreak of last resort — two tasks can share
 * everything else, and without it the order would fall back to directory order.
 */
function byCellOrder(a: Task, b: Task): number {
  const [ta, tb] = [timeOf(a), timeOf(b)];
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (a.priority !== b.priority) return a.priority - b.priority;
  const title = a.title.localeCompare(b.title);
  if (title !== 0) return title;
  return a.id.localeCompare(b.id);
}

function byCompletedOrder(a: Task, b: Task): number {
  const at = (a.completedAt ?? "").localeCompare(b.completedAt ?? "");
  return at !== 0 ? at : byCellOrder(a, b);
}

/**
 * Group tasks into `{ due, completed }` per date across `[from, to]`. Every date in the range gets
 * an entry, including the empty ones, so a caller renders a cell without checking for undefined.
 *
 * A task finished on the day it was due lands in both lists. That is not a duplicate: §10.3 draws
 * the due list on today and future days and both lists on a past day, and `DayCell` shows a task
 * once regardless. Archived tasks appear in neither — an archived task is not part of the record
 * of a day.
 */
export function groupDays(tasks: Task[], from: string, to: string): CalendarDays {
  const days: CalendarDays = {};
  for (let date = from; date <= to; date = addDays(date, 1)) days[date] = { due: [], completed: [] };

  for (const task of tasks) {
    if (task.status === "archived") continue;

    let date: string | null = null;
    try {
      date = cellDate(task);
    } catch {
      date = null; // an unreadable date costs this task its cell, not the grid
    }
    if (date !== null && days[date] !== undefined) days[date].due.push(task);

    if (task.completedAt !== null) {
      const done = datePart(task.completedAt);
      if (days[done] !== undefined) days[done].completed.push(task);
    }
  }

  for (const day of Object.values(days)) {
    day.due.sort(byCellOrder);
    day.completed.sort(byCompletedOrder);
  }
  return days;
}
