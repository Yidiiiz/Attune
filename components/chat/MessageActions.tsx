// Owns: the `⋯` menu on a message row — PROJECT.md §10.2's per-message actions, for the four this
// phase builds. Annotate and read aloud are entries this menu will gain in Phase 6b's later stages;
// they are absent rather than disabled, because a disabled entry is a promise and these are days
// away rather than phases.
//
// **Which entries a message gets is decided by its role, not by a preference**, and the reason is
// §16.2: the three sibling-creating actions are one operation with three parents, and only two of
// the three parents make sense per role. Edit belongs to a prompt — it replaces what was asked, so
// it hangs a user message from the edited one's *parent*. Regenerate and branch belong to a reply:
// regenerate asks the same question again from the same parent, branch asks a different question
// from this answer onward. Offering all three everywhere would produce a user message whose sibling
// is an assistant message, which the tree permits and nothing on screen could explain.
//
// Failure behavior: the menu closes when an entry is chosen and the write is somebody else's. Copy
// is the one action that happens here, and a clipboard the browser refused says so in a toast
// rather than looking like it worked.

"use client";

import { useState } from "react";
import { reportFailure, reportNotice } from "@/components/tasks/writes";
import type { Message } from "@/lib/chat/types";
import styles from "./Chat.module.css";

export interface MessageActionsProps {
  message: Message;
  /** Prefill the editor with this prompt's text and resend it as a sibling (§16.2). */
  onEdit?: () => void;
  /** Same prompt, new reply, same parent. */
  onRegenerate?: () => void;
  /** A different question, parented at this message. */
  onBranch?: () => void;
  /** §16.4: annotate the current selection inside this message. */
  onAnnotate?: () => void;
  onDelete?: () => void;
}

export default function MessageActions({
  message,
  onEdit,
  onRegenerate,
  onBranch,
  onAnnotate,
  onDelete,
}: MessageActionsProps) {
  const [open, setOpen] = useState(false);

  const choose = (run: () => void) => (): void => {
    setOpen(false);
    run();
  };

  const copy = choose(() => {
    void navigator.clipboard
      .writeText(message.text)
      .then(() => reportNotice("Copied."))
      .catch((err: Error) => reportFailure("The message was not copied", err.message));
  });

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.rowMenuButton}
        aria-label={`Actions for this ${message.role === "user" ? "message" : "reply"}`}
        data-ui="message-menu-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⋯
      </button>

      {open ? (
        <div className={styles.rowMenu} data-ui="message-menu">
          <button type="button" onClick={copy}>
            Copy
          </button>
          {onEdit === undefined ? null : (
            <button type="button" onClick={choose(onEdit)}>
              Edit and resend
            </button>
          )}
          {onRegenerate === undefined ? null : (
            <button type="button" onClick={choose(onRegenerate)}>
              Regenerate
            </button>
          )}
          {onBranch === undefined ? null : (
            <button type="button" onClick={choose(onBranch)}>
              Branch from here
            </button>
          )}
          {onAnnotate === undefined ? null : (
            <button type="button" onClick={choose(onAnnotate)}>
              Annotate selection
            </button>
          )}
          {onDelete === undefined ? null : (
            <button type="button" onClick={choose(onDelete)}>
              Delete
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
