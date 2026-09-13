// Owns: what the assistant is told about remembering (PROJECT.md §6.4, verbatim) and what happens to
// a knowledge proposal between the model and the card (§6.3): a duplicate note becomes an append to
// the note that already exists, and at most one small profile append per turn may skip the card.
//
// **Title similarity is Sørensen–Dice over character bigrams of normalized titles, and a match is a
// score strictly above 0.8** (Decision 72). The 0.8 is the spec's; it means nothing without the
// measure and the normalization, which is why all three are fixed here together and tested at the
// line: a single-word title, and a pair just either side of it.
//
// **A rewritten write says so, and is what gets applied.** When a `create` becomes an `append`, the
// proposal the card shows is the append — the existing note's path, the rewritten operation, and
// `rewritten.why` naming the match — so what the user approves and what `runBatch` applies are the
// same write. And only a write this filter left unchanged may be auto-applied: nothing reaches disk
// without a card that has not first been read as what it is.
//
// Failure behavior: pure apart from `existingNotes`, which reads through the store; a note it cannot
// read is left out of the comparison rather than failing the proposal — a missed duplicate costs a
// second note, a failed proposal costs the whole turn's suggestion.

import { splitFrontmatter } from "../store/frontmatter.ts";
import { PROFILE_CAP, kindOf, listKnowledge, noteTitleFrom, readRecord } from "../store/knowledge.ts";
import type { KnowledgeWrite } from "./tools.ts";

/** §6.4, word for word. It goes into the prompt as is. */
export const HEURISTIC =
  "Remember: stable facts about the user (school, courses, people, tools, constraints); recurring " +
  "patterns you observe across turns; preferences the user states explicitly. Do not remember: " +
  "one-off task content, anything already in a task file, transient state (\"I'm tired today\"), or " +
  "anything the user asked you to forget. When unsure, do not propose.";

/** §6.3's line. A score must be strictly above it to count as the same note. */
export const SIMILAR = 0.8;

/** §6.3: the only files a write may land in without a card, and only by appending. */
export const AUTO_APPLY_FILES = new Set(["knowledge/profile/habits.md", "knowledge/profile/preferences.md"]);
export const AUTO_APPLY_LINES = 3;

/** Words that carry no identity in a title. Kept short: every entry is a word two notes may differ by. */
const STOP_WORDS = new Set(["a", "an", "the", "of", "for", "and", "or", "to", "in", "on", "at", "by", "with", "about", "my"]);

/**
 * Case folded, accents removed, punctuation turned into spaces, stop words dropped. A title made of
 * nothing but stop words keeps them, so "The" is still comparable to "The".
 */
export function normalizeTitle(title: string): string {
  const words = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const kept = words.filter((word) => !STOP_WORDS.has(word));
  return (kept.length > 0 ? kept : words).join(" ");
}

function bigrams(text: string): Map<string, number> {
  const squeezed = text.replace(/ /g, "");
  const counts = new Map<string, number>();
  for (let i = 0; i < squeezed.length - 1; i += 1) {
    const pair = squeezed.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}

/**
 * Sørensen–Dice over the multiset of character bigrams, spaces removed, of the normalized titles:
 * 2·|A∩B| / (|A|+|B|). Two titles too short to have a bigram are the same only if equal.
 */
export function titleSimilarity(a: string, b: string): number {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  const x = bigrams(left);
  const y = bigrams(right);
  const size = (m: Map<string, number>): number => [...m.values()].reduce((sum, n) => sum + n, 0);
  if (size(x) === 0 || size(y) === 0) return left === right && left.length > 0 ? 1 : 0;
  let shared = 0;
  for (const [pair, n] of x) shared += Math.min(n, y.get(pair) ?? 0);
  return (2 * shared) / (size(x) + size(y));
}

/** A proposed write as the card shows it: the model's, or what this filter turned it into. */
export interface ProposedWrite extends KnowledgeWrite {
  rewritten?: { from: "create"; path: string; why: string };
}

export interface ExistingNote {
  path: string;
  title: string;
}

/** Every note on disk with its title, for `filterWrites` to compare against. */
export async function existingNotes(): Promise<ExistingNote[]> {
  const notes: ExistingNote[] = [];
  for (const rel of await listKnowledge()) {
    if (kindOf(rel) !== "note") continue;
    try {
      const { data, body } = await readRecord(rel);
      notes.push({ path: rel, title: noteTitleFrom(data, body, rel) });
    } catch {
      // unreadable: kb:check names it; it cannot be a duplicate of anything we can see
    }
  }
  return notes;
}

/**
 * §6.3's duplicate rule. A `create` of a note whose title matches an existing note's above
 * `SIMILAR` becomes an `append` of the proposal's body to that note, carrying why. Everything else
 * passes through as it was.
 */
export function filterWrites(writes: KnowledgeWrite[], notes: ExistingNote[]): ProposedWrite[] {
  return writes.map((write) => {
    if (write.op !== "create" || kindOf(write.path) !== "note") return write;
    let proposed: { data: Record<string, unknown>; body: string };
    try {
      proposed = splitFrontmatter(write.content);
    } catch {
      return write; // runBatch will refuse the frontmatter; this is not the place to rephrase it
    }
    const title = noteTitleFrom(proposed.data, proposed.body, write.path);
    let best: { note: ExistingNote; score: number } | null = null;
    for (const note of notes) {
      const score = titleSimilarity(title, note.title);
      if (best === null || score > best.score) best = { note, score };
    }
    if (best === null || best.score <= SIMILAR) return write;

    return {
      path: best.note.path,
      op: "append" as const,
      content: proposed.body,
      reason: write.reason,
      mapLink: null,
      rewritten: {
        from: "create" as const,
        path: write.path,
        why:
          `"${title}" matches the existing note "${best.note.title}" (${best.score.toFixed(2)}), so ` +
          "this adds to that note instead of starting a second one",
      },
    };
  });
}

const lines = (text: string): string[] => text.split("\n").filter((line) => line.trim().length > 0);

/**
 * Whether a write may skip the card (§6.3): unchanged by `filterWrites`, an append, to habits or
 * preferences, of one to three non-empty lines. The one-per-turn cap is `pickAutoApply`'s.
 */
export function autoApplicable(write: ProposedWrite): boolean {
  if (write.rewritten !== undefined || write.op !== "append" || !AUTO_APPLY_FILES.has(write.path)) return false;
  const added = lines(write.content).length;
  return added > 0 && added <= AUTO_APPLY_LINES;
}

/**
 * Split a turn's writes into the one that applies itself and the rest, which go to the card. At
 * most one per turn, in addition to the three-line limit per write: an assistant that could write
 * several things behind a toast in one reply is one whose toasts stop being read.
 */
export function pickAutoApply(
  writes: ProposedWrite[],
  alreadyApplied: boolean,
): { auto: ProposedWrite | null; rest: ProposedWrite[] } {
  if (alreadyApplied) return { auto: null, rest: writes };
  const index = writes.findIndex(autoApplicable);
  if (index < 0) return { auto: null, rest: writes };
  return { auto: writes[index], rest: writes.filter((_, n) => n !== index) };
}

/** §6.3's last rule: a profile file over the cap makes the next turn propose distilling it. */
export const overCap = (text: string): boolean => text.split("\n").length > PROFILE_CAP;
