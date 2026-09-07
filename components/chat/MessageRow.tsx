// Owns: one message on screen — PROJECT.md §16.3's "stream as plain text, render as markdown once
// complete", and the three states a message can be in while that happens.
//
// The `data-message` attribute is the sanctioned test hook (AGENTS.md, Conventions): a noun for
// what the element *is*, valued with the record's stable identity. Nothing in the app reads it.
//
// Failure behavior: a failed message still shows everything that arrived before it failed, with the
// reason beside it and a Retry — §16.3 keeps the partial text on purpose, because a reply that was
// most of the way there is worth more than an empty box. A message whose status is still
// `streaming` when it is *loaded* is a turn the server died in the middle of, and it reads the same
// way: unfinished, with the same Retry.

"use client";

import Markdown from "@/components/markdown/Markdown";
import type { Message } from "@/lib/chat/types";
import styles from "./Chat.module.css";

export interface MessageRowProps {
  message: Message;
  /** True while this message is the one currently arriving, which is what shows the caret. */
  streaming: boolean;
  onRetry?: (message: Message) => void;
  onDelete?: (message: Message) => void;
}

/** §16.3's reason, in the words a person would use. */
function reason(message: Message): string {
  if (message.error === "stopped") return "Stopped.";
  if (message.error !== null && message.error.length > 0) return message.error;
  return "This reply did not finish.";
}

export default function MessageRow({ message, streaming, onRetry, onDelete }: MessageRowProps) {
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
      <div className={styles.messageBody}>
        {message.text.length === 0 && streaming ? <span className={styles.thinking}>…</span> : body}
        {streaming ? <span className={styles.caret} aria-hidden="true" /> : null}
      </div>

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

      {message.role === "assistant" && message.status === "complete" && message.model !== null ? (
        <p className={styles.byline} data-ui="byline">
          {message.model}
        </p>
      ) : null}
    </article>
  );
}
