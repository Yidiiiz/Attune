// Owns: the ActionSpec builders — the small closures that know how to make one kind of change and
// what to record about it. They live here rather than in `lib/store/` because an ActionSpec is a
// history concept, and a store that imported history types would close a cycle (Decision 46).
//
// Failure behavior: a builder that cannot find its target throws before writing anything, which
// `runBatch` turns into a rolled-back batch and an error the caller can show. Snapshot choice is
// deliberate: a frontmatter-only edit records `fields` so undo restores exactly those keys, and a
// body edit records `content` because there is no smaller honest description of it.

import { z } from "zod";
import { advanceDate, datePart, nowIso } from "../schedule/dates.ts";
import { ENV_TARGET, StoreError } from "../store/paths.ts";
import type { ActionSpec, Store } from "./batch.ts";
import type { Snapshots } from "./log.ts";
import type { Task, TaskFields } from "../store/tasks.ts";
import type { Settings } from "../store/settings.ts";

/**
 * The fields a caller may set. Spelled out rather than derived from `TaskFields`, because that type
 * carries the index signature a loose zod object implies, and `Omit` over one widens every field to
 * `unknown`. Explicit is also what a route validating input against this wants to read.
 */
export interface TaskInput {
  status?: TaskFields["status"];
  priority?: TaskFields["priority"];
  estimateMin?: TaskFields["estimateMin"];
  due?: TaskFields["due"];
  scheduled?: TaskFields["scheduled"];
  completedAt?: TaskFields["completedAt"];
  category?: TaskFields["category"];
  context?: TaskFields["context"];
  tags?: TaskFields["tags"];
  links?: TaskFields["links"];
  repeat?: TaskFields["repeat"];
  repeatUntil?: TaskFields["repeatUntil"];
  source?: TaskFields["source"];
  collection?: TaskFields["collection"];
  createdBy?: TaskFields["createdBy"];
  body?: string;
}

export type TaskDraft = TaskInput & { title: string };

/**
 * The same fields as `TaskInput`, as something a route can validate an untrusted body against —
 * §9.4's "the task frontmatter minus `id`, timestamps and `createdBy`". `title` is the only one
 * that must be present; every other field absent means "leave it at the store's default", which is
 * what makes a one-line quick-add and a fully specified draft the same request shape.
 *
 * `lib/agent/tools.ts` derives the model-facing version from this one with `.required()`, so the
 * list of fields a task can have is written down once and the two audiences cannot drift apart.
 */
export const TaskDraftSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  status: z.enum(["todo", "doing", "done", "archived"]).optional(),
  priority: z.number().int().min(1).max(4).optional(),
  estimateMin: z.number().int().nullable().optional(),
  due: z.string().nullable().optional(),
  scheduled: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  links: z.array(z.string()).optional(),
  repeat: z.enum(["daily", "weekly", "biweekly", "monthly"]).nullable().optional(),
  repeatUntil: z.string().nullable().optional(),
  collection: z.string().nullable().optional(),
});

export type TaskChanges = TaskInput & { title?: string };

const single = (rel: string, snap: Snapshots[string]): Snapshots => ({ [rel]: snap });

/** Create one task file. Undo deletes it, because `before` is null. */
export function createTask(draft: TaskDraft): ActionSpec {
  return {
    type: "task.create",
    summary: `Add '${draft.title}'`,
    apply: async (store: Store) => {
      const { body, ...fields } = draft;
      const timezone = (await store.settings.readSettings()).timezone;
      const now = nowIso(timezone);
      const id = await store.tasks.newTaskId();
      const rel = await store.tasks.pathForNewTask(draft.title, draft.due ?? null, timezone);

      const parsed = store.tasks.TaskSchema.parse({ ...fields, id, createdAt: now, updatedAt: now });
      await store.tasks.writeTask({ ...parsed, path: rel, body: body ?? "" } as Task);

      return {
        targets: [rel],
        before: single(rel, null),
        after: single(rel, await store.snapshotContent(rel)),
      };
    },
  };
}

/**
 * Change fields on an existing task. `updatedAt` is always part of the snapshot: without it, undo
 * would restore the old values under a timestamp claiming they were never touched.
 */
export function updateTask(id: string, changes: TaskChanges, summary?: string): ActionSpec {
  return {
    type: "task.update",
    summary: summary ?? `Update '${id}'`,
    apply: async (store: Store) => {
      const task = await store.tasks.readTask(id);
      const { body, ...fields } = changes;
      const rel = task.path;
      const touchesBody = body !== undefined;

      const keys = [...Object.keys(fields), "updatedAt"];
      const before = touchesBody
        ? await store.snapshotContent(rel)
        : await store.snapshotFields(rel, keys);

      await store.tasks.writeTask({ ...task, ...fields, body: body ?? task.body });

      const after = touchesBody
        ? await store.snapshotContent(rel)
        : await store.snapshotFields(rel, keys);

      return { targets: [rel], before: single(rel, before), after: single(rel, after) };
    },
  };
}

/** Delete one task file. `before` carries the whole text, so undo puts it back verbatim. */
export function deleteTask(id: string, summary?: string): ActionSpec {
  return {
    type: "task.delete",
    summary: summary ?? `Delete '${id}'`,
    apply: async (store: Store) => {
      const task = await store.tasks.readTask(id);
      const rel = task.path;
      const before = await store.snapshotContent(rel);
      await store.tasks.deleteTask(id);
      return { targets: [rel], before: single(rel, before), after: single(rel, null) };
    },
  };
}

/**
 * The next occurrence of a repeating task, or null when there is not going to be one (§4.1).
 *
 * Pure and exported so the complete route can decide whether its batch needs a second action
 * without reaching into the store twice. Two cases return null besides "no repeat":
 *
 * - **No `due` and no `scheduled`.** There is nothing to advance from. A repeat rule describes an
 *   interval between dates, and inventing an anchor from the completion time would quietly turn
 *   "every Monday" into "every seven days from whenever I got round to it".
 * - **Past `repeatUntil`.** The series has ended, which is the whole point of the field.
 */
export function nextInstance(task: Task): TaskDraft | null {
  if (task.repeat === null) return null;

  const due = task.due === null ? null : advanceDate(task.due, task.repeat);
  const scheduled = task.scheduled === null ? null : advanceDate(task.scheduled, task.repeat);
  const anchor = due ?? scheduled;
  if (anchor === null) return null;
  if (task.repeatUntil && datePart(anchor) > datePart(task.repeatUntil)) return null;

  return {
    title: task.title,
    status: "todo",
    priority: task.priority,
    estimateMin: task.estimateMin,
    due,
    scheduled,
    category: task.category,
    context: task.context,
    tags: [...task.tags],
    links: [...task.links],
    repeat: task.repeat,
    repeatUntil: task.repeatUntil,
    // `source` records where the work came from, so it carries forward (§4.1). `collection` does
    // not: it is a one-to-one backlink to the list item that became a task, and the collection's
    // own `tasks` array holds only the first instance. Two tasks pointing at the same item would
    // be a broken link in both directions.
    source: task.source,
    collection: null,
    createdBy: task.createdBy,
    // Checkboxes come back unticked: the subtasks are the work, and the work is ahead again.
    body: task.body.replace(/^(\s*[-*]\s*\[)[xX](\])/gm, "$1 $2"),
  };
}

/**
 * Mark one task done. The next instance of a repeating task is a separate `task.create` action in
 * the same batch (§14), built from `nextInstance` by the caller — which is what makes one undo
 * remove both: they share a batch, and undo reverses a batch whole.
 *
 * Snapshots are field-level, so undoing a completion restores exactly `status`, `completedAt` and
 * `updatedAt` and leaves anything edited since alone.
 */
export function completeTask(id: string, summary?: string): ActionSpec {
  return {
    type: "task.complete",
    summary: summary ?? `Complete '${id}'`,
    apply: async (store: Store) => {
      const task = await store.tasks.readTask(id);
      if (task.status === "done") {
        throw new StoreError("invalid", `'${task.title}' is already complete`);
      }

      const rel = task.path;
      const keys = ["status", "completedAt", "updatedAt"];
      const before = await store.snapshotFields(rel, keys);
      const completedAt = nowIso((await store.settings.readSettings()).timezone);

      await store.tasks.writeTask({ ...task, status: "done", completedAt });

      return {
        targets: [rel],
        before: single(rel, before),
        after: single(rel, await store.snapshotFields(rel, keys)),
      };
    },
  };
}

/** Replace settings.json. Whole-file snapshots: it is one small file and unknown keys must survive. */
export function updateSettings(next: Settings, summary: string): ActionSpec {
  return {
    type: "settings.update",
    summary,
    apply: async (store: Store) => {
      const rel = store.settings.SETTINGS_PATH;
      const before = await store.snapshotContent(rel);
      await store.settings.writeSettings(next);
      return {
        targets: [rel],
        before: single(rel, before),
        after: single(rel, await store.snapshotContent(rel)),
      };
    },
  };
}

/**
 * Store one upload and re-index it (§4.8, §9.2). Two targets, because `addFile` regenerates the
 * manifest as part of storing the file and a batch that named only one of them would leave the
 * other outside undo.
 *
 * The uploaded bytes are snapshotted as `{ git: true }`, not inline: they are binary and the inline
 * path is text (§7.1 says that snapshot is for code changes and binaries). Undo still needs no
 * commit, because `before` is null and null means delete. A re-upload of bytes already stored
 * writes nothing, so it snapshots nothing and only the manifest moves; the file stays in `targets`,
 * where the conflict check can see it.
 */
export function addFile(
  kind: "images" | "docs" | "other",
  name: string,
  bytes: Buffer,
  source: string,
): ActionSpec {
  return {
    type: "file.add",
    summary: `Add '${name}'`,
    apply: async (store: Store) => {
      const manifestPath = "files/index.md";
      const manifestBefore = await store.snapshotContent(manifestPath);
      const { rel, created } = await store.manifest.addFile(kind, name, bytes, source);

      return {
        targets: [rel, manifestPath],
        before: { ...(created ? { [rel]: null } : {}), [manifestPath]: manifestBefore },
        after: {
          ...(created ? { [rel]: { git: true } as const } : {}),
          [manifestPath]: await store.snapshotContent(manifestPath),
        },
      };
    },
  };
}

/**
 * Set or remove one API key (§11.5). The snapshots record the key's *name* and whether it was set —
 * never the value — which is what keeps a credential out of an append-only, committed log.
 *
 * Two consequences are deliberate. The batch runs with `commit: false`, because `.env.local` is
 * git-ignored. And the entry is not undoable: `undoBatch` refuses it, because "set" is not a value
 * anything could restore (§7.2, Decision 58). Logging enough to undo is the thing this prevents.
 */
export function setKey(name: string, value: string | null): ActionSpec {
  return {
    type: "settings.update",
    summary: value === null ? `Remove ${name}` : `Set ${name}`,
    apply: async (store: Store) => {
      const had = (await store.env.readKey(name)) !== null;
      await store.env.writeKey(name, value);
      return {
        targets: [ENV_TARGET],
        before: single(ENV_TARGET, { fields: { [name]: had ? "set" : "unset" } }),
        after: single(ENV_TARGET, { fields: { [name]: value === null ? "unset" : "set" } }),
      };
    },
  };
}
