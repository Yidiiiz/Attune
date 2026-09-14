// Owns: the shell's search (PROJECT.md §10.0) — a scan, with no index, of task titles and bodies,
// note titles and bodies, collection titles and items, and conversation titles. `/api/search` is its
// only caller; the agent's `search_knowledge` is a separate substring scan over the knowledge base
// alone, and stays one (Decision 77).
//
// **Scoring, and the two rules §10.0 did not state** (the Phase 8 approval, open call 6):
//
//   - An entry scores the **best** of its matches, not their sum. Title substring 100, title
//     subsequence 60, body substring 30, body subsequence 10. Summed, a note whose title and body
//     both contain the word would outrank one whose title *is* the word, and the order would say
//     more about how long a body is than about what was asked for.
//   - A body subsequence counts only inside a span of at most **twice the query's length**. Unbounded,
//     "cob" is a subsequence of almost any paragraph — a `c`, then an `o` somewhere later, then a `b`
//     — so the 10-point rule would put nearly every long body into the top 20. Twice the length still
//     finds a query typed with a letter missing or two swapped words close together. A title
//     subsequence is left unbounded: titles are short, and matching "cob" to "Change of basis" is
//     what that rule is for.
//
// Matching ignores case. Ties go to the more recently updated; the top 20 are returned.
//
// Failure behavior: a file that will not parse is skipped — search is a view, and one broken note
// must not blank the results — and the paths are returned in `skipped` so the box can say so.

import { listTasks } from "../store/tasks.ts";
import { listConversations } from "../store/chats.ts";
import { kindOf, listKnowledge, noteTitleFrom, readRecord } from "../store/knowledge.ts";
import { itemsOf } from "./items.ts";

export const TOP = 20;

export interface Entry {
  kind: "task" | "note" | "collection" | "conversation";
  title: string;
  body: string;
  /** Where a result opens: a `data/`-relative path for the document view, or a conversation id. */
  path: string;
  updatedAt: string;
}

export interface Hit {
  kind: Entry["kind"];
  title: string;
  path: string;
  score: number;
  where: "title" | "body";
}

/** Whether `needle` appears in `hay` in order, anywhere — no bound. */
function subsequence(needle: string, hay: string): boolean {
  let at = 0;
  for (const char of hay) if (char === needle[at] && (at += 1) === needle.length) return true;
  return needle.length === 0;
}

/**
 * Whether `needle` appears in `hay` in order within a window of at most `span` characters. From
 * each place the first character occurs, match greedily and give up once the window is too long;
 * greedy is shortest for a fixed start, so a start that fails this way has no shorter match.
 */
export function boundedSubsequence(needle: string, hay: string, span: number): boolean {
  if (needle.length === 0) return true;
  for (let start = hay.indexOf(needle[0]); start >= 0; start = hay.indexOf(needle[0], start + 1)) {
    let at = 1;
    for (let i = start + 1; at < needle.length && i - start < span; i += 1) if (hay[i] === needle[at]) at += 1;
    if (at === needle.length) return true;
  }
  return false;
}

/** One entry's score for `query`, or null for no match. `query` must already be lower-cased. */
export function scoreEntry(query: string, title: string, body: string): { score: number; where: Hit["where"] } | null {
  const t = title.toLowerCase();
  const b = body.toLowerCase();
  if (t.includes(query)) return { score: 100, where: "title" };
  if (subsequence(query, t)) return { score: 60, where: "title" };
  if (b.includes(query)) return { score: 30, where: "body" };
  if (boundedSubsequence(query, b, query.length * 2)) return { score: 10, where: "body" };
  return null;
}

/** Score, order and cut. Pure, so the ranking is tested without a disk. */
export function rank(entries: Entry[], raw: string): Hit[] {
  const query = raw.trim().toLowerCase();
  if (query.length === 0) return [];
  const hits: Array<Hit & { at: number }> = [];
  for (const entry of entries) {
    const scored = scoreEntry(query, entry.title, entry.body);
    if (scored === null) continue;
    const at = Date.parse(entry.updatedAt);
    hits.push({ kind: entry.kind, title: entry.title, path: entry.path, ...scored, at: Number.isNaN(at) ? 0 : at });
  }
  hits.sort((a, b) => b.score - a.score || b.at - a.at || a.path.localeCompare(b.path));
  return hits.slice(0, TOP).map(({ at: _at, ...hit }) => hit);
}

/** Everything §10.0 scans, read through the store. */
export async function entries(): Promise<{ entries: Entry[]; skipped: string[] }> {
  const out: Entry[] = [];
  const skipped: string[] = [];

  for (const task of await listTasks()) {
    out.push({ kind: "task", title: task.title, body: task.body, path: task.path, updatedAt: task.updatedAt });
  }
  skipped.push(...listTasks.errors);

  for (const rel of await listKnowledge()) {
    const kind = kindOf(rel);
    if (kind !== "note" && kind !== "collection") continue;
    try {
      const { data, body } = await readRecord(rel);
      const title = noteTitleFrom(data, body, rel);
      const text = kind === "collection" ? itemsOf(body).map((item) => item.text).join("\n") : body;
      out.push({ kind, title, body: text, path: rel, updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "" });
    } catch {
      skipped.push(rel);
    }
  }

  for (const conversation of await listConversations()) {
    if (conversation.title.trim().length === 0) continue; // an untitled conversation has nothing to match
    out.push({ kind: "conversation", title: conversation.title, body: "", path: conversation.id, updatedAt: conversation.updatedAt });
  }
  return { entries: out, skipped };
}

export async function search(query: string): Promise<{ hits: Hit[]; skipped: string[] }> {
  const { entries: all, skipped } = await entries();
  return { hits: rank(all, query), skipped };
}
