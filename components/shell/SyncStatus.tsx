// Owns: the dot in the top bar that says whether your changes have reached the remote, and the
// Sync now button beside it (PROJECT.md §8). It also fires the beforeunload beacon, because the
// push debounce lives in a timer that dies with the page's server process.
//
// Failure behavior: a status request that fails leaves the previous state on screen rather than
// flashing an error — the indicator is advisory, and every commit is already safe on disk. With no
// remote configured the state is `local` and the button is not offered.

"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./SyncStatus.module.css";

interface Status {
  state: "synced" | "pending" | "offline" | "error" | "conflict" | "local";
  ahead: number;
  lastError?: string;
}

const LABEL: Record<Status["state"], string> = {
  synced: "Everything is pushed",
  pending: "Waiting to push",
  offline: "Offline — commits are safe locally",
  error: "Push failed",
  conflict: "Remote has changes",
  local: "No remote configured",
};

const POLL_MS = 15_000;

export default function SyncStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/sync/status", { cache: "no-store" });
      const data = await response.json();
      if (data.ok) setStatus({ state: data.state, ahead: data.ahead, lastError: data.lastError });
    } catch {
      // keep whatever we last knew; a missed poll is not news
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    window.addEventListener("focus", refresh);

    const flush = () => navigator.sendBeacon?.("/api/sync/flush");
    window.addEventListener("beforeunload", flush);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("beforeunload", flush);
    };
  }, [refresh]);

  const syncNow = async () => {
    setBusy(true);
    try {
      await fetch("/api/sync/now", { method: "POST" });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <div className={styles.wrap} aria-hidden="true" />;

  const detail = status.lastError ?? LABEL[status.state];
  const ahead = status.ahead > 0 ? ` · ${status.ahead} unpushed` : "";

  return (
    <div className={styles.wrap}>
      <span
        className={`${styles.dot} ${styles[status.state]}`}
        role="status"
        title={`${LABEL[status.state]}${ahead}${status.lastError ? `\n${status.lastError}` : ""}`}
        aria-label={`Sync: ${detail}`}
      />
      {status.state !== "local" && status.state !== "synced" ? (
        <button type="button" className={styles.button} onClick={syncNow} disabled={busy}>
          {busy ? "Syncing…" : "Sync now"}
        </button>
      ) : null}
    </div>
  );
}
