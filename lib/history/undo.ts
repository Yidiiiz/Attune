// Owns: reversing a batch and putting it back (PROJECT.md §7.2). The decisions — is this batch
// undoable, is it redoable, did anything later touch the same files — are pure functions over the
// log so they can be tested without a filesystem; the applying half runs through `runBatch`, so an
// undo is itself a logged, committed, reversible action like everything else.
//
// Failure behavior: refuses rather than guesses. A batch whose files a later batch has touched
// returns its conflicting batch ids and writes nothing until the caller passes `force`; a batch
// already undone returns a reason. Nothing here truncates or rewrites history (§7.2).

import { applySnapshot, runBatch } from "./batch.ts";
import * as git from "./git.ts";
import { groupBatches, readActions } from "./log.ts";
import type { Batch, Snapshots } from "./log.ts";

export interface UndoResult {
  ok: boolean;
  batch?: string;
  commit?: string | null;
  /** Batch ids that touched the same files after this one. Present only when the undo was refused. */
  conflict?: string[];
  reason?: string;
}

const targetsOf = (batch: Batch): string[] => batch.entries.flatMap((entry) => entry.targets);

/** The undo/redo entries pointing at `batchId`, oldest first. */
function historyFor(batches: Batch[], batchId: string): Batch[] {
  return batches.filter(
    (batch) =>
      (batch.type === "undo" && batch.entries[0]?.meta?.undoes === batchId) ||
      (batch.type === "redo" && batch.entries[0]?.meta?.redoes === batchId),
  );
}

export interface UndoState {
  undoable: boolean;
  redoable: boolean;
  reason?: string;
}

/**
 * §7.2: a batch is undoable unless the latest undo/redo pointing at it is an undo; it is redoable
 * only in the mirror-image case. New actions never clear either — the check simply reports.
 */
export function undoState(batches: Batch[], batchId: string): UndoState {
  if (!batches.some((batch) => batch.batch === batchId)) {
    return { undoable: false, redoable: false, reason: `no batch ${batchId}` };
  }

  const related = historyFor(batches, batchId);
  const latest = related[related.length - 1];
  if (latest?.type === "undo") {
    return { undoable: false, redoable: true, reason: "already undone" };
  }
  return { undoable: true, redoable: false, reason: latest ? undefined : "never undone" };
}

/** Batches after `batchId` that touched any of its files, ignoring its own undo/redo entries. */
export function findConflicts(batches: Batch[], batchId: string): string[] {
  const index = batches.findIndex((batch) => batch.batch === batchId);
  if (index < 0) return [];

  const touched = new Set(targetsOf(batches[index]));
  const own = new Set(historyFor(batches, batchId).map((batch) => batch.batch));

  return batches
    .slice(index + 1)
    .filter((batch) => !own.has(batch.batch) && targetsOf(batch).some((rel) => touched.has(rel)))
    .map((batch) => batch.batch);
}

async function load(batchId: string): Promise<{ batches: Batch[]; target: Batch | undefined }> {
  const batches = groupBatches(await readActions());
  return { batches, target: batches.find((batch) => batch.batch === batchId) };
}

/**
 * The newest batch's hash is filled in by the batch after it (Decision 47), so undoing the newest
 * `code.change` would meet `commit: null` and a `{ git: true }` snapshot it cannot restore without
 * one. Resolve it from HEAD under the same subject guard the backfill uses; a batch that is null for
 * any other reason — never committing, or a failed commit — has no hash to find.
 */
async function resolveCommit(target: Batch): Promise<string | null> {
  if (target.commit) return target.commit;
  if (target.commitState !== "pending") return null;

  const subject = target.entries[0]?.meta?.commitSubject;
  if (typeof subject !== "string" || subject.length === 0) return null;

  const head = await git.headCommit();
  return head && head.subject === subject ? head.hash : null;
}

/**
 * Apply the inverse of every action in `target`, newest first, as one new logged batch.
 * `direction` picks which side of each entry's snapshots is restored. `commit` stands in for a log
 * line whose hash has not been backfilled yet.
 */
function reverseAction(target: Batch, direction: "undo" | "redo", commit: string | null) {
  return {
    type: direction,
    summary: target.summary,
    apply: async () => {
      const ordered = direction === "undo" ? [...target.entries].reverse() : target.entries;
      const targets: string[] = [];
      const before: Snapshots = {};
      const after: Snapshots = {};

      for (const entry of ordered) {
        const restore = direction === "undo" ? entry.before : entry.after;
        const current = direction === "undo" ? entry.after : entry.before;
        for (const [rel, snap] of Object.entries(restore)) {
          if (!targets.includes(rel)) targets.push(rel);
          before[rel] = current[rel] ?? null;
          await applySnapshot(rel, snap, entry.commit ?? commit);
          after[rel] = snap;
        }
      }

      return { targets, before, after };
    },
  } as const;
}

export async function undoBatch(batchId: string, opts: { force?: boolean } = {}): Promise<UndoResult> {
  const { batches, target } = await load(batchId);
  if (!target) return { ok: false, reason: `no batch ${batchId}` };

  const state = undoState(batches, batchId);
  if (!state.undoable) return { ok: false, reason: state.reason };

  const conflict = findConflicts(batches, batchId);
  if (conflict.length > 0 && !opts.force) return { ok: false, conflict };

  const commit = await resolveCommit(target);
  const result = await runBatch({
    actor: "user",
    scope: target.scope,
    summary: target.summary,
    commitPrefix: "undo",
    meta: { undoes: batchId },
    actions: [reverseAction(target, "undo", commit)],
  });
  return { ok: true, batch: result.batch, commit: result.commit };
}

export async function redoBatch(batchId: string): Promise<UndoResult> {
  const { batches, target } = await load(batchId);
  if (!target) return { ok: false, reason: `no batch ${batchId}` };

  const state = undoState(batches, batchId);
  if (!state.redoable) return { ok: false, reason: state.reason ?? "redo unavailable" };

  const commit = await resolveCommit(target);
  const result = await runBatch({
    actor: "user",
    scope: target.scope,
    summary: target.summary,
    commitPrefix: "redo",
    meta: { redoes: batchId },
    actions: [reverseAction(target, "redo", commit)],
  });
  return { ok: true, batch: result.batch, commit: result.commit };
}
