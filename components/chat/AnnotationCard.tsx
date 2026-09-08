// Owns: one annotation as it appears in the gutter (PROJECT.md §16.4) — its text, the quotation it
// is about, and the three things that can be done to it.
//
// It reports its own height upward. The stacking rule in `useAnnotations.ts` needs to know how tall
// each card is before it can push the next one clear, and a card is the only thing that knows: its
// text wraps against a width the layout cascade decided. A `ResizeObserver` on itself is the whole
// of that, and the dirty check on the receiving side is what stops it becoming a loop.
//
// **"Anchor moved" is a state, not an error.** When the quotation is no longer in the message —
// edited away, or the reply regenerated — the card pins to the top of its message and says so
// rather than vanishing or guessing at a new home. Nobody is asked to fix it; it is a label.
//
// Failure behavior: every control is a write through an API route and back, so a refusal leaves the
// card as it was. `includeInContext` is the one that matters to be honest about (§16.0 rule 5:
// annotations are private unless this is true), so it is a visible toggle rather than a menu entry.

"use client";

import { useEffect, useRef } from "react";
import type { Annotation } from "@/lib/chat/types";
import styles from "./Annotations.module.css";

export interface AnnotationCardProps {
  annotation: Annotation;
  /** §16.4: the quotation could not be found, so this is pinned to the message top. */
  moved: boolean;
  top: number;
  onMeasure: (id: string, height: number) => void;
  onToggleContext: (annotation: Annotation) => void;
  onRemove: (annotation: Annotation) => void;
  /** Scroll the conversation to what this is about. */
  onGoTo: (annotation: Annotation) => void;
}

export default function AnnotationCard({
  annotation,
  moved,
  top,
  onMeasure,
  onToggleContext,
  onRemove,
  onGoTo,
}: AnnotationCardProps) {
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = box.current;
    if (element === null) return;
    const report = () => onMeasure(annotation.id, element.offsetHeight);
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [annotation.id, onMeasure]);

  return (
    <article
      ref={box}
      className={styles.card}
      style={{ top }}
      data-ui="annotation"
      data-annotation={annotation.id}
      data-moved={moved ? "true" : undefined}
    >
      {moved ? (
        <p className={styles.moved} data-ui="anchor-moved">
          anchor moved
        </p>
      ) : null}

      {annotation.quote !== null && annotation.quote.length > 0 ? (
        <button type="button" className={styles.quote} onClick={() => onGoTo(annotation)}>
          {annotation.quote}
        </button>
      ) : null}

      <p className={styles.cardText}>{annotation.text}</p>

      <div className={styles.cardRow}>
        <label className={styles.include}>
          <input
            type="checkbox"
            data-ui="annotation-context"
            checked={annotation.includeInContext}
            onChange={() => onToggleContext(annotation)}
          />
          in context
        </label>
        <button
          type="button"
          className={styles.cardAction}
          data-ui="annotation-remove"
          onClick={() => onRemove(annotation)}
        >
          Remove
        </button>
      </div>
    </article>
  );
}
