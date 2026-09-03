// Owns: the ActionSpec builders — the small closures that know how to make one kind of change and
// what to record about it. They live here rather than in `lib/store/` because an ActionSpec is a
// history concept, and a store that imported history types would close a cycle (Decision 46).
//
// Failure behavior: a builder that cannot find its target throws before writing anything, which
// `runBatch` turns into a rolled-back batch and an error the caller can show. Snapshot choice is
// deliberate: a frontmatter-only edit records `fields` so undo restores exactly those keys, and a
// body edit records `content` because there is no smaller honest description of it.

import { nowIso } from "../schedule/dates.ts";
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
