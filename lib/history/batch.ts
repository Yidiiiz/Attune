// Owns: `runBatch` — the single entry point every mutation in this app goes through (PROJECT.md §1
// rule 6, §7.1) — and the snapshot mechanics undo is built on. Nothing outside `lib/history/` writes
// to `data/`, so this file is the place to look for what changed and why it was allowed to.
//
// Failure behavior: if an action throws, the actions that already ran are rolled back from their
// `before` snapshots newest first, nothing is logged, and the error reaches the caller — a half-
// applied batch is the one outcome undo could not describe. If git fails the batch stays logged with
// `commit: null`, still undoable from its inline snapshots, and the sync indicator says so.

import { randomBytes } from "node:crypto";
import { joinFrontmatter, splitFrontmatter } from "../store/frontmatter.ts";
import * as files from "../store/files.ts";
import * as manifest from "../store/manifest.ts";
import * as settingsStore from "../store/settings.ts";
import * as tasks from "../store/tasks.ts";
import { zonedParts, nowIso } from "../schedule/dates.ts";
import * as git from "./git.ts";
import { appendActions, nextSeq, regenerateMirror, setBatchCommit } from "./log.ts";
import type { ActionEntry, ActionType, Snapshot, Snapshots } from "./log.ts";
import { enqueue } from "./queue.ts";

/** Whole-text snapshots stop here; anything larger is reconstructed from the commit instead. */
const INLINE_LIMIT = 64 * 1024;

export interface Store {
  tasks: typeof tasks;
  files: typeof files;
  manifest: typeof manifest;
  settings: typeof settingsStore;
  /** Read the current state of a file in the form `before`/`after` want it. */
  snapshotContent: (rel: string) => Promise<Snapshot>;
  snapshotFields: (rel: string, keys: string[]) => Promise<Snapshot>;
}

export interface ActionSpec {
  type: ActionType;
  summary: string;
  apply: (store: Store) => Promise<{ targets: string[]; before: Snapshots; after: Snapshots }>;
}

export interface BatchSpec {
  actor: "user" | "agent";
  scope: "user" | "project";
  summary: string;
  /**
   * The §8 vocabulary, plus `undo` and `redo`, which §7.2 names as the message form for reversals
   * (`undo: <original summary>`). Those two describe a history operation rather than a kind of data.
   */
  commitPrefix: "task" | "knowledge" | "chat" | "settings" | "file" | "code" | "docs" | "undo" | "redo";
  actions: ActionSpec[];
  /** Default true. False only for the streaming-message path in §8. */
  commit?: boolean;
  /** Paths outside `data/` to include in the commit. Only `code.change` uses this. */
  repoPaths?: string[];
  meta?: Record<string, unknown>;
}

export interface BatchResult {
  batch: string;
  commit: string | null;
  seq: number[];
}

export async function snapshotContent(rel: string): Promise<Snapshot> {
  if (!(await files.exists(rel))) return null;
  if ((await files.byteLength(rel)) > INLINE_LIMIT) return { git: true };
  return { content: await files.readText(rel) };
}

export async function snapshotFields(rel: string, keys: string[]): Promise<Snapshot> {
  if (!(await files.exists(rel))) return null;
  const { data } = splitFrontmatter(await files.readText(rel));
  const fields: Record<string, unknown> = {};
  for (const key of keys) fields[key] = data[key] ?? null;
  return { fields };
}

export const store: Store = {
  tasks,
  files,
  manifest,
  settings: settingsStore,
  snapshotContent,
  snapshotFields,
};

/**
 * Put a file back into the state a snapshot describes. `commit` is needed only by `{ git: true }`,
 * which cannot be reconstructed without one — the UI says so rather than pretending otherwise.
 */
export async function applySnapshot(rel: string, snap: Snapshot, commit: string | null): Promise<void> {
  if (snap === null) {
    await files.deleteFile(rel);
    tasks.invalidateTaskCache();
    return;
  }

  if ("content" in snap) {
    await files.writeText(rel, snap.content);
    tasks.invalidateTaskCache();
    return;
  }

  if ("fields" in snap) {
    const text = (await files.exists(rel)) ? await files.readText(rel) : "";
    const { data, body } = splitFrontmatter(text);
    for (const [key, value] of Object.entries(snap.fields)) data[key] = value;
    await files.writeText(rel, joinFrontmatter(data, body));
    tasks.invalidateTaskCache();
    return;
  }

  if (!commit) {
    throw new Error(`${rel} can only be restored from its commit, and this batch has none`);
  }
  await git.revertPaths(commit, [rel]);
  tasks.invalidateTaskCache();
}

function batchId(timezone: string): string {
  const p = zonedParts(new Date(), timezone);
  return `b_${p.year}${p.month}${p.day}_${p.hour}${p.minute}${p.second}_${randomBytes(2).toString("hex")}`;
}

interface Applied {
  spec: ActionSpec;
  targets: string[];
  before: Snapshots;
  after: Snapshots;
}

async function rollback(applied: Applied[]): Promise<void> {
  for (const step of [...applied].reverse()) {
    for (const [rel, snap] of Object.entries(step.before)) {
      try {
        await applySnapshot(rel, snap, null);
      } catch (err) {
        console.error(`history: could not roll back ${rel} (${(err as Error).message})`);
      }
    }
  }
}

/** §7.1, in order: apply → log → mirror → commit → backfill the hash → schedule the push. */
export async function runBatch(spec: BatchSpec): Promise<BatchResult> {
  return enqueue(async () => {
    const settings = await settingsStore.readSettings();
    const batch = batchId(settings.timezone);
    const ts = nowIso(settings.timezone);

    const applied: Applied[] = [];
    try {
      for (const action of spec.actions) {
        applied.push({ spec: action, ...(await action.apply(store)) });
      }
    } catch (err) {
      await rollback(applied);
      throw err;
    }

    const seqStart = await nextSeq();
    const entries: ActionEntry[] = applied.map((step, index) => ({
      schema: 1,
      seq: seqStart + index,
      ts,
      batch,
      actor: spec.actor,
      scope: spec.scope,
      type: step.spec.type,
      summary: step.spec.summary,
      targets: step.targets,
      before: step.before,
      after: step.after,
      commit: null,
      meta: { ...(spec.meta ?? {}), batchSummary: spec.summary },
    }));

    const offset = await appendActions(entries);
    await regenerateMirror();

    let commit: string | null = null;
    if (spec.commit !== false) {
      const paths = ["data", ...(spec.repoPaths ?? [])];
      try {
        commit = await git.commitPaths(`${spec.commitPrefix}: ${spec.summary}`, paths);
      } catch (err) {
        console.error(`history: commit failed (${(err as Error).message}); the batch is logged and undoable`);
      }
      if (commit) {
        await setBatchCommit(offset, batch, commit);
        await regenerateMirror();
        if (settings.sync.autoPush) git.schedulePush(settings.sync.pushDebounceMs);
      }
    }

    return { batch, commit, seq: entries.map((entry) => entry.seq) };
  });
}
