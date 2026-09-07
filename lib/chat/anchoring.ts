// Owns: deciding *which* occurrence of a quotation an annotation meant — PROJECT.md §16.4's
// resolution half, ported from `HANDOFF-CHAT.md` Part E. The DOM half, which turns these character
// offsets back into a range and a rectangle, is `components/chat/anchoring-dom.ts`; this file is
// pure so the scoring can be tested without a browser (Decision 30).
//
// The scoring shape is the part worth not re-deriving, and it is deliberate: a matching prefix or
// suffix is worth 2 each, whole numbers, while the distance from where the quote used to be is a
// penalty of at most 1, normalized by the length of the text. So context always decides, and
// position can only ever break a tie between candidates whose neighbours are equally good. Invert
// that and an edit near the top of a message drags every later anchor to the wrong copy.
//
// Failure behavior: no match answers `null`, and the caller pins the card to the top of the message
// with an "anchor moved" flag (§16.4). Silently choosing the first occurrence would be worse than
// saying the anchor is gone: it would move a note onto text it was never about.

import { denseIndex, findDense, findDenseFirst, densify } from "./text-match.ts";
import type { DenseIndex } from "./text-match.ts";

export interface QuoteMatch {
  start: number;
  end: number;
}

/**
 * Find `quote` in `text`. Prefix and suffix disambiguate repeated occurrences; `charOffset`
 * proximity is the final tie-breaker. Matching ignores whitespace differences, so a quote spanning
 * a block boundary — where the selection carried newlines the rendered text lacks — is still found.
 */
export function findQuote(
  text: string,
  quote: string,
  prefix: string | null,
  suffix: string | null,
  charOffset: number | null,
  markdown = false,
): QuoteMatch | null {
  if (quote.length === 0) return null;

  const index: DenseIndex = denseIndex(text, markdown);
  const matches = findDense(index, quote, markdown);
  if (matches.length === 0) return null;

  const densePrefix = prefix === null ? "" : densify(prefix, markdown);
  const denseSuffix = suffix === null ? "" : densify(suffix, markdown);

  let best = matches[0];
  let bestScore = -Infinity;

  for (const match of matches) {
    let score = 0;
    if (densePrefix.length > 0) {
      const before = index.dense.slice(Math.max(0, match.denseStart - densePrefix.length), match.denseStart);
      if (before === densePrefix) score += 2;
    }
    if (denseSuffix.length > 0) {
      const after = index.dense.slice(match.denseEnd, match.denseEnd + denseSuffix.length);
      if (after === denseSuffix) score += 2;
    }
    if (charOffset !== null) {
      score -= Math.abs(match.start - charOffset) / Math.max(text.length, 1);
    }
    if (score > bestScore) {
      bestScore = score;
      best = match;
    }
  }

  return { start: best.start, end: best.end };
}

/** A comment's positional anchor: the start offset of its `anchorText`, or null. */
export function findAnchorText(text: string, anchorText: string, markdown = false): number | null {
  if (anchorText.length === 0) return null;
  const match = findDenseFirst(denseIndex(text, markdown), anchorText, markdown);
  return match === null ? null : match.start;
}
