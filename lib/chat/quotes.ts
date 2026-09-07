// Owns: PROJECT.md §16.6 — recognizing that a message opens by quoting an earlier one, and finding
// which earlier one. Ported from `HANDOFF-CHAT.md` Part J.
//
// The feature is recognized *from the data*, not from a marker the composer inserts: a leading
// blockquote whose text appears in an earlier message on the same path is a quote reply, and
// nothing has to be stored for it to be one. That is what makes it survive a hand-edited file and
// what lets it cost nothing in the overwhelming majority of conversations, which have none — the
// caller mounts the feature only when `parseQuoteReply` answers non-null for some message (§16.6).
//
// The match is markdown-insensitive on both sides, through `text-match.ts`: what someone quoted was
// the rendered text, and what it has to be found inside is the source markdown.
//
// Failure behavior: both functions answer null rather than guessing. A quotation nobody can place —
// the source was edited, or it was quoted from outside the conversation — renders as an ordinary
// blockquote, which is what it looks like anyway.

import { denseIndex, findDenseFirst } from "./text-match.ts";
import type { Message } from "./types.ts";

/** The leading blockquote of a message, markers stripped, or null if it does not open with one. */
export function parseQuoteReply(text: string): string | null {
  const lines = text.split("\n");
  const quoted: string[] = [];

  let i = 0;
  while (i < lines.length && /^\s*>/.test(lines[i])) {
    quoted.push(lines[i].replace(/^\s*>\s?/, ""));
    i += 1;
  }

  const quote = quoted.join("\n").trim();
  return quote.length === 0 ? null : quote;
}

/**
 * The nearest message *before* `index` on the path whose markdown contains `quote`. Nearest rather
 * than first because a conversation that circles back to the same phrase means the most recent one.
 */
export function findQuoteSource(path: Message[], index: number, quote: string): Message | null {
  if (quote.length === 0) return null;

  for (let i = Math.min(index, path.length) - 1; i >= 0; i -= 1) {
    const candidate = path[i];
    if (findDenseFirst(denseIndex(candidate.text, true), quote, true) !== null) return candidate;
  }

  return null;
}
