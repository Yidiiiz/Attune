// Owns: the box that becomes a card (PROJECT.md §16.4's last bullet). It opens in the gutter at the
// anchor, before the annotation exists.
//
// **Its `top` is handed to the new card so the card appears where the box was, in one frame.** That
// is the sentence in §16.4 and it is the reason this component takes a `top` rather than computing
// one: if the card placed itself from scratch it would land a few pixels away and the eye would
// read the difference as the note jumping.
//
// **It closes on an outside pointer-down only when empty.** Also §16.4, and the reason is that the
// alternative loses work: someone who has typed three lines and clicks into the conversation to
// re-read the sentence they are annotating has not asked to discard anything. `Esc` is the way out
// that always works, because it is unambiguous.
//
// Failure behavior: a refused save keeps every character (Decision 50) and shows the reason in the
// box, which is where the origin is (§13.5). The composer is never cleared by anything but success.

"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Annotations.module.css";

export interface AnnotationComposerProps {
  top: number;
  onSubmit: (text: string) => Promise<string | null>;
  onCancel: () => void;
}

export default function AnnotationComposer({ top, onSubmit, onCancel }: AnnotationComposerProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  // Read by the outside-pointer-down listener, which is installed once and must not see a stale
  // value — an effect dependency on `text` would reinstall the listener on every keystroke.
  const empty = useRef(true);
  empty.current = text.trim().length === 0;

  useEffect(() => {
    // §16.4: focused with `preventScroll`, because the conversation is already where the reader put
    // it and moving it to reveal a box they can see is the opposite of helpful.
    input.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target !== null && wrap.current?.contains(target) === true) return;
      if (empty.current) onCancel();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onCancel]);

  const submit = async (): Promise<void> => {
    if (text.trim().length === 0 || busy) return;
    setBusy(true);
    const failure = await onSubmit(text.trim());
    setBusy(false);
    if (failure !== null) setError(failure); // the text stays in the box (Decision 50)
  };

  return (
    <div ref={wrap} className={styles.composer} style={{ top }} data-ui="annotation-composer">
      <textarea
        ref={input}
        className={styles.composerInput}
        data-ui="annotation-input"
        value={text}
        rows={3}
        placeholder="A note to yourself"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          } else if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      {error !== null ? <p className={styles.composerError}>{error}</p> : null}
      <div className={styles.composerRow}>
        <button
          type="button"
          className={styles.cardAction}
          data-ui="annotation-save"
          disabled={busy}
          onClick={() => void submit()}
        >
          Save
        </button>
        <button type="button" className={styles.cardAction} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
