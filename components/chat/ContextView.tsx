// Owns: PROJECT.md §10.2's context debug view — the blocks `assembleContext` would send for the
// next turn, with per-block estimates and a total.
//
// It renders exactly what `POST /api/agent/context` returns and adds nothing (§14): the route
// assembles a prompt and stops, so this panel is the one place in the app that shows the model's
// input without spending a request on it. The threshold that colours the total travels in the
// response as `warnAbove`, so §6.2's number lives in one place and this view does not carry a copy.
//
// It says "would send", not "sent". §10.2 asks for the blocks of the *last* turn; the route
// assembles from what is on disk now, which is the same thing for a conversation nobody has edited
// underneath and an honest approximation otherwise. Claiming to be a transcript of a past request
// would be the wrong kind of wrong, so the panel says which it is.
//
// Failure behavior: a failed request renders the reason in place and nothing else. This panel has
// an on-screen origin — the reader pressed Context — so §13.5 keeps the message inline rather than
// raising a toast, and the panel can simply be closed.

"use client";

import { useEffect, useState } from "react";
import { send } from "@/components/tasks/writes";
import styles from "./Chat.module.css";

interface Block {
  label: string;
  source: string;
  text: string;
  tokens: number;
  cache?: boolean;
}

export interface ContextViewProps {
  /** `conversation.context.file` — the document this conversation is about, if any (§16.9). */
  openFile: string | null;
  taskIds: string[];
}

export default function ContextView({ openFile, taskIds }: ContextViewProps) {
  // An array prop is a new object every render, so the effect depends on its *content*. Without
  // this the panel re-requests forever, which is the sort of loop that only shows up as a warm fan.
  const ids = taskIds.join(",");
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [total, setTotal] = useState(0);
  const [warnAbove, setWarnAbove] = useState(2500);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const answer = await send("/api/agent/context", {
        method: "POST",
        body: JSON.stringify({
          mode: "ask",
          ...(openFile === null ? {} : { openFile }),
          ...(ids.length === 0 ? {} : { taskIds: ids.split(",") }),
        }),
      });
      if (!live) return;
      if (answer.error !== null) {
        setError(answer.error);
        return;
      }
      setBlocks(answer.data.system as Block[]);
      setTotal(answer.data.total as number);
      setWarnAbove(answer.data.warnAbove as number);
    })();
    return () => {
      live = false;
    };
  }, [openFile, ids]);

  return (
    <section className={styles.contextPanel} data-ui="context-view">
      <div className={styles.contextHead}>
        <strong>What the next turn would send</strong>
        <span
          className={total > warnAbove ? styles.contextTotalWarn : styles.contextTotal}
          data-ui="context-total"
        >
          ~{total} tokens
        </span>
      </div>

      {error !== null ? <p className={styles.inlineError}>{error}</p> : null}

      {blocks === null && error === null ? <p className={styles.empty}>Assembling…</p> : null}

      {blocks?.map((block) => (
        <details key={`${block.label}:${block.source}`} className={styles.contextBlock}>
          <summary>
            <span className={styles.contextLabel}>{block.label}</span>
            <span className={styles.contextSource}>{block.source}</span>
            {block.cache === true ? <span className={styles.contextCached}>cached</span> : null}
            <span className={styles.contextTokens}>~{block.tokens}</span>
          </summary>
          <pre className={styles.contextText}>{block.text || "(empty)"}</pre>
        </details>
      ))}
    </section>
  );
}
