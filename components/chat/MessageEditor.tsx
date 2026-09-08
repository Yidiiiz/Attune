// Owns: the box that opens on a message row for the two actions that need a prompt — edit-and-resend
// and branch-from-here (PROJECT.md §16.2, §10.2). One component for both, because the difference
// between them is entirely which parent the send names: what a person does here is type and press
// Enter, and that is the same thing twice.
//
// The keyboard contract is the composer's, deliberately: `Enter` sends, `Shift+Enter` makes a
// newline, `Esc` cancels. A second contract on a second box in the same scroller would be a thing
// to remember rather than a thing to know.
//
// Failure behavior: the refusal is rendered by the row above the box and **the text stays where it
// was typed** (§13.5, Decision 50) — an edit refused for a credential must not also lose the
// paragraph it was in. Cancel is the only thing that discards, and it is the only thing that ever
// should be.

"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Chat.module.css";

export interface MessageEditorProps {
  /** Prefilled for an edit, empty for a branch. */
  initial: string;
  submitLabel: string;
  /** Returns a message to show inline, or null when the send landed and the box may close. */
  onSubmit: (text: string) => Promise<string | null>;
  onCancel: () => void;
}

const MAX_ROWS = 12;

export default function MessageEditor({ initial, submitLabel, onSubmit, onCancel }: MessageEditorProps) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);

  // Focus without scrolling: the box opens beside a message someone is already looking at, and the
  // browser's default focus scroll would move it out from under them (§16.4 asks for the same).
  useEffect(() => {
    const node = area.current;
    if (node === null) return;
    node.focus({ preventScroll: true });
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  useEffect(() => {
    const node = area.current;
    if (node === null) return;
    node.style.height = "auto";
    const line = Number.parseFloat(getComputedStyle(node).lineHeight) || 20;
    node.style.height = `${Math.min(node.scrollHeight, line * MAX_ROWS)}px`;
  }, [text]);

  async function submit(): Promise<void> {
    const value = text.trim();
    if (value.length === 0 || busy) return;
    setBusy(true);
    const problem = await onSubmit(value);
    setBusy(false);
    setError(problem);
    if (problem === null) onCancel();
  }

  return (
    <div className={styles.editor} data-ui="message-editor">
      {error === null ? null : (
        <p className={styles.messageError} data-ui="error" role="status">
          {error}
        </p>
      )}
      <textarea
        ref={area}
        className={styles.editorInput}
        value={text}
        rows={1}
        data-ui="editor-input"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <div className={styles.editorRow}>
        <button
          type="button"
          className={styles.sendButton}
          data-ui="editor-send"
          disabled={busy || text.trim().length === 0}
          onClick={() => void submit()}
        >
          {busy ? "Sending…" : submitLabel}
        </button>
        <button type="button" className={styles.linkButton} onClick={onCancel} data-ui="editor-cancel">
          Cancel
        </button>
      </div>
    </div>
  );
}
