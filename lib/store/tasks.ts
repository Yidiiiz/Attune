// Owns: the Task shape from PROJECT.md §4.1, its defaults, and the four functions that read and
// write `data/tasks/*.md`. Filenames are fixed at creation (Decision 7): `writeTask` reuses the
// path a task already has and never renames on a date change.
//
// Failure behavior: a file whose frontmatter will not parse is skipped by `listTasks` and its path
// is left in `listTasks.errors` for the Today tab to show as a one-line warning — one broken file
// costs you that task, never the list. A sparse file (only a title) loads with defaults filled in,
// and those repairs reach disk on its next save, not on read.

import { createHash } from "node:crypto";
import { randomBytes } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { StoreError, resolveData } from "./paths.ts";
import { joinFrontmatter, splitFrontmatter } from "./frontmatter.ts";
import { deleteFile, readText, writeText } from "./files.ts";
import { readSettings } from "./settings.ts";
import { nowIso, todayIn } from "../schedule/dates.ts";

export const TASKS_DIR = "tasks";

export const TaskSchema = z.looseObject({
  schema: z.number().int().default(1),
  id: z.string(),
  title: z.string(),
  status: z.enum(["todo", "doing", "done", "archived"]).default("todo"),
  priority: z.number().int().min(1).max(4).default(3),
  estimateMin: z.number().int().nullable().default(null),
  due: z.string().nullable().default(null),
  scheduled: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  category: z.string().nullable().default(null),
  context: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),
  repeat: z.enum(["daily", "weekly", "biweekly", "monthly"]).nullable().default(null),
  repeatUntil: z.string().nullable().default(null),
  source: z.string().default("manual"),
  collection: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.enum(["user", "agent"]).default("user"),
});

export type TaskFields = z.infer<typeof TaskSchema>;

export interface Task extends TaskFields {
  /** Relative to DATA_DIR, e.g. `tasks/2026-09-10-pset-4.md`. Absent on a draft. */
  path: string;
  body: string;
}

/** The field order every task file is written in, matching the example in §4.1. */
const FIELD_ORDER = [
  "schema", "id", "title", "status", "priority", "estimateMin", "due", "scheduled", "completedAt",
  "category", "context", "tags", "links", "repeat", "repeatUntil", "source", "collection",
  "createdAt", "updatedAt", "createdBy",
] as const;

/** Hand-edited files say `due:` or `due: ""` or `repeat: none`; all three mean "not set". */
function normalize(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const [key, value] of Object.entries(out)) {
    if (value === "" || value === undefined) out[key] = null;
  }
  if (out.repeat === "none") out.repeat = null;
  if (out.due instanceof Date) out.due = null; // YAML parsed a bare date; §4 wants the string form
  return out;
}

/** Fill what §4.1 says a sparse file gets, so a file with only a title still loads. */
function withRepairs(rel: string, data: Record<string, unknown>, mtime: Date): Record<string, unknown> {
  const name = path.basename(rel, ".md");
  const datePrefix = /^(\d{4})-(\d{2})-(\d{2})-/.exec(name);
  const stamp = datePrefix ? `${datePrefix[1]}${datePrefix[2]}${datePrefix[3]}` : mtime.toISOString().slice(0, 10).replace(/-/g, "");
  const fallbackTs = mtime.toISOString();
  return {
    ...data,
    id: data.id ?? `t_${stamp}_${createHash("sha256").update(rel).digest("hex").slice(0, 4)}`,
    title: data.title ?? name.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-/g, " "),
    createdAt: data.createdAt ?? fallbackTs,
    updatedAt: data.updatedAt ?? fallbackTs,
  };
}

export function parseTask(rel: string, text: string, mtime: Date): Task {
  const { data, body } = splitFrontmatter(text);
  const fields = TaskSchema.parse(withRepairs(rel, normalize(data), mtime));
  return { ...fields, path: rel, body };
}

interface CacheEntry {
  mtimeMs: number;
  task: Task;
}

const cache = new Map<string, CacheEntry>();

async function scan(): Promise<{ tasks: Task[]; errors: string[] }> {
  const dir = resolveData(TASKS_DIR);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return { tasks: [], errors: [] };
  }

  const tasks: Task[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const name of entries) {
    if (!name.endsWith(".md") || name.startsWith(".")) continue;
    const rel = `${TASKS_DIR}/${name}`;
    seen.add(rel);

    const info = await stat(path.join(dir, name)).catch(() => null);
    if (!info || !info.isFile()) continue;

    const cached = cache.get(rel);
    if (cached && cached.mtimeMs === info.mtimeMs) {
      tasks.push(cached.task);
      continue;
    }

    try {
      const task = parseTask(rel, await readText(rel), info.mtime);
      cache.set(rel, { mtimeMs: info.mtimeMs, task });
      tasks.push(task);
    } catch {
      cache.delete(rel);
      errors.push(rel);
    }
  }

  for (const rel of [...cache.keys()]) if (!seen.has(rel)) cache.delete(rel);
  return { tasks, errors };
}

/**
 * Every task on disk. Cached by path and mtime, so a repeat call re-parses only what changed.
 * `listTasks.errors` holds the paths skipped by the last scan (§5).
 */
export interface TaskLister {
  (): Promise<Task[]>;
  /** Paths the last scan could not parse. The Today tab shows these as a one-line warning. */
  errors: string[];
}

export const listTasks: TaskLister = Object.assign(
  // Not named `listTasks`: a named function expression binds its own name in its body, which would
  // shadow the const below and hide the `errors` property from it.
  async function scanAll(): Promise<Task[]> {
    const { tasks, errors } = await scan();
    listTasks.errors = errors;
    return tasks.sort((a, b) => a.path.localeCompare(b.path));
  },
  { errors: [] as string[] },
);

export async function readTask(id: string): Promise<Task> {
  const task = (await listTasks()).find((candidate) => candidate.id === id);
  if (!task) throw new StoreError("not_found", `no task with id ${id}`);
  return task;
}

/** Title to filename slug, by the rules in §4.1. `existing` holds slugs already taken. */
export function slugFor(title: string, existing: Set<string>): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  let slug = base;
  if (slug.length > 40) {
    const cut = slug.slice(0, 40);
    const boundary = cut.lastIndexOf("-");
    slug = (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, "");
  }
  if (slug.length === 0) slug = "task";

  let candidate = slug;
  for (let n = 2; existing.has(candidate); n += 1) candidate = `${slug}-${n}`;
  return candidate;
}

/** `t_<YYYYMMDD>_<4 hex>`, regenerated on collision with an existing task. */
export async function newTaskId(): Promise<string> {
  const stamp = todayIn((await readSettings()).timezone).replace(/-/g, "");
  const taken = new Set((await listTasks()).map((task) => task.id));
  for (;;) {
    const id = `t_${stamp}_${randomBytes(2).toString("hex")}`;
    if (!taken.has(id)) return id;
  }
}

/** The path a new task gets: `tasks/<due or today>-<slug>.md`, fixed from here on (Decision 7). */
export async function pathForNewTask(title: string, due: string | null, timezone: string): Promise<string> {
  const existing = new Set(
    (await listTasks()).map((task) => path.basename(task.path, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "")),
  );
  const date = (due ?? "").slice(0, 10) || todayIn(timezone);
  return `${TASKS_DIR}/${date}-${slugFor(title, existing)}.md`;
}

/**
 * Create or replace a task file. `updatedAt` is stamped here — it is the one field a caller never
 * has to set. A task without a `path` is given one; a task with one keeps it.
 */
export async function writeTask(task: Task): Promise<{ path: string }> {
  const timezone = (await readSettings()).timezone;
  const now = nowIso(timezone);
  const rel = task.path || (await pathForNewTask(task.title, task.due, timezone));

  // `path` and `body` describe where the file is and what is under the frontmatter; neither is a
  // field, and a loose schema would happily carry both into the YAML if they were not dropped here.
  const { path: _path, body: _body, ...rest } = task;
  const fields = TaskSchema.parse({ ...rest, createdAt: task.createdAt || now, updatedAt: now });
  const record: Record<string, unknown> = {};
  for (const key of FIELD_ORDER) record[key] = fields[key];
  for (const [key, value] of Object.entries(fields)) {
    if (!(key in record)) record[key] = value; // unknown keys survive a round trip
  }

  await writeText(rel, joinFrontmatter(record, task.body ?? ""));
  cache.delete(rel);
  return { path: rel };
}

export async function deleteTask(id: string): Promise<void> {
  const task = await readTask(id);
  await deleteFile(task.path);
  cache.delete(task.path);
}

/** Drop the mtime cache. Used after an undo rewrites files behind the store's back. */
export function invalidateTaskCache(): void {
  cache.clear();
}
