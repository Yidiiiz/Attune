// Owns: PROJECT.md §16.5's current-message rule — which message the sidebar should be highlighting,
// decided from geometry alone. The measuring is the caller's (a hook with a scroller and some
// rows); everything that is a *decision* is here, because a rule with three exceptions is worth a
// test and a `ResizeObserver` is not.
//
// The rule reads simply and its exceptions are the whole point. "The last row whose top is at or
// above the reading margin" is right in the middle of a conversation and wrong at both ends: at the
// bottom of a long scroll the last message can be fully on screen while a row far above it is still
// the last one past the margin, and at the very top the first message has not reached the margin at
// all, so nothing qualifies and the sidebar highlights nothing. Both ends are where someone
// actually parks, so both are named.
//
// Failure behavior: pure. Answers `null` only when there is nothing to answer with — no rows, or
// every row zero-height, which is what a conversation looks like for one frame before layout. A
// caller that treats `null` as "leave the highlight where it was" degrades correctly.

import type { MessageId } from "./types.ts";
import type { Pair } from "./tree.ts";

/** §16.5: the margin above which a row counts as read rather than as coming up. */
export const READING_MARGIN = 80;

/** One row, measured against the scroller's content — `offsetTop`, not `getBoundingClientRect`. */
export interface RowBox {
  id: MessageId;
  top: number;
  height: number;
}

export interface ScrollerBox {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/** Within a pixel, because a scroller at its end reports fractional values on scaled displays. */
const EPSILON = 1;

export function currentMessage(rows: RowBox[], view: ScrollerBox): MessageId | null {
  // §16.5: zero-height rows never win. A row that has not laid out yet has a top of 0, which would
  // otherwise make it the answer for the whole first frame.
  const laid = rows.filter((row) => row.height > 0);
  if (laid.length === 0) return null;

  const first = laid[0];
  const last = laid[laid.length - 1];

  // Parked at the bottom with the true last message on screen. Checked before the general rule
  // because at the end of a long conversation the general rule answers with whatever happens to sit
  // at the margin, which is not what someone looking at the newest reply means by "here".
  // The on-screen half of the condition is unreachable with consistent geometry — at the bottom,
  // `scrollTop + clientHeight` *is* `scrollHeight`, and every row starts above that. It is kept as
  // a guard against the one frame where rows were measured before a re-layout, where believing a
  // stale bottom would highlight a message that is no longer there.
  const atBottom = view.scrollTop + view.clientHeight >= view.scrollHeight - EPSILON;
  if (atBottom && last.top < view.scrollTop + view.clientHeight) return last.id;

  // Parked at the top with the first message mounted. Nothing has passed the margin yet, and the
  // honest answer is the message being read rather than none.
  if (view.scrollTop <= EPSILON) return first.id;

  const line = view.scrollTop + READING_MARGIN;
  let current: MessageId | null = null;
  for (const row of laid) {
    if (row.top <= line) current = row.id;
    else break; // rows are in document order, so the first one past the line ends it
  }
  // Scrolled past the top but not far enough for the first row to clear the margin.
  return current ?? first.id;
}

/**
 * §16.5's fourth clause: "assistant messages normalize to their prompt". The sidebar's rows are
 * pairs, so a reply is not something it can highlight — it highlights the exchange the reply
 * belongs to. An id that is nobody's prompt and nobody's response is returned unchanged rather
 * than dropped, so a pair list built from a stale path cannot blank the highlight.
 */
export function promptOf(pairs: Pair[], id: MessageId | null): MessageId | null {
  if (id === null) return null;
  for (const pair of pairs) {
    if (pair.prompt.id === id) return id;
    if (pair.response?.id === id) return pair.prompt.id;
  }
  return id;
}
