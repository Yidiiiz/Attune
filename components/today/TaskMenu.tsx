// Owns: the `⋯` menu on a task row (PROJECT.md §10.1) — Edit, Duplicate, Reschedule, Delete, and
// Ask about this. It holds no data of its own; every item calls back into `TodayView`, which owns
// the writes, so the menu can be opened and closed without anything being at stake.
//
// Delete confirms with the browser's own dialog. A custom confirmation would need a modal, a
// z-tier, and a focus trap to be no safer than the one the platform ships (§1 rule 1).
//
// Failure behavior: closing is driven by `Esc` and an outside pointer-down, both on `document`; if
// neither ever fires the menu simply stays open, which costs a click and no data.

"use client";

import { useEffect, useRef, useState } from "react";
import type { Task } from "@/lib/store/tasks";
import type { RowActions } from "./TaskRow";
import { datePart } from "@/lib/schedule/dates";
import styles from "./TaskList.module.css";

export interface TaskMenuProps {
  task: Task;
  actions: RowActions;
  busy: boolean;
}

export default function TaskMenu({ task, actions, busy }: TaskMenuProps) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setPicking(false);
  };

  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <div className={styles.menuWrap} ref={wrap}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setOpen((current) => !current)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${task.title}`}
        title="Actions"
      >
        ⋯
      </button>

      {open ? (
        <div className={styles.menu} role="menu">
          <button type="button" role="menuitem" onClick={run(() => actions.startEdit(task))}>
            Edit
          </button>
          <button type="button" role="menuitem" onClick={run(() => actions.duplicate(task))}>
            Duplicate
          </button>

          {picking ? (
            <label className={styles.pick}>
              <span>Schedule for</span>
              <input
                type="date"
                autoFocus
                defaultValue={task.scheduled ? datePart(task.scheduled) : ""}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) return;
                  close();
                  actions.reschedule(task, value);
                }}
              />
            </label>
          ) : (
            <button type="button" role="menuitem" onClick={() => setPicking(true)}>
              Reschedule…
            </button>
          )}

          <button type="button" role="menuitem" onClick={run(() => actions.ask(task))}>
            Ask about this
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.danger}
            onClick={run(() => {
              if (window.confirm(`Delete '${task.title}'? This is undoable from the history.`)) {
                actions.remove(task);
              }
            })}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
