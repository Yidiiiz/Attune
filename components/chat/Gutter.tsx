// Owns: the annotation column beside the conversation (PROJECT.md §16.4) — the cards at their
// placed positions, the composer before a card exists, and the two trays for annotations that have
// nowhere on screen to point at.
//
// It is one absolutely-positioned layer inside the message scroller's coordinate space, so a card
// scrolls with the text it is about without anything having to keep the two in step. That is the
// reason the trays are pinned separately: a tray is about annotations with *no* position, so
// scrolling it away with the conversation would hide the thing it exists to surface.
//
// **Both trays are §16.4's "silent is not acceptable" in the two shapes it takes here.** Unanchored
// holds annotations whose message is gone; the restore tray holds ones the reader removed. The
// third shape — annotations on another branch — is a count in the conversation header instead,
// because acting on it means leaving this branch and the header is where leaving happens.
//
// Failure behavior: nothing here writes. Every control calls up to `ChatView`, which owns the
// routes, so a refusal lands as a toast or in the composer and the gutter simply re-renders from
// whatever the conversation now says. Mounted inside `FeatureBoundary` (§16.7): if placement throws,
// the gutter unmounts and the conversation is still readable.

"use client";

import { useState } from "react";
import AnnotationCard from "./AnnotationCard";
import AnnotationComposer from "./AnnotationComposer";
import type { Placed } from "./useAnnotations";
import type { Annotation } from "@/lib/chat/types";
import styles from "./Annotations.module.css";

export interface Draft {
  targetMessageId: string;
  top: number;
  quote: string;
  prefix: string;
  suffix: string;
  charOffset: number;
}

export interface GutterProps {
  width: number;
  placed: Placed[];
  unanchored: Annotation[];
  removed: Annotation[];
  draft: Draft | null;
  onMeasure: (id: string, height: number) => void;
  onSaveDraft: (text: string) => Promise<string | null>;
  onCancelDraft: () => void;
  onToggleContext: (annotation: Annotation) => void;
  onRemove: (annotation: Annotation) => void;
  onRestore: (annotation: Annotation) => void;
  onGoTo: (annotation: Annotation) => void;
}

export default function Gutter({
  width,
  placed,
  unanchored,
  removed,
  draft,
  onMeasure,
  onSaveDraft,
  onCancelDraft,
  onToggleContext,
  onRemove,
  onRestore,
  onGoTo,
}: GutterProps) {
  const [traysOpen, setTraysOpen] = useState(false);
  const strays = unanchored.length + removed.length;

  return (
    <div className={styles.gutter} style={{ width }} data-ui="gutter">
      <div className={styles.cards}>
        {placed.map((card) => (
          <AnnotationCard
            key={card.annotation.id}
            annotation={card.annotation}
            moved={card.moved}
            top={card.top}
            onMeasure={onMeasure}
            onToggleContext={onToggleContext}
            onRemove={onRemove}
            onGoTo={onGoTo}
          />
        ))}
        {draft !== null ? (
          <AnnotationComposer top={draft.top} onSubmit={onSaveDraft} onCancel={onCancelDraft} />
        ) : null}
      </div>

      {strays > 0 ? (
        <div className={styles.trays} data-ui="annotation-trays">
          <button
            type="button"
            className={styles.trayToggle}
            data-ui="trays-toggle"
            aria-expanded={traysOpen}
            onClick={() => setTraysOpen((open) => !open)}
          >
            {strays} {strays === 1 ? "note" : "notes"} not shown
          </button>

          {traysOpen ? (
            <>
              {unanchored.length > 0 ? (
                <section className={styles.tray} data-ui="unanchored-tray">
                  <h2 className={styles.trayHeading}>Unanchored</h2>
                  {unanchored.map((annotation) => (
                    <div key={annotation.id} className={styles.trayRow} data-annotation={annotation.id}>
                      <span className={styles.trayText}>{annotation.text}</span>
                      <span className={styles.trayWhy}>on a deleted message</span>
                    </div>
                  ))}
                </section>
              ) : null}

              {removed.length > 0 ? (
                <section className={styles.tray} data-ui="restore-tray">
                  <h2 className={styles.trayHeading}>Removed</h2>
                  {removed.map((annotation) => (
                    <div key={annotation.id} className={styles.trayRow} data-annotation={annotation.id}>
                      <span className={styles.trayText}>{annotation.text}</span>
                      <button
                        type="button"
                        className={styles.cardAction}
                        data-ui="annotation-restore"
                        onClick={() => onRestore(annotation)}
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
