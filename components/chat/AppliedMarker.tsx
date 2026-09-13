// Owns: the transcript's marker for §6.3's auto-applied write — the record, where the toast is only
// the notification (Phase 7 approval, addition to Stage B). It is drawn under the reply whose turn
// made the write, from the log (`lib/history/auto-applied.ts`), and carries the same Undo as the
// toast (`components/composer/autoApplied.ts`).
//
// Failure behavior: an Undo the log refuses is shown here, beside the button, because this is where
// it was pressed (§13.5). A successful one re-reads the conversation, and the marker is gone because
// the log now says the batch is undone — nothing edits it away.

"use client";

import { useState } from "react";
import { describeApplied, undoApplied } from "@/components/composer/autoApplied";
import type { AutoApplied } from "@/lib/chat/types";
import styles from "./Chat.module.css";

export interface AppliedMarkerProps {
  applied: AutoApplied;
  onUndone: () => void;
}

export default function AppliedMarker({ applied, onUndone }: AppliedMarkerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undo(): Promise<void> {
    setBusy(true);
    setError(null);
    const problem = await undoApplied(applied);
    setBusy(false);
    if (problem === null) onUndone();
    else setError(problem);
  }

  return (
    <p className={styles.applied} data-ui="auto-applied" data-batch={applied.batch}>
      <span>{describeApplied(applied)}</span>
      <button type="button" className={styles.linkButton} onClick={() => void undo()} disabled={busy} data-ui="auto-applied-undo">
        {busy ? "Undoing…" : "Undo"}
      </button>
      {error === null ? null : (
        <span className={styles.appliedError} role="status">
          {error}
        </span>
      )}
    </p>
  );
}
