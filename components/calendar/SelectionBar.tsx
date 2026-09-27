// Owns: the toolbar under the calendar grid (PROJECT.md §10.3) — the Today `⋯` menu's actions for
// whichever item is selected, laid out flat rather than behind a menu button, because there is only
// ever one selection and a menu inside a 100px cell has nowhere to open.
//
// Edit renders here rather than in the cell, reusing Today's `TaskEditForm`: the form is eight
// fields tall and a cell is five lines, and putting it here means the refusal behaviour of §11.5
// and Decision 50 — the message inline, every character still in the field — works unchanged
// rather than being rebuilt smaller.
//
// Failure behavior: none of its own. Every button calls back into `CalendarView`, which owns the
// writes and the one place errors are surfaced.

"use client";

import type { Task } from "@/lib/store/tasks";
import TaskEditForm from "@/components/tasks/TaskEditForm";
import { relativeDue } from "@/components/tasks/format";
import { datePart } from "@/lib/schedule/dates";
import styles from "./Calendar.module.css";

export interface SelectionBarProps {
  task: Task;
  today: string;
  busy: boolean;
  editing: boolean;
  onComplete: (task: Task) => void;
  onDuplicate: (task: Task) => void;
  onReschedule: (task: Task, date: string) => void;
  onRemove: (task: Task) => void;
  onStartEdit: (task: Task) => void;
  onCancelEdit: () => void;
  onSave: (task: Task, changes: Record<string, unknown>) => Promise<string | null>;
  onAsk: (task: Task) => void;
  onClose: () => void;
}

export default function SelectionBar(props: SelectionBarProps) {
  const { task, today, busy, editing } = props;

  if (editing) {
    return (
      <div className={styles.bar}>
        <TaskEditForm
          task={task}
          busy={busy}
          onCancel={props.onCancelEdit}
          onSave={(changes) => props.onSave(task, changes)}
        />
      </div>
    );
  }

  const due = relativeDue(today, task.due);

  return (
    <div className={`${styles.bar} ${busy ? styles.barBusy : ""}`} role="toolbar" aria-label="Selected task">
      <div className={styles.barTitle}>
        <span className={styles.barName}>{task.title}</span>
        {due !== null ? <span className={styles.barChip}>due {due}</span> : null}
        {task.status === "done" ? <span className={styles.barChip}>done</span> : null}
      </div>

      <div className={styles.barActions}>
        <button type="button" onClick={() => props.onComplete(task)} disabled={busy || task.status === "done"}>
          Complete
        </button>
        <button type="button" onClick={() => props.onStartEdit(task)} disabled={busy}>
          Edit
        </button>
        <button type="button" onClick={() => props.onDuplicate(task)} disabled={busy}>
          Duplicate
        </button>

        <label className={styles.barPick}>
          <span>Reschedule</span>
          <input
            type="date"
            disabled={busy}
            defaultValue={task.scheduled ? datePart(task.scheduled) : ""}
            onChange={(event) => {
              if (event.target.value) props.onReschedule(task, event.target.value);
            }}
          />
        </label>

        <button type="button" onClick={() => props.onAsk(task)} disabled={busy}>
          Ask about this
        </button>
        <button
          type="button"
          className={styles.barDanger}
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete '${task.title}'? This is undoable from the history.`)) {
              props.onRemove(task);
            }
          }}
        >
          Delete
        </button>
        <button type="button" className={styles.barClose} onClick={props.onClose} aria-label="Clear selection">
          ×
        </button>
      </div>
    </div>
  );
}
