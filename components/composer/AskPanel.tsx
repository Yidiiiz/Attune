// Owns: what Ask mode looks like inside the sheet (PROJECT.md §9.6) — the reply as it streams, and
// the "Open in Chat" that hands the conversation to the tab that can do more with it.
//
// It follows §16.3's rule about rendering even though it is not the chat tab: plain text while the
// reply arrives, markdown once it has stopped. A half-arrived `**` is not emphasis yet.
//
// Failure behavior: none of its own. Everything that can fail belongs to `useAskTurn`, which routes
// it per §13.5; this file renders what it is given and nothing else.

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Markdown from "@/components/markdown/Markdown";
import styles from "./Composer.module.css";

export interface AskPanelProps {
  reply: string;
  streaming: boolean;
  conversationId: string | null;
  /** What the question was about, so the panel says so (§9.6). */
  about?: string;
  /** The auto-applied write's marker, under the finished answer as it is under a reply in Chat. */
  applied?: ReactNode;
  onStop: () => void;
}

export default function AskPanel({ reply, streaming, conversationId, about, applied, onStop }: AskPanelProps) {
  if (reply.length === 0 && !streaming) return null;

  return (
    <section className={styles.askPanel} data-composer="ask-panel" aria-live="polite">
      <header className={styles.askHead}>
        <span className={styles.askLabel}>{about === undefined ? "Ask" : `Ask · ${about}`}</span>
        {streaming ? (
          <button type="button" className={styles.linkButton} onClick={onStop} data-ui="stop">
            Stop
          </button>
        ) : conversationId === null ? null : (
          <Link className={styles.linkButton} href={`/chat?c=${conversationId}`} data-ui="open-in-chat">
            Open in Chat
          </Link>
        )}
      </header>

      {streaming ? (
        <div className={styles.askPlain}>
          {reply}
          <span className={styles.askCaret} aria-hidden="true" />
        </div>
      ) : (
        <>
          <Markdown text={reply} />
          {applied}
        </>
      )}
    </section>
  );
}
