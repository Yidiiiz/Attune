// Owns optional intent and flexible week tags. Effective rollover is read-only.
import { addDays } from "./dates.ts";
import type { Task } from "../store/tasks.ts";

export function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -day);
}

export function plannedWeek(task: Pick<Task, "tags">): string | null {
  const tag = task.tags.find(tag => /^plan-week:\d{4}-\d{2}-\d{2}$/.test(tag));
  if (!tag) return null;
  const date = tag.slice(10);
  const instant = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) return null;
  return weekStart(date);
}

export function effectiveWeek(task: Pick<Task, "tags">, today: string): string | null {
  const planned = plannedWeek(task);
  return planned === null ? null : planned > weekStart(today) ? planned : weekStart(today);
}

export function isWant(task: Pick<Task, "tags">): boolean {
  return task.tags.includes("want");
}

/** Preserve the user's other tags. Null means no flexible target week. */
export function planTags(tags: string[], want: boolean, week: string | null): string[] {
  return [...tags.filter(tag => tag !== "want" && !/^plan-week:\d{4}-\d{2}-\d{2}$/.test(tag)),
    ...(want ? ["want"] : []), ...(week ? [`plan-week:${weekStart(week)}`] : [])];
}
