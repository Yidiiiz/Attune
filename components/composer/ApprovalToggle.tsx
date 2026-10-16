// Owns: the owner's per-device opt-in to automatic application of supported actions.
"use client";
import { useSyncExternalStore } from "react";
import styles from "./Composer.module.css";

const KEY = "assistant.approveForMe";
const EVENT = "assistant:approval";
function snapshot(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
function subscribe(changed: () => void) {
  window.addEventListener(EVENT, changed);
  window.addEventListener("storage", changed);
  return () => { window.removeEventListener(EVENT, changed); window.removeEventListener("storage", changed); };
}
export function useApproval() {
  const enabled = useSyncExternalStore(subscribe, snapshot, () => false);
  const setEnabled = (next: boolean) => {
    try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { return; }
    window.dispatchEvent(new Event(EVENT));
  };
  return { enabled, setEnabled };
}
export default function ApprovalToggle({ disabled = false }: { disabled?: boolean }) {
  const { enabled, setEnabled } = useApproval();
  return <label className={styles.approval} title="Automatically apply supported actions, including Build edits and commits. History and Undo remain available.">
    <input type="checkbox" role="switch" checked={enabled} disabled={disabled} onChange={event => setEnabled(event.target.checked)} />
    <span>AutoApprove</span>
  </label>;
}
