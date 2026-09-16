// Owns: the 44 px icon rail and the panel beside it — PROJECT.md §10.2's left edge. Phase 6b built it
// with the Chats icon alone; Phase 8 adds Knowledge and Files to the same rail and the same panel
// frame. Graph, the fourth, is Phase 8b's, and its icon arrives with the view it opens: a rail button
// that opens nothing is a dead end drawn on purpose.
//
// The rail shows one panel at a time. Choosing another shows it; choosing the one already shown folds
// the panel away, which is what the single Chats icon did. Which panel is shown, the panel's width and
// whether it is folded all persist in `localStorage` (§10.2), read after mount so the server and the
// first client render agree on what to draw.
//
// Failure behavior: a browser that refuses storage costs the remembered choices and nothing else —
// the panel opens on Chats at its default width. The drag never leaves the 240–420 px range §10.2
// gives it, so a stored value from a future version cannot produce a panel too narrow to use.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Chat.module.css";

const WIDTH_KEY = "chat.panelWidth";
const COLLAPSED_KEY = "chat.panelCollapsed";
const PANEL_KEY = "browser.panel";
const MIN = 240;
const MAX = 420;
const DEFAULT = 280;

export type PanelName = "chats" | "knowledge" | "files";

const PANELS: Array<{ name: PanelName; label: string; icon: string }> = [
  { name: "chats", label: "Chats", icon: "💬" },
  { name: "knowledge", label: "Knowledge", icon: "📚" },
  { name: "files", label: "Files", icon: "🗂️" },
];

export default function Rail({ panels }: { panels: Record<PanelName, React.ReactNode> }) {
  const [width, setWidth] = useState(DEFAULT);
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState<PanelName>("chats");
  const dragging = useRef(false);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(stored) && stored > 0) setWidth(Math.min(MAX, Math.max(MIN, stored)));
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
      const panel = window.localStorage.getItem(PANEL_KEY);
      if (PANELS.some((one) => one.name === panel)) setActive(panel as PanelName);
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

  const choose = (name: PanelName): void => {
    const fold = name === active && !collapsed;
    setActive(name);
    setCollapsed(fold);
    remember(PANEL_KEY, name);
    remember(COLLAPSED_KEY, fold ? "1" : "0");
  };

  return (
    <>
      <nav className={styles.rail} aria-label="Browser">
        {PANELS.map((panel) => (
          <button
            key={panel.name}
            type="button"
            className={`${styles.railButton} ${styles.railButtonActive}`}
            aria-pressed={panel.name === active && !collapsed}
            title={panel.label}
            data-ui={`rail-${panel.name}`}
            onClick={() => choose(panel.name)}
          >
            <span aria-hidden="true">{panel.icon}</span>
            <span className={styles.srOnly}>{panel.label}</span>
          </button>
        ))}
      </nav>

      {collapsed ? null : (
        <div className={styles.panelFrame} style={{ width }} data-ui="panel">
          {panels[active]}
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
