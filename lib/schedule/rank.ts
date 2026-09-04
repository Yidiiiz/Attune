// Owns: the deterministic day ranking of PROJECT.md §10.1 — which tasks are overdue, which make the
// focus list, which fall to "Also possible", and which were finished on the day being viewed. No
// model is involved and none ever should be: this is the function that has to give the same answer
// twice in a row, and a ranked list that reshuffles between renders is worse than a bad order.
//
// Pure by construction. Components import this directly (§3), so it must not reach the filesystem:
// `Task` and `Settings` arrive as `import type`, which `verbatimModuleSyntax` erases entirely, and
// the only ambient input is the `now` the caller passes in.
//
// Failure behavior: a task whose `due` will not parse would throw out of `daysUntil` and cost the
// whole list, so it is caught per task and treated as undated — one unreadable field costs that
// task its urgency, never the day its ranking.

import { datePart, daysUntil, minutesFromMidnight, splitLocalIso, todayIn } from "./dates.ts";
import type { Task } from "../store/tasks.ts";
import type { Settings } from "../store/settings.ts";

/** §10.1's weights. A critical undated task (11) outranks a someday task due tomorrow (9). */
const PRIORITY_WEIGHT: Record<number, number> = { 1: 11, 2: 6, 3: 2, 4: 0 };

/** What the ranker treats a task with no estimate as costing. */
const DEFAULT_ESTIMATE_MIN = 30;

export interface RankedDay {
  overdue: Task[];
  focus: Task[];
  alsoPossible: Task[];
  doneToday: Task[];
}

/** The score broken into the columns of the §10.1 worked example, so the table can be asserted. */
export interface ScoreParts {
  urgency: number;
  priority: number;
  scheduled: number;
  doing: number;
  fit: number;
  total: number;
}

const isOpen = (task: Task): boolean => task.status === "todo" || task.status === "doing";

/** `due` in calendar days from `viewDate`, or null when it is absent or unreadable. */
function dueInDays(task: Task, viewDate: string): number | null {
  try {
    return daysUntil(viewDate, task.due);
  } catch {
    return null;
  }
}

/** Every column of §10.1's score, and their sum. */
export function scoreParts(task: Task, viewDate: string, availableMinutes: number): ScoreParts {
  const days = dueInDays(task, viewDate);
  const urgency = days === null ? 0 : days <= 0 ? 10 : Math.max(0, 10 - days);
  const priority = PRIORITY_WEIGHT[task.priority] ?? 0;
  const scheduled = task.scheduled !== null && datePart(task.scheduled) <= viewDate ? 6 : 0;
  const doing = task.status === "doing" ? 3 : 0;
  const fit = (task.estimateMin ?? DEFAULT_ESTIMATE_MIN) <= availableMinutes ? 1 : 0;

  return { urgency, priority, scheduled, doing, fit, total: urgency + priority + scheduled + doing + fit };
}

export function score(task: Task, viewDate: string, availableMinutes: number): number {
  return scoreParts(task, viewDate, availableMinutes).total;
}

/**
 * §10.1's tie-break, in order: `due` ascending with nulls last, then `priority` ascending, then
 * `createdAt`, then `id`. Ending on `id` is what makes the order total — every earlier key can tie,
 * and two tasks cannot share an id — which is the whole reason rendering twice is stable.
 */
function tieBreak(a: Task, b: Task): number {
  if (a.due !== b.due) {
    if (a.due === null) return 1;
    if (b.due === null) return -1;
    return a.due < b.due ? -1 : 1;
  }
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The minutes §10.1 measures `fit` against: what is left of today from now, or the shape of the
 * configured day for any other date. Clamped at 0, so an evening after `day.endMin` makes every
 * task an equally poor fit rather than a negative one.
 */
export function availableMinutes(viewDate: string, settings: Settings, now: Date): number {
  const { day, timezone } = settings;
  if (viewDate !== todayIn(timezone, now)) {
    return day.blocks.reduce((total, [start, end]) => total + Math.max(0, end - start), 0);
  }
  const from = Math.max(minutesFromMidnight(now, timezone), day.startMin);
  return Math.max(0, day.endMin - from);
}

/**
 * Beyond the lookahead horizon: far-off work is real, but it is not what today is for, so it is
 * kept out of focus regardless of score. A task explicitly scheduled for this day is exempt — the
 * user already answered the question the horizon exists to ask.
 */
function beyondLookahead(task: Task, viewDate: string, settings: Settings): boolean {
  const days = dueInDays(task, viewDate);
  if (days === null || days <= settings.list.lookaheadDays) return false;
  return !(task.scheduled !== null && datePart(task.scheduled) === viewDate);
}

/**
 * Split a day's tasks into the four sections of §10.1. `now` is an argument rather than a call to
 * `new Date()` so that the same inputs always give the same output — the property the "rendering
 * twice yields identical order" check is about.
 *
 * `doneToday` is returned whether or not `settings.list.showCompleted` is set; that flag governs
 * whether the section is displayed, and hiding data at the ranker would leave the caller unable to
 * show a count.
 */
export function rankDay(tasks: Task[], viewDate: string, settings: Settings, now: Date): RankedDay {
  const minutes = availableMinutes(viewDate, settings, now);

  const overdue: Task[] = [];
  const doneToday: Task[] = [];
  const eligible: { task: Task; total: number; focusable: boolean }[] = [];

  for (const task of tasks) {
    if (task.completedAt && splitLocalIso(task.completedAt).date === viewDate) doneToday.push(task);
    if (!isOpen(task)) continue;

    if (task.due !== null && datePart(task.due) < viewDate) {
      overdue.push(task);
      continue;
    }
    // A task scheduled for a later day is not offered on an earlier one; that is what scheduling it
    // meant. `scheduled` in the past keeps it eligible — a missed plan is still work to do.
    if (task.scheduled !== null && datePart(task.scheduled) > viewDate) continue;

    eligible.push({
      task,
      total: scoreParts(task, viewDate, minutes).total,
      focusable: !beyondLookahead(task, viewDate, settings),
    });
  }

  overdue.sort((a, b) => tieBreak(a, b));
  doneToday.sort((a, b) => (a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1);
  eligible.sort((a, b) => b.total - a.total || tieBreak(a.task, b.task));

  const focus: Task[] = [];
  const alsoPossible: Task[] = [];
  for (const entry of eligible) {
    if (entry.focusable && focus.length < settings.list.focusSize) focus.push(entry.task);
    else alsoPossible.push(entry.task);
  }

  return { overdue, focus, alsoPossible, doneToday };
}
