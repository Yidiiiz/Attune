// Owns: the 44 px icon rail and the panel beside it — PROJECT.md §10.2's left edge, built now with
// **only the Chats icon**, because a conversation cannot be opened without a list of conversations.
// Phase 8 adds Knowledge, Files and Graph to the same rail and the same panel frame; building the
// geometry now is what stops that phase re-homing this list.
//
// The panel's width and collapsed state persist in `localStorage` (§10.2), read after mount so the
// server and the first client render agree on what to draw.
//
// Failure behavior: a browser that refuses storage costs the remembered width and nothing else —
// the panel opens at its default. The drag never leaves the 240–420 px range §10.2 gives it, so a
// stored value from a future version cannot produce a panel too narrow to use.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Chat.module.css";

const WIDTH_KEY = "chat.panelWidth";
const COLLAPSED_KEY = "chat.panelCollapsed";
const MIN = 240;
const MAX = 420;
const DEFAULT = 280;

export default function Rail({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(DEFAULT);
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(stored) && stored > 0) setWidth(Math.min(MAX, Math.max(MIN, stored)));
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // storage refused: the defaults are a fine answer
    }
  }, []);

  const remember = useCallback((key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // nothing to do, and nothing worth telling anyone about
    }
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      if (!dragging.current) return;
      const next = Math.min(MAX, Math.max(MIN, event.clientX - 44));
      setWidth(next);
    };
    const up = (): void => {
      if (!dragging.current) return;
      dragging.current = false;
      remember(WIDTH_KEY, String(width));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [remember, width]);

  return (
    <>
      <nav className={styles.rail} aria-label="Browser">
        <button
          type="button"
          className={`${styles.railButton} ${styles.railButtonActive}`}
          aria-pressed={!collapsed}
          title="Chats"
          data-ui="rail-chats"
          onClick={() => {
            const next = !collapsed;
            setCollapsed(next);
            remember(COLLAPSED_KEY, next ? "1" : "0");
          }}
        >
          <span aria-hidden="true">💬</span>
          <span className={styles.srOnly}>Chats</span>
        </button>
      </nav>

      {collapsed ? null : (
        <div className={styles.panelFrame} style={{ width }} data-ui="panel">
          {children}
          <div
            className={styles.resizer}
            role="separator"
            aria-label="Resize the panel"
            onPointerDown={(event) => {
              dragging.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
          />
        </div>
      )}
    </>
  );
}
