// Owns: `runBatch` — the single entry point every mutation in this app goes through (PROJECT.md §1
// rule 6, §7.1) — and the snapshot mechanics undo is built on. Nothing outside `lib/history/` writes
// to `data/`, so this file is the place to look for what changed and why it was allowed to.
//
// **`data/` is not committed.** It is in `.gitignore`, so a batch that writes only under it is
// logged, mirrored and undoable and never reaches git — `meta.noCommit: true`, and no push is
// scheduled. That is what stops the app's own writes putting the owner's notes on a remote, and it
// is what `README.md` has always said. Only `code.change`, which declares `repoPaths`, commits.
//
// Failure behavior: if an action throws, the actions that already ran are rolled back from their
// `before` snapshots newest first, nothing is logged, and the error reaches the caller — a half-
// applied batch is the one outcome undo could not describe. If git fails the batch stays logged with
// `commit: null` and `meta.commitFailed`, still undoable from its inline snapshots, and the sync
// indicator says so — except that outside production a missing or foreign repository throws, before
// anything is applied (`repository.ts`).

import { randomBytes } from "node:crypto";
import { joinFrontmatter, splitFrontmatter } from "../store/frontmatter.ts";
import * as chats from "../store/chats.ts";
import * as env from "../store/env.ts";
import * as files from "../store/files.ts";
import * as knowledge from "../store/knowledge.ts";
import * as manifest from "../store/manifest.ts";
import * as settingsStore from "../store/settings.ts";
import * as tasks from "../store/tasks.ts";
import { StoreError } from "../store/paths.ts";
import { looksLikeText } from "../security/raw.ts";
import { refuseBatch, unloggedTexts } from "./scan.ts";
import { commitExclusions } from "./in-flight.ts";
import { zonedParts, nowIso } from "../schedule/dates.ts";
import * as git from "./git.ts";
import {
  appendActions,
  markCommitFailed,
  nextSeq,
  pendingCommit,
  readLogText,
  regenerateMirror,
  setBatchCommit,
} from "./log.ts";
import type { ActionEntry, ActionType, Snapshot, Snapshots } from "./log.ts";
import { enqueue } from "./queue.ts";

/** Whole-text snapshots stop here; anything larger is reconstructed from the commit instead. */
const INLINE_LIMIT = 64 * 1024;

const PRODUCTION = process.env.NODE_ENV === "production";

export interface Store {
  tasks: typeof tasks;
  files: typeof files;
  /** `data/chats/` (§4.7). The chat builders live in `chat-actions.ts` and reach it through here. */
  chats: typeof chats;
  /** `.env.local`, which is not under `data/` and so is not reachable through `files` (§11.5). */
  env: typeof env;
  manifest: typeof manifest;
  /** `data/knowledge/` (§4.2–§4.6), reached by the builders in `knowledge-actions.ts`. */
  knowledge: typeof knowledge;
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
  /** The turn whose streaming files this batch finalizes: the only batch that may write them. */
  turn?: string;
  /** Paths outside `data/` to include in the commit. Only `code.change` uses this. */
  repoPaths?: string[];
  meta?: Record<string, unknown>;
}

export interface BatchResult {
  batch: string;
  /**
   * The hash of the commit this batch made, read back for the caller. The log's own `commit` field
   * is still null at this point and is filled in by the next batch (Decision 47); this is a read,
   * not a write, so handing it back costs the working tree nothing.
   */
  commit: string | null;
  seq: number[];
  /**
   * Every path this batch wrote, in action order, first occurrence kept. A caller that needs to
   * name what it just created — the upload route, whose paths are content-hashed and so are not
   * knowable before the write — reads them here rather than recomputing them.
   */
  targets: string[];
}

/**
 * The bytes behind each `{ git: true }` snapshot this batch took, first capture per path kept. The log
 * carries none of them and the commit does not exist yet, so a batch refused after applying could not
 * otherwise put such a file back; `rollback` writes these instead. Cleared as each batch starts,
 * which the queue runs one at a time.
 */
const held = new Map<string, Buffer>();

/**
 * A file's snapshot: its text inline when it is text and small, else `{ git: true }` with the bytes
 * held for rollback. A binary is `{ git: true }` at any size — as text it would be decoded lossily
 * and written back through the text path, which is how a restored image would come back corrupted.
 */
export async function snapshotContent(rel: string): Promise<Snapshot> {
  if (!(await files.exists(rel))) return null;
  const bytes = await files.readBinary(rel);
  if (bytes.length > INLINE_LIMIT || !looksLikeText(bytes)) {
    if (!held.has(rel)) held.set(rel, bytes);
    return { git: true };
  }
  return { content: bytes.toString("utf8") };
}

export async function snapshotFields(rel: string, keys: string[]): Promise<Snapshot> {
  if (!(await files.exists(rel))) return null;
  const { data } = splitFrontmatter(await files.readText(rel));
  const fields: Record<string, unknown> = {};
  for (const key of keys) fields[key] = data[key] ?? null;
  return { fields };
}

export const store: Store = {
  tasks, files, chats, env, manifest, knowledge, settings: settingsStore, snapshotContent, snapshotFields,
};

/**
 * Put a file back into the state a snapshot describes. `commit` is needed only by `{ git: true }`,
 * which cannot be reconstructed without one — the UI says so rather than pretending otherwise.
 * **A data path's `{ git: true }` is therefore unrestorable now**, because a data batch has no
 * commit: it throws the named error below rather than restoring the wrong bytes. Nothing has ever
 * produced one here (it takes an upload or over 64 KB of text), and the blob store that replaces it
 * is filed against Phase 8b in AGENTS.md. Which
 * side of the batch it was is what picks the revision: a `before` is the file as it was in the commit's
 * parent, an `after` as it was in the commit. `rel` is `data/`-relative unless `repoRelative` says it
 * is a repository path, which only `code.change` targets are.
 */
export async function applySnapshot(
  rel: string,
  snap: Snapshot,
  commit: string | null,
  side: "before" | "after" = "before",
  repoRelative = false,
): Promise<void> {
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
  await git.restorePaths(side === "before" ? `${commit}^` : commit, [repoRelative ? rel : `data/${rel}`]);
  tasks.invalidateTaskCache();
}

function batchId(timezone: string): string {
  const p = zonedParts(new Date(), timezone);
  return `b_${p.year}${p.month}${p.day}_${p.hour}${p.minute}${p.second}_${randomBytes(2).toString("hex")}`;
}

export interface Applied {
  spec: ActionSpec;
  targets: string[];
  before: Snapshots;
  after: Snapshots;
}

async function rollback(applied: Applied[]): Promise<void> {
  for (const step of [...applied].reverse()) {
    for (const [rel, snap] of Object.entries(step.before)) {
      try {
        const bytes = snap !== null && "git" in snap ? held.get(rel) : undefined;
        if (bytes === undefined) await applySnapshot(rel, snap, null);
        else await files.writeBinary(rel, bytes);
      } catch (err) {
        console.error(`history: could not roll back ${rel} (${(err as Error).message})`);
      }
    }
  }
}

/**
 * Fill in the hash of the batch before this one. Deferring the backfill by a batch is what keeps the
 * working tree clean (Decision 47); the subject check is what keeps it correct, because HEAD is not
 * always the pending batch's commit — that commit may have failed, or one may have been made by hand
 * in between. On a mismatch the null is left alone: a null is still recoverable from HEAD later, and
 * a wrong hash would not be recoverable at all.
 */
async function backfillPrevious(): Promise<void> {
  try {
    const pending = pendingCommit(await readLogText());
    if (!pending) return;

    const head = await git.headCommit();
    if (!head || head.subject !== pending.subject) return;

    await setBatchCommit(pending.offset, pending.batch, head.hash);
  } catch (err) {
    // A missing hash costs one mirror line its suffix. It must never cost the batch about to run.
    console.error(`history: could not backfill the previous hash (${(err as Error).message})`);
  }
}

/**
 * §7.1, in order: apply → backfill the previous batch's hash → log → mirror → commit → schedule the
 * push. A batch with no repository path stops at the mirror, which is every batch the app runs
 * today; one that has them commits only those, and this batch's own hash waits for the next one.
 */
export async function runBatch(spec: BatchSpec): Promise<BatchResult> {
  return enqueue(async () => {
    held.clear(); // the queue runs one batch at a time, so this is the only batch holding any
    const settings = await settingsStore.readSettings();
    const batch = batchId(settings.timezone);
    const ts = nowIso(settings.timezone);
    const subject = `${spec.commitPrefix}: ${spec.summary}`;
    // `data/` is ignored, so a batch whose every write is under it has nothing git could commit:
    // `git add -A -- data` refuses an ignored pathspec outright, and the commit after it fails on
    // `pathspec 'data' did not match any file(s) known to git` — a hard failure, not an empty
    // commit. Rather than reach git to be told that, such a batch takes the non-committing path §8
    // already has: `meta.noCommit: true`, no subject to backfill, and `schedulePush` never reached,
    // which is what keeps the app's own writes off any remote. A batch carrying repository paths —
    // `code.change`, which is the only thing that sets `repoPaths` — still commits them and still
    // pushes. Structural on purpose: it does not ask git whether `data/` is ignored, so a checkout
    // that forgot the line does not quietly start committing data again, and the suite exercises
    // the same path the app takes.
    const repoPaths = spec.repoPaths ?? [];
    const willCommit = spec.commit !== false && repoPaths.length > 0;

    // Outside production, a missing or foreign repository is a bug in whatever set this checkout up,
    // so it is refused before a byte lands rather than logged as `commit: null` (`repository.ts`).
    // Keyed to §8's streaming bypass rather than to `willCommit`: almost no batch reaches git
    // now, and an invariant that holds only when a `code.change` happens by is not the one that
    // caught 232 commits landing in a repository in the home folder.
    if (spec.commit !== false && !PRODUCTION) await git.assertOwnRepository();

    const applied: Applied[] = [];
    try {
      for (const action of spec.actions) {
        applied.push({ spec: action, ...(await action.apply(store)) });
      }
    } catch (err) {
      await rollback(applied);
      throw err;
    }

    const targets = [...new Set(applied.flatMap((step) => step.targets))];

    // Before anything is logged: refuse the whole batch if it would write a credential under
    // `data/`, or write into a reply another turn is still streaming (`scan.ts`). Rolling back first
    // means the files are as they were, and the text the caller sent is still the caller's — a
    // rejected save must not cost someone what they wrote (§13.5).
    const unlogged = await unloggedTexts(applied, files.readBinary).catch(async (err: unknown) => {
      await rollback(applied); // a file that cannot be scanned cannot be committed either
      throw err;
    });
    const refused = refuseBatch(spec, applied, targets, unlogged);
    if (refused) {
      await rollback(applied);
      throw new StoreError(refused.code, refused.message);
    }

    await backfillPrevious();

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
      meta: {
        ...(spec.meta ?? {}),
        batchSummary: spec.summary,
        // Either the subject the next batch's backfill must match, or the marker saying this batch
        // was never going to have a hash. Every null in the log explains itself (Decision 47).
        ...(willCommit ? { commitSubject: subject } : { noCommit: true }),
      },
    }));

    const seq = entries.map((entry) => entry.seq);

    const offset = await appendActions(entries);
    await regenerateMirror();

    // For every batch except §8's streaming bypass, whether or not it reaches git: this call is
    // also what ends a finalizing batch's hold on its own turn's files, and that lifetime must not
    // start depending on whether the batch had a repository path to commit (`in-flight.ts`). What
    // it returns protects nothing now — no data path is ever staged — so only the bookkeeping is
    // left, and `in-flight.ts` guards §8's rule for repository paths alone, which never stream.
    if (spec.commit !== false) await commitExclusions(targets, spec.turn);
    if (!willCommit) return { batch, commit: null, seq, targets };

    let commit: string | null = null;
    try {
      const expected = PRODUCTION ? undefined : repoPaths;
      commit = await git.commitPaths(subject, repoPaths, [], expected);
      if (commit === null) {
        // Every path here is a declared repository path, so this is a `code.change` that changed
        // nothing. The entry says so rather than sitting on an unexplained null.
        await markCommitFailed(offset, batch, "nothing to commit");
      } else if (settings.sync.autoPush) {
        git.schedulePush(settings.sync.pushDebounceMs);
      }
    } catch (err) {
      const message = `${(err as Error).message}`.split("\n")[0].trim();
      console.error(`history: commit failed (${message}); the batch is logged and undoable`);
      await markCommitFailed(offset, batch, message);
      if (err instanceof git.RepositoryError && !PRODUCTION) throw err;
    }

    return { batch, commit, seq, targets };
  });
}
