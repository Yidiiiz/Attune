// Owns: one message on screen — PROJECT.md §16.3's "stream as plain text, render as markdown once
// complete", the three states a message can be in while that happens, and, since Phase 6b, the
// controls that fork the conversation at this point (§16.2, §10.2).
//
// The `data-message` attribute is the sanctioned test hook (AGENTS.md, Conventions): a noun for
// what the element *is*, valued with the record's stable identity. Nothing in the app reads its value
// (`components/data-hooks.test.ts`); the chat does find a row by an id it already holds, as a
// selector, which that test does not cover.
//
// **The open editor is this row's own state**, not the view's. Editing is a property of a message —
// two rows can be mid-edit at once and neither is more current than the other — and hoisting it
// would make `ChatView` hold a map keyed by message id that says nothing the row does not already
// know. What the row does *not* own is the send: it hands text upward and is told what happened.
//
// Failure behavior: a failed message still shows everything that arrived before it failed, with the
// reason beside it and a Retry — §16.3 keeps the partial text on purpose, because a reply that was
// most of the way there is worth more than an empty box. A message whose status is still
// `streaming` when it is *loaded* is a turn the server died in the middle of, and it reads the same
// way: unfinished, with the same Retry. A refused edit keeps its text in the editor, which is that
// component's own contract.

"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Markdown from "@/components/markdown/Markdown";
import BranchBar from "./BranchBar";
import MessageActions from "./MessageActions";
import MessageEditor from "./MessageEditor";
import ReadAloud from "./ReadAloud";
import type { Message } from "@/lib/chat/types";
import styles from "./Chat.module.css";

export interface MessageRowProps {
  message: Message;
  /** True while this message is the one currently arriving, which is what shows the caret. */
  streaming: boolean;
  /** The children of this message's parent (§16.2). Fewer than two means no fork here. */
  siblings: Message[];
  onSwitch: (id: string) => void;
  /** Resend this prompt, changed, as a sibling of itself. User messages only. */
  onEdit?: (message: Message, text: string) => Promise<string | null>;
  /** A different question, parented at this message. Complete replies only. */
  onBranch?: (message: Message, text: string) => Promise<string | null>;
  onRetry?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  /** §16.6's bar, rendered by the caller only when the path has quote replies at all. */
  quoteBar?: ReactNode;
  /** The gutter's "annotate this selection" hook, absent when no gutter is drawn. */
  onAnnotate?: (message: Message) => void;
  /** §6.3's markers for writes this reply's turn applied by itself, rendered by the caller. */
  applied?: ReactNode;
}

/** §16.3's reason, in the words a person would use. */
function reason(message: Message): string {
  if (message.error === "stopped") return "Stopped.";
  if (message.error !== null && message.error.length > 0) return message.error;
  return "This reply did not finish.";
}

export default function MessageRow({
  message,
  streaming,
  siblings,
  onSwitch,
  onEdit,
  onBranch,
  onRetry,
  onDelete,
  quoteBar,
  onAnnotate,
  applied,
}: MessageRowProps) {
  const [editing, setEditing] = useState<"edit" | "branch" | null>(null);
  const unfinished = message.status === "failed" || (message.status === "streaming" && !streaming);
  const body =
    message.status === "complete" ? (
      <Markdown text={message.text} />
    ) : (
      // Plain text while it arrives: markdown mid-sentence renders half-open syntax as itself.
      <div className={styles.plain}>{message.text}</div>
    );

  return (
    <article
      className={`${styles.message} ${message.role === "user" ? styles.fromUser : styles.fromAssistant}`}
      data-message={message.id}
      data-role={message.role}
      data-status={streaming ? "streaming" : message.status}
    >
      <div className={styles.messageTop}>
        <BranchBar siblings={siblings} currentId={message.id} onSwitch={onSwitch} />
        {message.status === "complete" ? <ReadAloud text={message.text} /> : null}
        <MessageActions
          message={message}
          {...(onEdit === undefined ? {} : { onEdit: () => setEditing("edit") })}
          {...(onRetry === undefined ? {} : { onRegenerate: () => onRetry(message) })}
          {...(onBranch === undefined ? {} : { onBranch: () => setEditing("branch") })}
          {...(onDelete === undefined ? {} : { onDelete: () => onDelete(message) })}
          {...(onAnnotate === undefined ? {} : { onAnnotate: () => onAnnotate(message) })}
        />
      </div>

      {quoteBar}

      {editing === "edit" && onEdit !== undefined ? (
        <MessageEditor
          initial={message.text}
          submitLabel="Resend"
          onSubmit={(text) => onEdit(message, text)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className={styles.messageBody}>
          {message.text.length === 0 && streaming ? <span className={styles.thinking}>…</span> : body}
          {streaming ? <span className={styles.caret} aria-hidden="true" /> : null}
        </div>
      )}

      {unfinished ? (
        <p className={styles.messageError} data-ui="error">
          {reason(message)}
          {onRetry === undefined ? null : (
            <button type="button" className={styles.linkButton} onClick={() => onRetry(message)}>
              Retry
            </button>
          )}
          {onDelete === undefined ? null : (
            <button type="button" className={styles.linkButton} onClick={() => onDelete(message)}>
              Discard
            </button>
          )}
        </p>
      ) : null}

      {message.attachments.length > 0 ? (
        // A message that carries a file and shows nothing is the silent failure this project keeps
        // refusing elsewhere (§16.4). The link is the raw route, so a picture opens as a picture.
        <ul className={styles.rowFiles} data-ui="message-files">
          {message.attachments.map((path) => (
            <li key={path}>
              <a
                className={styles.rowFile}
                href={`/api/files/raw?path=${encodeURIComponent(path)}`}
                target="_blank"
                rel="noreferrer"
                data-attachment={path}
              >
                {path.slice(path.lastIndexOf("/") + 1)}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {message.role === "assistant" && message.status === "complete" && message.model !== null ? (
        <p className={styles.byline} data-ui="byline">
          {message.model}
        </p>
      ) : null}

      {applied}

      {editing === "branch" && onBranch !== undefined ? (
        <MessageEditor
          initial=""
          submitLabel="Send"
          onSubmit={(text) => onBranch(message, text)}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </article>
  );
}
