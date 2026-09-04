// Owns: `packDay` — laying the focus list out against the clock for §10.1's Schedule mode. Fixed
// commitments are placed where the user put them and everything else fills the gaps around them in
// rank order, so the timeline never argues with a task that already has a time on it.
//
// Pure, like `rank.ts`, and for the same reason: a component imports it directly, and the layout has
// to be identical on a re-render. `now` is an argument, never `new Date()`.
//
// Failure behavior: a `scheduled` value that will not parse drops that task out of the fixed set and
// it competes for a gap like anything else — a bad timestamp costs one task its slot, never the day
// its timeline. Nothing here writes; dragging a block is a `task.update` the caller makes.

import { datePart, minutesFromMidnight, splitLocalIso, todayIn } from "./dates.ts";
import type { Task } from "../store/tasks.ts";
import type { Settings } from "../store/settings.ts";

const DEFAULT_ESTIMATE_MIN = 30;

export interface Block {
  kind: "task" | "break" | "gap" | "fixed";
  taskId?: string;
  startMin: number;
  endMin: number;
}

export interface PackInput {
  focus: Task[];
  fixed: Task[];
  now: Date;
  viewDate: string;
  settings: Settings;
}

const duration = (task: Task): number => Math.max(1, task.estimateMin ?? DEFAULT_ESTIMATE_MIN);

/**
 * The minute of the day a task is pinned to, or null if it is not pinned to this one. A `scheduled`
 * carrying only a date is not a fixed block — it says which day, not which hour, which is exactly
 * the case the packer exists to answer.
 */
export function fixedStart(task: Task, viewDate: string): number | null {
  if (task.scheduled === null || datePart(task.scheduled) !== viewDate) return null;
  const { time } = splitLocalIso(task.scheduled);
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** The window §10.1 draws: from now (or the day's start) to the day's end. */
export function dayWindow(viewDate: string, settings: Settings, now: Date): { start: number; end: number } {
  const { day, timezone } = settings;
  const start = viewDate === todayIn(timezone, now)
    ? Math.max(minutesFromMidnight(now, timezone), day.startMin)
    : day.startMin;
  return { start, end: day.endMin };
}

/** Subtract one occupied span from a list of free spans. */
function carve(free: { start: number; end: number }[], from: number, to: number) {
  const out: { start: number; end: number }[] = [];
  for (const span of free) {
    if (to <= span.start || from >= span.end) {
      out.push(span);
      continue;
    }
    if (from > span.start) out.push({ start: span.start, end: from });
    if (to < span.end) out.push({ start: to, end: span.end });
  }
  return out;
}

/**
 * Lay out one day. Fixed blocks first, then focus tasks in rank order into the first gap each fits,
 * each followed by a break; whatever is still free comes back as `gap` blocks so the caller can draw
 * the whole window without computing the complement itself.
 *
 * A focus task that is also pinned is placed once, as `fixed`. A task that fits nowhere is simply
 * absent from the result — `unplaced` names those, and §10.1 lists them as "Didn't fit".
 */
export function packDay(input: PackInput): Block[] {
  const { focus, fixed, now, viewDate, settings } = input;
  const { start, end } = dayWindow(viewDate, settings, now);
  if (end <= start) return [];

  const blocks: Block[] = [];
  const placed = new Set<string>();
  let free = [{ start, end }];

  const pinned = fixed
    .map((task) => ({ task, at: fixedStart(task, viewDate) }))
    .filter((entry): entry is { task: Task; at: number } => entry.at !== null)
    .sort((a, b) => a.at - b.at || (a.task.id < b.task.id ? -1 : 1));

  for (const { task, at } of pinned) {
    const from = Math.max(at, start);
    const to = Math.min(at + duration(task), end);
    if (to <= from) continue; // entirely behind us, or past the end of the day
    blocks.push({ kind: "fixed", taskId: task.id, startMin: from, endMin: to });
    placed.add(task.id);
    free = carve(free, from, to);
  }

  const breakMin = Math.max(0, settings.day.breakMin);
  for (const task of focus) {
    if (placed.has(task.id)) continue;
    const need = duration(task);
    const span = free.find((candidate) => candidate.end - candidate.start >= need);
    if (!span) continue;

    const from = span.start;
    const to = from + need;
    blocks.push({ kind: "task", taskId: task.id, startMin: from, endMin: to });
    placed.add(task.id);
    free = carve(free, from, to);

    // The break is a courtesy, not a requirement: it is clipped to whatever is left rather than
    // costing the task its slot, and skipped entirely when the day ends on the task.
    const breakTo = Math.min(to + breakMin, end);
    if (breakMin > 0 && breakTo > to && free.some((s) => s.start === to)) {
      blocks.push({ kind: "break", startMin: to, endMin: breakTo });
      free = carve(free, to, breakTo);
    }
  }

  for (const span of free) blocks.push({ kind: "gap", startMin: span.start, endMin: span.end });

  return blocks.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

/** The focus tasks `packDay` could not fit — §10.1's "Didn't fit" list. */
export function unplaced(focus: Task[], blocks: Block[]): Task[] {
  const placed = new Set(blocks.map((block) => block.taskId).filter(Boolean));
  return focus.filter((task) => !placed.has(task.id));
}
