// Owns: the box at the bottom of the chat tab. PROJECT.md §9.1 says the floating `+` button is
// never on Chat; this is what stands in its place — docked, always visible, and the only way to say
// something in a conversation.
//
// The keyboard contract is §16.7's, shared with the composer sheet: `Enter` sends, `Shift+Enter`
// makes a newline, `Esc` clears an error. While a reply is arriving the send button becomes Stop,
// because a stream that cannot be interrupted is one you close the tab to escape.
//
// **Attachments come from the sheet's component, not from a second copy of it** (§10.2, deferred
// amendment `o`). `components/composer/Attachments.tsx` owns §9.2's upload, chips and drop overlay,
// and this is its second importer; amendment `p` records that a third moves it to a shared home.
// What is different here is only where it mounts: the sheet is a modal that is either open or not,
// so its drop target is gated on `active`, while this composer is always on screen and its drop
// target is always live.
//
// Failure behavior: **the text is never cleared until the send has landed** (§13.5, Decision 50).
// A refusal — a credential in the message, a route that said no, a model that cannot read the
// attachment — leaves every character where it was typed, with the reason above the box, next to
// the button that would try again. The chips stay too: a refused send has not spent them, and a
// model that cannot read a PDF is fixed by changing the model rather than by re-attaching.

"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Attachments, { AttachButton } from "@/components/composer/Attachments";
import type { Attachment } from "@/components/composer/Attachments";
import styles from "./Chat.module.css";

export interface ChatComposerProps {
  /** Returns a message to show inline, or null when the send landed. */
  onSend: (text: string, attachments: string[]) => Promise<string | null>;
  onStop: () => void;
  streaming: boolean;
  error: string | null;
  onDismissError: () => void;
  /** An upload that did not stick. It has an on-screen origin, so it shows inline (§13.5). */
  onError: (message: string) => void;
  placeholder?: string;
  /**
   * Text put into the box from outside it — today only a handover from the document view whose send
   * was refused (§10.2). It is a value rather than an event because the box owns its own text: the
   * effect below adopts each new one, and what someone then types over it is theirs.
   */
  handed?: string | null;
  /** The conversation's proposal tray (§9.5), drawn in this bar above the box its turns came from. */
  tray?: ReactNode;
}

const MAX_ROWS = 10;

export default function ChatComposer({
  onSend,
  onStop,
  streaming,
  error,
  onDismissError,
  onError,
  placeholder,
  handed,
  tray,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]);
  const area = useRef<HTMLTextAreaElement | null>(null);
  // Handed back by `Attachments` so a paste of files reaches the same upload path a drop does.
  const attach = useRef<(chosen: File[]) => void>(() => {});

  // Text handed in from outside the box — a refused handover from the document view, which must
  // land somewhere visible rather than vanish (§10.2's open call 3).
  useEffect(() => {
    if (typeof handed === "string" && handed.length > 0) setText(handed);
  }, [handed]);

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
    // An attachment with no words is still a message worth sending — "what is this?" is often the
    // whole question — so the box may be empty as long as something is attached.
    if ((value.length === 0 && files.length === 0) || busy || streaming) return;
    setBusy(true);
    const problem = await onSend(
      value,
      files.map((file) => file.path),
    );
    setBusy(false);
    // Cleared only on success. A refused send keeps every character, and its chips (Decision 50).
    if (problem === null) {
      setText("");
      setFiles([]);
    }
  }

  return (
    <div className={styles.composer} data-ui="composer">
      <div className={styles.tray}>{tray}</div>

      {error === null ? null : (
        <p className={styles.composerError} data-ui="error" role="status">
          {error}
          <button type="button" className={styles.linkButton} onClick={onDismissError}>
            Dismiss
          </button>
        </p>
      )}

      <Attachments
        files={files}
        onFiles={setFiles}
        onError={onError}
        active
        onReady={(fn) => {
          attach.current = fn;
        }}
      />

      <div className={styles.composerRow}>
        <AttachButton id="chat-attach" onPick={(chosen) => attach.current(chosen)} />
        <textarea
          ref={area}
          className={styles.textarea}
          value={text}
          rows={1}
          placeholder={placeholder ?? "Ask anything, or say what you are working on"}
          data-ui="chat-input"
          onChange={(event) => setText(event.target.value)}
          onPaste={(event) => {
            // §9.2: a pasted image is an attachment, not text. Only intercepted when the clipboard
            // actually carries files, so pasting prose is untouched.
            const pasted = Array.from(event.clipboardData.files);
            if (pasted.length === 0) return;
            event.preventDefault();
            attach.current(pasted);
          }}
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
            disabled={busy || (text.trim().length === 0 && files.length === 0)}
            data-ui="send"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        )}
      </div>
    </div>
  );
}
