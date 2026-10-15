// Owns: the conversation title, context toggle and hidden-note counts (§10.2, §16.4).
// Failure behavior: hidden annotations stay discoverable through their count controls.
"use client";

import styles from "./Chat.module.css";

export interface ConversationHeaderProps {
  title: string;
  /** True while `ATTUNE_FAKE_PROVIDER` is answering, so the page says so rather than looking odd. */
  scripted: boolean;
  contextOpen: boolean;
  onToggleContext: () => void;
  /** §16.4: annotations on messages that are not on the active path. */
  offPath?: number;
  /** Decision 66: annotations that exist but whose gutter has no room. */
  hidden?: number;
  /** Opens the list of off-path annotations; absent until Stage C builds one. */
  onShowOffPath?: () => void;
}

export default function ConversationHeader({
  title,
  scripted,
  contextOpen,
  onToggleContext,
  offPath = 0,
  hidden = 0,
  onShowOffPath,
}: ConversationHeaderProps) {
  return (
    <header className={styles.viewHeader} data-ui="conversation-header">
      <h1 className={styles.viewTitle}>{title || "New conversation"}</h1>



      {offPath > 0 ? (
        <button
          type="button"
          className={styles.headerCount}
          data-ui="off-path-count"
          onClick={onShowOffPath}
        >
          {offPath} {offPath === 1 ? "note" : "notes"} on other branches
        </button>
      ) : null}

      {hidden > 0 ? (
        <span
          className={styles.headerCount}
          data-ui="hidden-count"
          title="Widen the window, or collapse the left panel, to see them."
        >
          {hidden} {hidden === 1 ? "note" : "notes"} hidden
        </span>
      ) : null}

      <button
        type="button"
        className={styles.contextToggle}
        data-ui="context-toggle"
        aria-pressed={contextOpen}
        onClick={onToggleContext}
      >
        Context
      </button>

      {scripted ? (
        <span
          className={styles.scriptedBadge}
          title="ATTUNE_FAKE_PROVIDER is set: replies come from a script in lib/agent/scripted.ts, not from a model."
        >
          scripted replies
        </span>
      ) : null}
    </header>
  );
}
