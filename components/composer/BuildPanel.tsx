// Owns: Plan first/Auto, both approval gates, the real diff and ordinary History Undo (§13.4).
// Failure behavior: keep refusals beside their controls; a failed SDK turn offers Revert only.
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Markdown from "@/components/markdown/Markdown";
import { send } from "@/components/tasks/writes";
import type { useBuild } from "./useBuild";
import styles from "./Build.module.css";

export default function BuildPanel({ turn, approval, onApproval }: { turn: ReturnType<typeof useBuild>; approval: "plan" | "auto"; onApproval: (next: "plan" | "auto") => void }) {
  const [undone, setUndone] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const undoActive = useRef(false);
  const state = turn.state;
  const pending = state && ["planning", "plan", "applying", "diff", "committing", "reverting"].includes(state.phase);
  useEffect(() => { setUndone(false); setUndoError(null); setConflict(false); }, [state?.batch]);
  const undo = async (force = false): Promise<void> => {
    if (!state?.batch || undoActive.current) return;
    undoActive.current = true;
    setUndoBusy(true);
    const answer = await send("/api/history/undo", { method: "POST", body: JSON.stringify({ batch: state.batch, force }) });
    setUndoBusy(false);
    undoActive.current = false;
    if (answer.error) { setConflict(Array.isArray(answer.data.conflict)); setUndoError(String(answer.data.reason ?? answer.error)); }
    else { setUndone(true); setUndoError(null); setConflict(false); }
  };
  return <section className={styles.panel} data-ui="build-panel" aria-label="Build project">
    <div className={styles.controls} role="group" aria-label="Build approval">
      <button aria-pressed={approval === "plan"} disabled={turn.busy || !!pending} onClick={() => onApproval("plan")}>Plan first</button>
      <button aria-pressed={approval === "auto"} disabled={turn.busy || !!pending} onClick={() => onApproval("auto")}>Auto</button>
      {turn.canStop ? <button onClick={turn.stop}>Stop build</button> : null}
    </div>
    <p className={styles.note}>{approval === "plan" ? "Review the plan, then review the diff before committing." : "Project edits are committed automatically. Undo remains available."}</p>
    {turn.canStop && turn.text ? <pre className={styles.live}>{turn.text}</pre> : null}
    {state?.phase === "plan" ? <>
      <h2>Review plan</h2><Markdown text={state.plan} />
      <div className={styles.controls}><button data-ui="approve-build-plan" disabled={turn.busy} onClick={() => void turn.approve()}>Approve and apply</button>
        <button disabled={turn.busy} onClick={() => void turn.revert()}>Reject plan</button></div>
    </> : null}
    {state?.diff ? <>
      <h2>{state.phase === "committed" ? undone ? "Undone" : "Committed" : state.phase === "reverted" ? "Reverted" : "Review changes"}</h2>
      <p className={styles.note}>{state.paths.join(", ")}</p>
      <pre className={styles.diff} data-ui="build-diff">{state.diff}</pre>
    </> : null}
    {state?.phase === "diff" ? <div className={styles.controls}>
      <button data-ui="commit-build" disabled={turn.busy || !!state.error} onClick={() => void turn.commit()}>Commit</button>
      <button data-ui="revert-build" disabled={turn.busy} onClick={() => void turn.revert()}>Revert</button>
    </div> : null}
    {state?.phase === "committed" && state.batch ? <div className={styles.controls}>
      <code>{state.commit}</code><button data-ui="undo-build" disabled={undoBusy || undone} onClick={() => void undo()}>Undo</button>
      {conflict ? <button disabled={undoBusy} onClick={() => void undo(true)}>Undo anyway</button> : null}
    </div> : null}
    {!turn.busy && state && ["planning", "applying", "committing", "reverting"].includes(state.phase) ? <button onClick={() => void turn.reload()}>Refresh build status</button> : null}
    {state?.error ? <p role="alert">Build did not finish. {state.paths.length ? "Review the partial changes before reverting." : "Your project files were kept."}</p> : null}
    {turn.error || undoError ? <p className={styles.error} role="alert">{turn.error ?? undoError}</p> : null}
    {state?.conversationId ? <Link href={`/chat?c=${encodeURIComponent(state.conversationId)}`}>Open in Chat</Link> : null}
  </section>;
}
