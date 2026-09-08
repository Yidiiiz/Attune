// Owns: where each gutter card goes (PROJECT.md §16.4) — resolving a stored anchor back to a place
// in the rendered conversation, and stacking the cards that result.
//
// The three steps are separable and each one is somewhere else's rule. **Which** occurrence a quote
// meant is `lib/chat/anchoring.ts`, pure and tested. **Where** that occurrence is on screen is
// `anchoring-dom.ts`, which needs a layout engine. **How the cards stack** is here, and it is the
// one part with no home elsewhere: sort by anchor y, then walk down pushing each card past the
// bottom of the one above it, which is the only stacking rule §16.4 states.
//
// **A card whose anchor cannot be found is not dropped.** §16.4 pins it to the top of its message
// with an "anchor moved" flag, because a note silently placed on the wrong words is worse than one
// that admits it lost its place — the same reasoning `lib/chat/anchoring.ts` gives for answering
// null rather than taking the first occurrence.
//
// Placement is recomputed after layout rather than during render: the measurements come from the
// DOM the last render produced, so reading them in a `useLayoutEffect` is what makes them describe
// the frame the reader is about to see rather than the one before it.
//
// Failure behavior: a message element that is not on screen yet yields no placement for its cards,
// and they appear on the next pass. Nothing here writes, and nothing throws — a resolution failure
// is a flag on a card, which is a visible state rather than an error.

"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { findAnchorText, findQuote } from "@/lib/chat/anchoring";
import { indexText, firstLineRect, rangeFromOffsets } from "./anchoring-dom";
import type { Annotation } from "@/lib/chat/types";

/** §16.4: cards do not overlap, so each is pushed past the bottom of the one above it. */
const GAP = 8;
/** What a card is assumed to be before it has been measured, so the first pass is close. */
const ASSUMED_HEIGHT = 72;

export interface Placed {
  annotation: Annotation;
  /** Top of the card, in the scroller's coordinates. */
  top: number;
  /** Where the anchor actually is, which is where the connector line points. */
  anchorTop: number;
  /** §16.4: the quote was not found, so this is pinned to the message top and says so. */
  moved: boolean;
}

export interface AnnotationsInput {
  /** The message scroller, whose coordinates every `top` here is in. */
  scroller: HTMLElement | null;
  /** Annotations whose target is a live message on the active path. */
  onPath: Annotation[];
  /** Bumped by the caller whenever the conversation re-rendered, so placement re-runs. */
  revision: number;
}

/** Card heights, measured once each card exists; unmeasured cards use the assumption above. */
export type CardHeights = Map<string, number>;

export function useAnnotations({ scroller, onPath, revision }: AnnotationsInput): {
  placed: Placed[];
  measure: (id: string, height: number) => void;
} {
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [heights, setHeights] = useState<CardHeights>(new Map());
  // A resize changes every rectangle in the conversation and none of the other inputs see it, so it
  // is a counter the placement pass depends on. There is nothing to debounce: the work is one pass
  // over the cards that exist.
  const [resizes, setResizes] = useState(0);

  useEffect(() => {
    if (scroller === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setResizes((n) => n + 1));
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scroller]);

  const measure = useCallback((id: string, height: number) => {
    setHeights((current) => {
      // Dirty-check (Conventions): an unchanged height must not start a placement pass, or a card
      // that reports its size every frame becomes a render loop.
      if (current.get(id) === height) return current;
      const next = new Map(current);
      next.set(id, height);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    if (scroller === null) {
      setPlaced([]);
      return;
    }

    const scrollerBox = scroller.getBoundingClientRect();
    const anchored: Placed[] = [];

    for (const annotation of onPath) {
      const element = scroller.querySelector<HTMLElement>(
        `[data-message='${CSS.escape(annotation.targetMessageId)}']`,
      );
      if (element === null) continue;

      // The message's top in the scroller's own coordinates, which is what a card is positioned in.
      const messageTop = element.offsetTop;
      const index = indexText(element);
      let anchorTop: number | null = null;

      if (annotation.kind === "note" && annotation.quote !== null) {
        const match = findQuote(
          index.text,
          annotation.quote,
          annotation.prefix,
          annotation.suffix,
          annotation.charOffset,
        );
        const range = match === null ? null : rangeFromOffsets(index, match.start, match.end);
        const rect = range === null ? null : firstLineRect(range);
        if (rect !== null) anchorTop = rect.top - scrollerBox.top + scroller.scrollTop;
      } else if (annotation.kind === "comment" && annotation.anchorText !== null) {
        const at = findAnchorText(index.text, annotation.anchorText);
        const range = at === null ? null : rangeFromOffsets(index, at, at + 1);
        const rect = range === null ? null : firstLineRect(range);
        if (rect !== null) anchorTop = rect.top - scrollerBox.top + scroller.scrollTop;
      }

      // A comment with no anchor text still has its fraction of the message box (§16.4).
      if (anchorTop === null && annotation.kind === "comment" && annotation.offsetRatio !== null) {
        anchorTop = messageTop + element.offsetHeight * annotation.offsetRatio;
      }

      anchored.push({
        annotation,
        top: anchorTop ?? messageTop,
        anchorTop: anchorTop ?? messageTop,
        moved: anchorTop === null,
      });
    }

    // Sorted by anchor y, then pushed down on collision — §16.4's only stacking rule. Ties break on
    // id so two cards on the same line keep a stable order between passes rather than swapping.
    anchored.sort(
      (a, b) => a.anchorTop - b.anchorTop || (a.annotation.id < b.annotation.id ? -1 : 1),
    );

    let floor = -Infinity;
    for (const card of anchored) {
      if (card.top < floor) card.top = floor;
      floor = card.top + (heights.get(card.annotation.id) ?? ASSUMED_HEIGHT) + GAP;
    }

    setPlaced(anchored);
  }, [scroller, onPath, revision, heights, resizes]);

  return { placed, measure };
}
