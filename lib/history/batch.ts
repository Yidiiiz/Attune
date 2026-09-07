// Owns: `runBatch` — the single entry point every mutation in this app goes through (PROJECT.md §1
// rule 6, §7.1) — and the snapshot mechanics undo is built on. Nothing outside `lib/history/` writes
// to `data/`, so this file is the place to look for what changed and why it was allowed to.
//
// Failure behavior: if an action throws, the actions that already ran are rolled back from their
// `before` snapshots newest first, nothing is logged, and the error reaches the caller — a half-
// applied batch is the one outcome undo could not describe. If git fails the batch stays logged with
// `commit: null` and `meta.commitFailed`, still undoable from its inline snapshots, and the sync
// indicator says so.

import { randomBytes } from "node:crypto";
import { joinFrontmatter, splitFrontmatter } from "../store/frontmatter.ts";
import * as chats from "../store/chats.ts";
import * as env from "../store/env.ts";
import * as files from "../store/files.ts";
import * as manifest from "../store/manifest.ts";
import * as settingsStore from "../store/settings.ts";
import * as tasks from "../store/tasks.ts";
import { StoreError } from "../store/paths.ts";
import { findSecret } from "../security/secrets.ts";
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

export interface Store {
  tasks: typeof tasks;
  files: typeof files;
  /** `data/chats/` (§4.7). The chat builders live in `chat-actions.ts` and reach it through here. */
  chats: typeof chats;
  /** `.env.local`, which is not under `data/` and so is not reachable through `files` (§11.5). */
  env: typeof env;
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
  chats,
  env,
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

/** The text a snapshot puts into the log. `{ git: true }` carries none; the commit holds it. */
function snapshotText(snap: Snapshot): string {
  if (snap === null) return "";
  if ("content" in snap) return snap.content;
  if ("fields" in snap) return JSON.stringify(snap.fields);
  return "";
}

interface Rejection {
  where: string;
  pattern: string;
}

/**
 * Everything this batch is about to write into `actions.jsonl`, scanned before a byte of it is
 * written: the summaries and meta that become log fields and mirror lines, the target paths, and
 * both sides of every snapshot.
 *
 * The log is append-only and committed, so a credential reaching it is not an ordinary leak — the
 * pre-commit hook finds it on the *next* commit and refuses every commit after that, and undo does
 * not help because the undo batch snapshots the same text again. Scrubbing is not available here:
 * snapshots exist to restore files byte for byte. So the batch is refused instead, whole, before
 * anything is logged (AGENTS.md hard rules; PROJECT.md Decision 50).
 */
function scanBatch(spec: BatchSpec, applied: Applied[]): Rejection | null {
  const described = [
    spec.summary,
    ...applied.map((step) => step.spec.summary),
    JSON.stringify(spec.meta ?? {}),
  ].join("\n");
  const inDescription = findSecret(described);
  if (inDescription) return { where: "the summary of this change", pattern: inDescription };

  for (const step of applied) {
    for (const rel of step.targets) {
      const inPath = findSecret(rel);
      if (inPath) return { where: rel, pattern: inPath };
    }
    // `before` counts too: deleting a file that already held a credential would copy it into the log
    // on the way out, which is the same deadlock arriving by a politer route.
    for (const snapshots of [step.before, step.after]) {
      for (const [rel, snap] of Object.entries(snapshots)) {
        const hit = findSecret(snapshotText(snap));
        if (hit) return { where: rel, pattern: hit };
      }
    }
  }

  return null;
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
 * push. Everything that writes under `data/` happens before the commit that sweeps it up, so the
 * tree is clean when the batch returns, and this batch's own hash waits for the next one.
 */
export async function runBatch(spec: BatchSpec): Promise<BatchResult> {
  return enqueue(async () => {
    const settings = await settingsStore.readSettings();
    const batch = batchId(settings.timezone);
    const ts = nowIso(settings.timezone);
    const subject = `${spec.commitPrefix}: ${spec.summary}`;
    const willCommit = spec.commit !== false;

    const applied: Applied[] = [];
    try {
      for (const action of spec.actions) {
        applied.push({ spec: action, ...(await action.apply(store)) });
      }
    } catch (err) {
      await rollback(applied);
      throw err;
    }

    // Before anything is logged: refuse the whole batch if it would write a credential under
    // `data/`. Rolling back first means the files are as they were, and the text the caller sent is
    // still the caller's — a rejected save must not cost someone what they wrote (§13.5).
    const rejected = scanBatch(spec, applied);
    if (rejected) {
      await rollback(applied);
      throw new StoreError(
        "secret_rejected",
        `${rejected.where} looks like it contains a credential (${rejected.pattern}). Nothing was ` +
          `written. Move the value to .env.local, or change the text, and save again.`,
      );
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

    const targets = [...new Set(applied.flatMap((step) => step.targets))];
    const seq = entries.map((entry) => entry.seq);

    const offset = await appendActions(entries);
    await regenerateMirror();
    if (!willCommit) return { batch, commit: null, seq, targets };

    let commit: string | null = null;
    const paths = ["data", ...(spec.repoPaths ?? [])];
    try {
      commit = await git.commitPaths(subject, paths);
      if (commit === null) {
        // `data/` is tracked and a log line was just written, so this should be unreachable. If it
        // ever happens the entry says so rather than sitting on an unexplained null.
        await markCommitFailed(offset, batch, "nothing to commit");
      } else if (settings.sync.autoPush) {
        git.schedulePush(settings.sync.pushDebounceMs);
      }
    } catch (err) {
      const message = `${(err as Error).message}`.split("\n")[0].trim();
      console.error(`history: commit failed (${message}); the batch is logged and undoable`);
      await markCommitFailed(offset, batch, message);
    }

    return { batch, commit, seq, targets };
  });
}
