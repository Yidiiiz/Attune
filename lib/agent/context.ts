// Owns: what the model is told before it is asked anything — PROJECT.md §13.1's ordered array of
// system blocks, and §6.2's rule about which of them are always present. The debug view (§10.2)
// renders exactly what this returns, which is the reason it returns an array of labelled blocks
// rather than one assembled string: a prompt nobody can read is a prompt nobody can fix.
//
// Failure behavior: never throws for missing content. A profile file that does not exist, or that
// still holds only the comment header the seed ships, produces an empty block rather than an absent
// one — a fresh user is the default path, not an edge case, and a block that disappears when its
// file is empty changes the shape of the prompt between one user and the next. A path that escapes
// `data/` is not missing content and does propagate, as `forbidden_path`.
//
// One thing this file does *not* decide: §13.1 puts the settings preamble first and marks the four
// blocks after it `cache: true`. The preamble carries the current local time, so it changes on
// every request, and a cache breakpoint sitting behind something that changes never gets a hit. The
// order here is the spec's; the observation belongs to whoever revises §13.1.

import { readText } from "../store/files.ts";
import { StoreError } from "../store/paths.ts";
import { listTasks } from "../store/tasks.ts";
import { readSettings } from "../store/settings.ts";
import { datePart, nowIso, todayIn } from "../schedule/dates.ts";
import { modeInstructions } from "./prompts.ts";
import type { Mode } from "./prompts.ts";
import type { Settings } from "../store/settings.ts";
import type { Task } from "../store/tasks.ts";

export interface ContextBlock {
  label: string;
  /** Where the text came from — a path under `data/`, or the module that generated it. */
  source: string;
  text: string;
  tokens: number;
  /** Part of the cacheable prefix (§13.1). Consecutive true blocks are sent as one. */
  cache?: boolean;
}

export interface ContextInput {
  mode: Mode;
  /** The day being looked at, when the request came from the Today tab. */
  viewDate?: string;
  /** A calendar range, when it came from the Calendar tab. */
  range?: [string, string];
  /** A file open in the document view, relative to `data/`. */
  openFile?: string;
  /** Tasks the request is explicitly about — "Ask about this" (§9.6). */
  taskIds?: string[];
}

export interface AssembledContext {
  system: ContextBlock[];
  total: number;
}

/** §6.2: the estimate is characters over four, and the debug view colours it past 2,500. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

const block = (label: string, source: string, text: string, cache?: boolean): ContextBlock => ({
  label,
  source,
  text,
  tokens: estimateTokens(text),
  ...(cache === true ? { cache: true } : {}),
});

/**
 * A file's text, or the empty string. Comment blocks are removed: the seed profile files carry an
 * HTML comment telling the *user* what to put there, and forwarding that to a model would have it
 * reading instructions addressed to someone else as though they were content.
 *
 * A file that is not there is empty, which is the fresh-install case and not a fault. A path that
 * escapes `data/` is a different thing entirely and is not swallowed: the store already refused to
 * read it, and answering with a blank block would report a caller error as an empty file — while
 * still echoing the path it was asked for back into the prompt as that block's source.
 */
async function readOrEmpty(rel: string): Promise<string> {
  let text: string;
  try {
    text = await readText(rel);
  } catch (err) {
    if (err instanceof StoreError && err.code === "forbidden_path") throw err;
    return "";
  }
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

const PROFILE_FILES: Array<{ label: string; rel: string }> = [
  { label: "About me", rel: "knowledge/profile/about-me.md" },
  { label: "Habits", rel: "knowledge/profile/habits.md" },
  { label: "Preferences", rel: "knowledge/profile/preferences.md" },
];

const hhmm = (minutes: number): string =>
  String(Math.floor(minutes / 60) % 24).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");

/** Name, timezone, the time it is where the user is, and the shape of their day (§6.2 step 1). */
export function settingsPreamble(settings: Settings, at: Date): string {
  const name = settings.identity.name.trim();
  const nickname = settings.identity.nickname.trim();
  const who =
    name.length === 0
      ? "The user has not given their name."
      : nickname.length === 0
        ? "The user is " + name + "."
        : "The user is " + name + ", who goes by " + nickname + ".";
  const blocks = settings.day.blocks.map(([from, to]) => hhmm(from) + "-" + hhmm(to)).join(", ");

  return [
    who,
    "Timezone: " + settings.timezone + ". It is now " + nowIso(settings.timezone, at) + ".",
    "Their day runs " + hhmm(settings.day.startMin) + " to " + hhmm(settings.day.endMin) +
      ", in blocks of " + blocks + ", with " + settings.day.breakMin + "-minute breaks.",
    settings.categories.length > 0
      ? "Categories in use: " + settings.categories.join(", ") + "."
      : "No categories are set up.",
    "Dates are YYYY-MM-DD and date-times are YYYY-MM-DDTHH:mm in that timezone.",
  ].join("\n");
}

const isOpen = (task: Task): boolean => task.status === "todo" || task.status === "doing";

/** Tasks the current view is showing: one day, or a calendar range (§6.2 step 3). */
export function tasksInScope(tasks: Task[], from: string, to: string): Task[] {
  return tasks
    .filter((task) => {
      if (!isOpen(task)) return false;
      const dates = [task.scheduled, task.due].filter((value): value is string => value !== null);
      return dates.some((value) => datePart(value) >= from && datePart(value) <= to);
    })
    .sort((a, b) => (a.due ?? a.scheduled ?? "").localeCompare(b.due ?? b.scheduled ?? ""));
}

const cell = (value: string | number | null): string =>
  value === null || value === "" ? "-" : String(value);

/** The compact table §6.2 step 3 asks for. Also what `list_tasks` answers with, so the model
 * reads one shape whether the tasks arrived in the prompt or through a tool. */
export function tasksTable(tasks: Task[]): string {
  if (tasks.length === 0) return "No open tasks in this range.";
  const rows = tasks.map(
    (task) =>
      "| " + task.id + " | " + task.title + " | " + task.status + " | " + task.priority + " | " +
      cell(task.due) + " | " + cell(task.scheduled) + " | " + cell(task.estimateMin) + " | " +
      cell(task.category) + " |",
  );
  return [
    "| id | title | status | priority | due | scheduled | est | category |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** One referenced task in full, because "Ask about this" is a question about its contents. */
function taskDetail(task: Task): string {
  const fields = [
    "title: " + task.title,
    "status: " + task.status,
    "priority: " + task.priority,
    "due: " + cell(task.due),
    "scheduled: " + cell(task.scheduled),
    "estimateMin: " + cell(task.estimateMin),
    "category: " + cell(task.category),
    "context: " + cell(task.context),
    task.tags.length > 0 ? "tags: " + task.tags.join(", ") : null,
    task.links.length > 0 ? "links: " + task.links.join(", ") : null,
  ].filter((line): line is string => line !== null);
  return (task.path + "\n" + fields.join("\n") + "\n\n" + task.body.trim()).trim();
}

/**
 * §13.1's order, every time: settings preamble · index.md · profile files · mode instructions ·
 * view tasks · open file · referenced tasks. The first five exist unconditionally; the last three
 * appear only when the caller said which view, which file, or which tasks it means.
 */
export async function assembleContext(
  input: ContextInput,
  at: Date = new Date(),
): Promise<AssembledContext> {
  const settings = await readSettings();
  const system: ContextBlock[] = [
    block("Setup", "settings/settings.json", settingsPreamble(settings, at)),
    block("Knowledge index", "knowledge/index.md", await readOrEmpty("knowledge/index.md"), true),
  ];

  for (const file of PROFILE_FILES) {
    system.push(block(file.label, file.rel, await readOrEmpty(file.rel), true));
  }

  system.push(block("Instructions", "lib/agent/prompts.ts", modeInstructions(input.mode)));

  const referencedIds = input.taskIds ?? [];
  const wantsView = input.viewDate !== undefined || input.range !== undefined;
  // Read once, and only when something below actually needs the list.
  const tasks = wantsView || referencedIds.length > 0 ? await listTasks() : [];

  if (wantsView) {
    const day = input.viewDate ?? todayIn(settings.timezone, at);
    const [from, to] = input.range ?? [day, day];
    const label = from === to ? "Tasks on " + from : "Tasks " + from + " to " + to;
    system.push(block(label, "tasks/", tasksTable(tasksInScope(tasks, from, to))));
  }

  if (input.openFile !== undefined) {
    system.push(block("Open document", input.openFile, await readOrEmpty(input.openFile)));
  }

  for (const id of referencedIds) {
    const task = tasks.find((candidate) => candidate.id === id);
    if (task !== undefined) system.push(block("Task: " + task.title, task.path, taskDetail(task)));
  }

  return { system, total: system.reduce((sum, entry) => sum + entry.tokens, 0) };
}
