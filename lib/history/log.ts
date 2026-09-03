// Owns: `data/history/actions.jsonl` — the record of everything that has ever changed — and the
// human-readable mirror beside it (PROJECT.md §4.11, §7.3). Entries are append-only. The one
// in-place edit is filling the `commit` field of lines written moments earlier, once git has told
// us the hash; that is done by rewriting the file from the offset those lines began at.
//
// Because the backfill happens after the commit, `actions.jsonl` and the mirror are modified in the
// working tree immediately after every batch, and the next batch's `git add -A -- data` sweeps them
// in. That trailing dirt is inherent to §7.1 step 4 and is the reason `git status` is rarely clean
// under `data/history/` (Decision 47).
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
  entries: ActionEntry[];
}

export async function readActions(): Promise<ActionEntry[]> {
  let text: string;
  try {
    text = await readText(LOG_PATH);
  } catch {
    return [];
  }

  const entries: ActionEntry[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      entries.push(JSON.parse(line) as ActionEntry);
    } catch {
      // a torn or hand-mangled line: skip it, keep the rest of the history readable
    }
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
        entries: [],
      };
      byId.set(entry.batch, batch);
      order.push(entry.batch);
    }
    batch.entries.push(entry);
    if (entry.commit) batch.commit = entry.commit;
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

/** Fill in `commit` on the lines written at `offset` and after. The log's one in-place edit. */
export async function setBatchCommit(offset: number, batch: string, commit: string): Promise<void> {
  const tail = await readTail(LOG_PATH, offset);
  if (tail.length === 0) return;

  const patched = tail
    .split("\n")
    .map((line) => {
      if (line.trim().length === 0) return line;
      try {
        const entry = JSON.parse(line) as ActionEntry;
        if (entry.batch !== batch || entry.commit) return line;
        entry.commit = commit;
        return JSON.stringify(entry);
      } catch {
        return line;
      }
    })
    .join("\n");

  await replaceTail(LOG_PATH, offset, patched);
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
