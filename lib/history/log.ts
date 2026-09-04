// Owns: `data/history/actions.jsonl` — the record of everything that has ever changed — and the
// human-readable mirror beside it (PROJECT.md §4.11, §7.3). Entries are append-only. The one
// in-place edit is filling the `commit` field of lines written moments earlier, once git has told
// us the hash; that is done by rewriting the file from the offset those lines began at.
//
// That edit is deferred by one batch, so nothing under `data/` is written after the commit that
// contains it: a batch appends its entries with `commit: null`, and the *next* batch fills in that
// hash before appending its own. The working tree is clean after every successful batch, and the
// newest batch is the only one whose hash is outstanding (Decision 47).
//
// Failure behavior: a line that will not parse is skipped rather than fatal, and its absence costs
// exactly one undoable batch. A mirror that cannot be regenerated is logged and swallowed: the
// mirror is a view, and losing it must never cost the entry it describes.

import { appendText, byteLength, readTail, readText, replaceTail, writeText } from "../store/files.ts";
import { splitLocalIso } from "../schedule/dates.ts";

export const LOG_PATH = "history/actions.jsonl";
export const MIRROR_PATH = "history/action-history.md";

export type ActionType =
  | "task.create" | "task.update" | "task.delete" | "task.complete"
  | "knowledge.write"
  | "chat.create" | "chat.message" | "chat.update" | "chat.delete"
  | "annotation.write"
  | "file.add" | "file.write"
  | "settings.update"
  | "code.change"
  | "undo" | "redo";

/** §4.11. `fields` undoes by re-applying keys, `content` by rewriting the file, `git` by revert. */
export type Snapshot =
  | { fields: Record<string, unknown> }
  | { content: string }
  | { git: true }
  | null;

export type Snapshots = Record<string, Snapshot>;

export interface ActionEntry {
  schema: number;
  seq: number;
  ts: string;
  batch: string;
  actor: "user" | "agent";
  scope: "user" | "project";
  type: ActionType;
  summary: string;
  targets: string[];
  before: Snapshots;
  after: Snapshots;
  commit: string | null;
  meta: Record<string, unknown>;
}

export interface Batch {
  batch: string;
  ts: string;
  actor: "user" | "agent";
  scope: "user" | "project";
  type: ActionType;
  summary: string;
  commit: string | null;
  /** Why `commit` is what it is, so §7.5 can say so instead of inferring it from a bare null. */
  commitState: CommitState;
  entries: ActionEntry[];
}

/**
 * `pending` — the hash is coming from the next batch's backfill.
 * `never` — the batch ran with `commit: false` and was never going to have one.
 * `failed` — git refused; `meta.commitError` says what it said.
 */
export type CommitState = "committed" | "pending" | "never" | "failed";

/** Read the marker `runBatch` wrote at the moment it knew why there would be no hash. */
export function nullReason(entry: ActionEntry): CommitState {
  if (entry.meta?.noCommit === true) return "never";
  if (entry.meta?.commitFailed === true) return "failed";
  return "pending";
}

/** The raw log. Missing is not an error: an empty history and no history read the same. */
export async function readLogText(): Promise<string> {
  try {
    return await readText(LOG_PATH);
  } catch {
    return "";
  }
}

export async function readActions(): Promise<ActionEntry[]> {
  const text = await readLogText();

  const entries: ActionEntry[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    // a torn or hand-mangled line is skipped, not fatal: the rest of the history stays readable
    const entry = parseLine(line);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Group entries into batches, oldest first. The summary of a batch is its first action's. */
export function groupBatches(entries: ActionEntry[]): Batch[] {
  const order: string[] = [];
  const byId = new Map<string, Batch>();

  for (const entry of entries) {
    let batch = byId.get(entry.batch);
    if (!batch) {
      batch = {
        batch: entry.batch,
        ts: entry.ts,
        actor: entry.actor,
        scope: entry.scope,
        type: entry.type,
        // A batch of six task creations is one line in the mirror, and that line should say what the
        // batch did, not what its first action did. runBatch stores the batch summary in meta.
        summary: typeof entry.meta?.batchSummary === "string" ? entry.meta.batchSummary : entry.summary,
        commit: entry.commit,
        commitState: entry.commit ? "committed" : nullReason(entry),
        entries: [],
      };
      byId.set(entry.batch, batch);
      order.push(entry.batch);
    }
    batch.entries.push(entry);
    if (entry.commit) {
      batch.commit = entry.commit;
      batch.commitState = "committed";
    }
  }

  return order.map((id) => byId.get(id) as Batch);
}

export async function nextSeq(): Promise<number> {
  const entries = await readActions();
  return entries.reduce((max, entry) => Math.max(max, entry.seq), 0) + 1;
}

/**
 * Append entries and return the byte offset they start at, which is what `setBatchCommit` needs to
 * rewrite exactly those lines and nothing earlier.
 */
export async function appendActions(entries: ActionEntry[]): Promise<number> {
  const offset = await byteLength(LOG_PATH);
  await appendText(LOG_PATH, entries.map((entry) => `${JSON.stringify(entry)}\n`).join(""));
  return offset;
}

function parseLine(line: string): ActionEntry | null {
  try {
    return JSON.parse(line) as ActionEntry;
  } catch {
    return null;
  }
}

/** Where a batch's lines begin, and what its commit message must say for a hash to be its own. */
export interface PendingCommit {
  batch: string;
  subject: string;
  /** Byte offset of the batch's first line, so a rewrite touches nothing earlier. */
  offset: number;
}

/**
 * The one batch whose hash is still outstanding: the newest run of `commit: null` lines, grouped by
 * batch id, and only the last of those groups. Older nulls are permanent — a batch that ran with
 * `commit: false`, or one whose commit failed — and stamping one with a later batch's hash would be
 * worse than leaving it null, because a null is visibly unresolved and a wrong hash is not.
 */
export function pendingCommit(text: string): PendingCommit | null {
  const lines = text.split("\n");
  const offsets: number[] = [];
  let at = 0;
  for (const line of lines) {
    offsets.push(at);
    at += Buffer.byteLength(line, "utf8") + 1; // the newline every append writes
  }

  let end = lines.length - 1;
  while (end >= 0 && lines[end].trim().length === 0) end -= 1;
  if (end < 0) return null;

  const last = parseLine(lines[end]);
  if (!last || last.commit || nullReason(last) !== "pending") return null;

  // Without the subject there is nothing to check a hash against, and an unchecked hash is the
  // failure this whole mechanism exists to avoid.
  const subject = last.meta?.commitSubject;
  if (typeof subject !== "string" || subject.length === 0) return null;

  let start = end;
  for (let i = end - 1; i >= 0; i -= 1) {
    if (lines[i].trim().length === 0) continue;
    const entry = parseLine(lines[i]);
    if (!entry || entry.batch !== last.batch) break;
    start = i;
  }

  return { batch: last.batch, subject, offset: offsets[start] };
}

/**
 * The log's one in-place edit: complete the lines at `offset` and after that belong to `batch`.
 * Entries are never added or removed here, only filled in.
 */
async function rewriteTail(
  offset: number,
  batch: string,
  patch: (entry: ActionEntry) => void,
): Promise<void> {
  const tail = await readTail(LOG_PATH, offset);
  if (tail.length === 0) return;

  const patched = tail
    .split("\n")
    .map((line) => {
      if (line.trim().length === 0) return line;
      const entry = parseLine(line);
      if (!entry || entry.batch !== batch) return line;
      patch(entry);
      return JSON.stringify(entry);
    })
    .join("\n");

  await replaceTail(LOG_PATH, offset, patched);
}

/** Fill in `commit` on a batch's lines, once the batch after it has read the hash back from git. */
export async function setBatchCommit(offset: number, batch: string, commit: string): Promise<void> {
  await rewriteTail(offset, batch, (entry) => {
    if (!entry.commit) entry.commit = commit;
  });
}

/** Record that a batch will never have a hash, and what git said. */
export async function markCommitFailed(offset: number, batch: string, error: string): Promise<void> {
  await rewriteTail(offset, batch, (entry) => {
    entry.meta = { ...entry.meta, commitFailed: true, commitError: error };
  });
}

const MIRROR_HEADER =
  "# Action history\n\nGenerated from `actions.jsonl` on every write, newest first. Edits are overwritten.\n";

/** §7.3: reverse-chronological, grouped by day, one line per batch. */
export function renderMirror(entries: ActionEntry[]): string {
  const batches = groupBatches(entries).reverse();
  const days = new Map<string, string[]>();

  for (const batch of batches) {
    const { date, time } = splitLocalIso(batch.ts);
    const kind = batch.type === "undo" || batch.type === "redo" ? batch.type : batch.type.split(".")[0];
    const mark = batch.type === "undo" ? "↶ " : batch.type === "redo" ? "↷ " : "";
    const commit = batch.commit ? ` · ${batch.commit}` : "";
    const line = `- ${time} · ${kind} · ${mark}${batch.summary}${commit}`;
    const lines = days.get(date);
    if (lines) lines.push(line);
    else days.set(date, [line]);
  }

  const sections = [...days.entries()].map(([date, lines]) => `## ${date}\n\n${lines.join("\n")}\n`);
  return sections.length === 0 ? MIRROR_HEADER : `${MIRROR_HEADER}\n${sections.join("\n")}`;
}

export async function regenerateMirror(): Promise<void> {
  try {
    await writeText(MIRROR_PATH, renderMirror(await readActions()));
  } catch (err) {
    console.error(`history: could not regenerate the mirror (${(err as Error).message})`);
  }
}
