// Owns: global History, filters, action details and explicit Undo/Redo (§7.5).
// Failure behavior: keep conflict/refusal beside the batch; never undo merely by opening the sheet.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { send } from "@/components/tasks/writes";
import styles from "./History.module.css";
interface Batch {
  batch: string; ts: string; actor: string; scope: string; type: string; summary: string;
  commit: string | null; commitState: string; conflict: string[];
  state: { undoable: boolean; redoable: boolean; reason?: string };
  entries: { type: string; summary: string; targets: string[] }[];
}
const TYPES = ["task.create", "task.update", "task.delete", "task.complete", "knowledge.write", "chat.create", "chat.message", "chat.update", "chat.delete", "annotation.write", "file.add", "file.write", "settings.update", "code.change", "undo", "redo"];
export default function HistorySheet() {
  const [open, setOpen] = useState(false), [scope, setScope] = useState(""), [type, setType] = useState(""), [showChat, setShowChat] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]), [more, setMore] = useState(false), [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ batch: string; message: string; conflict: boolean; action: "undo" | "redo" } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), issued = useRef(0), acting = useRef(false);
  const router = useRouter();
  const load = useCallback(async (before?: string) => {
    const ticket = ++issued.current; setBusy(true); setError(null);
    const query = new URLSearchParams({ limit: "50" }); if (scope) query.set("scope", scope); if (type) query.set("type", type); if (before) query.set("before", before);
    const answer = await send(`/api/history?${query}`);
    if (ticket !== issued.current) return;
    setBusy(false);
    if (answer.error) { setError(answer.error); return; }
    const next = answer.data.batches as Batch[];
    setBatches(current => before ? [...current, ...next] : next); setMore(Boolean(answer.data.more));
    if (!before) setSelected(next.find(batch => showChat || type === "chat.update" || batch.type !== "chat.update")?.batch ?? "");
  }, [scope, type, showChat]);
  useEffect(() => {
    const reveal = () => setOpen(true);
    const key = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "z") return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault(); setOpen(true);
    };
    window.addEventListener("history:open", reveal); window.addEventListener("keydown", key);
    return () => { issued.current++; window.removeEventListener("history:open", reveal); window.removeEventListener("keydown", key); };
  }, []);
  useEffect(() => {
    if (open) { dialog.current?.showModal(); void load(); }
    else { issued.current++; dialog.current?.close(); }
  }, [open, load]);
  async function act(batch: string, action: "undo" | "redo", force = false) {
    if (acting.current) return; acting.current = true; setBusy(true); setRefusal(null);
    const answer = await send(`/api/history/${action}`, { method: "POST", body: JSON.stringify({ batch, force }) });
    acting.current = false; setBusy(false);
    if (answer.error) { setRefusal({ batch, message: String(answer.data.reason ?? answer.error), conflict: Array.isArray(answer.data.conflict), action }); return; }
    window.dispatchEvent(new Event("history:changed")); router.refresh(); await load();
  }
  const visible = batches.filter(batch => showChat || type === "chat.update" || batch.type !== "chat.update");
  return <dialog ref={dialog} className={styles.sheet} aria-label="Action history" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <div className={styles.content}>
      <header className={styles.row}><h2>History</h2><button onClick={() => setOpen(false)} aria-label="Close History">Close</button></header>
      <div className={styles.row}><label>History scope<select value={scope} onChange={event => setScope(event.target.value)}><option value="">All scopes</option><option value="user">Personal</option><option value="project">Project</option></select></label>
        <label>History type<select value={type} onChange={event => setType(event.target.value)}><option value="">All types</option>{TYPES.map(one => <option key={one}>{one}</option>)}</select></label>
        <label><input type="checkbox" checked={showChat} onChange={event => setShowChat(event.target.checked)} />Show chat updates</label></div>
      {busy ? <p role="status">Loading…</p> : null}{error ? <p role="alert">{error}</p> : null}
      {!busy && !visible.length ? <p>No matching actions.</p> : null}
      <ol className={styles.list}>{visible.map(batch => <li key={batch.batch} data-batch={batch.batch} className={styles.batch}>
        <button className={styles.summary} disabled={busy} aria-expanded={selected === batch.batch} onClick={() => setSelected(selected === batch.batch ? "" : batch.batch)}>{batch.summary}</button>
        <p className={styles.note}>{batch.ts} · {batch.actor} · {batch.scope} · {batch.type}</p>
        {selected === batch.batch ? <div className={styles.details}>
          <p className={styles.note}>{batch.commit ? `Commit ${batch.commit}` : `Commit: ${batch.commitState}`}</p>
          {batch.entries.map((entry, index) => <div key={index}><strong>{entry.type}</strong> {entry.summary}<ul>{entry.targets.map(target => <li key={target}><code>{target}</code></li>)}</ul></div>)}
          {batch.conflict.length ? <p className={styles.warning}>Later actions touch these files: {batch.conflict.join(", ")}</p> : null}
          <button disabled={busy || (!batch.state.undoable && !batch.state.redoable)} onClick={() => void act(batch.batch, batch.state.redoable ? "redo" : "undo")}>{batch.state.redoable ? "Redo" : "Undo"}</button>
          {refusal?.batch === batch.batch ? <div role="alert"><p>{refusal.message}</p>{refusal.conflict ? <button disabled={busy} onClick={() => void act(batch.batch, refusal.action, true)}>{refusal.action === "undo" ? "Undo anyway" : "Redo anyway"}</button> : null}</div> : null}
        </div> : null}
      </li>)}</ol>
      {more ? <button disabled={busy} onClick={() => void load(batches.at(-1)?.batch)}>Load older actions</button> : null}
    </div>
  </dialog>;
}
