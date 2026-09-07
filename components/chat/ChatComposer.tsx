// Owns: the box at the bottom of the chat tab. PROJECT.md §9.1 says the floating `+` button is
// never on Chat; this is what stands in its place — docked, always visible, and the only way to say
// something in a conversation.
//
// The keyboard contract is §16.7's, shared with the composer sheet: `Enter` sends, `Shift+Enter`
// makes a newline, `Esc` clears an error. While a reply is arriving the send button becomes Stop,
// because a stream that cannot be interrupted is one you close the tab to escape.
//
// Failure behavior: **the text is never cleared until the send has landed** (§13.5, Decision 50).
// A refusal — a credential in the message, a route that said no — leaves every character where it
// was typed, with the reason above the box, next to the button that would try again.

"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Chat.module.css";

export interface ChatComposerProps {
  /** Returns a message to show inline, or null when the send landed. */
  onSend: (text: string) => Promise<string | null>;
  onStop: () => void;
  streaming: boolean;
  error: string | null;
  onDismissError: () => void;
  placeholder?: string;
}

const MAX_ROWS = 10;

export default function ChatComposer({
  onSend,
  onStop,
  streaming,
  error,
  onDismissError,
  placeholder,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);

  // §9.2's auto-growing box, 1–10 rows: measured rather than counted, so a wrapped line grows it too.
  useEffect(() => {
    const node = area.current;
    if (node === null) return;
    node.style.height = "auto";
    const line = Number.parseFloat(getComputedStyle(node).lineHeight) || 20;
    node.style.height = `${Math.min(node.scrollHeight, line * MAX_ROWS)}px`;
  }, [text]);

  async function submit(): Promise<void> {
    const value = text.trim();
    if (value.length === 0 || busy || streaming) return;
    setBusy(true);
    const problem = await onSend(value);
    setBusy(false);
    // Cleared only on success. A refused send keeps every character (Decision 50).
    if (problem === null) setText("");
  }

  return (
    <div className={styles.composer} data-ui="composer">
      {error === null ? null : (
        <p className={styles.composerError} data-ui="error" role="status">
          {error}
          <button type="button" className={styles.linkButton} onClick={onDismissError}>
            Dismiss
          </button>
        </p>
      )}

      <div className={styles.composerRow}>
        <textarea
          ref={area}
          className={styles.textarea}
          value={text}
          rows={1}
          placeholder={placeholder ?? "Ask anything, or say what you are working on"}
          data-ui="chat-input"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            } else if (event.key === "Escape" && error !== null) {
              onDismissError();
            }
          }}
        />

        {streaming ? (
          <button type="button" className={styles.stopButton} onClick={onStop} data-ui="stop">
            Stop
          </button>
        ) : (
          <button
            type="button"
            className={styles.sendButton}
            onClick={() => void submit()}
            disabled={busy || text.trim().length === 0}
            data-ui="send"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        )}
      </div>
    </div>
  );
}
