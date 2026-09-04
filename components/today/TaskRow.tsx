// Owns: one line of the Today list (PROJECT.md §10.1) — the checkbox, the title, the context
// subheader, the four metadata chips, and the `⋯` menu. When the row is being edited it hands its
// whole width to `TaskEditForm` instead, so the form appears where the row was rather than over it.
//
// Failure behavior: every action here is asked of the server and the row shows `busy` until the
// answer arrives; nothing is written optimistically, so a refused write leaves the row exactly as
// it was rather than snapping back from a state that never existed.

"use client";

import type { Task } from "@/lib/store/tasks";
import TaskEditForm from "./TaskEditForm";
import TaskMenu from "./TaskMenu";
import { PRIORITY_LABEL, durationLabel, relativeDue, showsPriority, subtaskProgress } from "./format";
import styles from "./TaskList.module.css";

/** What a row can ask the page to do. Held by `TodayView`, which owns the writes. */
export interface RowActions {
  editingId: string | null;
  busyId: string | null;
  complete: (task: Task) => void;
  duplicate: (task: Task) => void;
  reschedule: (task: Task, date: string) => void;
  remove: (task: Task) => void;
  startEdit: (task: Task) => void;
  cancelEdit: () => void;
  save: (task: Task, changes: Record<string, unknown>) => Promise<string | null>;
  ask: (task: Task) => void;
}

export interface TaskRowProps {
  task: Task;
  viewDate: string;
  actions: RowActions;
  /** "Also possible" and "Done today" are grayed; the section decides, not the row. */
  muted?: boolean;
  overdue?: boolean;
}

export default function TaskRow({ task, viewDate, actions, muted, overdue }: TaskRowProps) {
  const busy = actions.busyId === task.id;
  const done = task.status === "done";
  const progress = subtaskProgress(task.body);
  const due = relativeDue(viewDate, task.due);
  const estimate = durationLabel(task.estimateMin);

  if (actions.editingId === task.id) {
    return (
      <li className={`${styles.row} ${styles.editing}`}>
        <TaskEditForm
          task={task}
          busy={busy}
          onCancel={actions.cancelEdit}
          onSave={(changes) => actions.save(task, changes)}
        />
      </li>
    );
  }

  return (
    <li
      className={`${styles.row} ${muted ? styles.muted : ""} ${overdue ? styles.overdueRow : ""} ${busy ? styles.busy : ""}`}
    >
      <input
        type="checkbox"
        className={styles.check}
        checked={done}
        disabled={busy || done}
        onChange={() => actions.complete(task)}
        aria-label={done ? `${task.title} is complete` : `Complete ${task.title}`}
        title={done ? "Completed" : "Complete"}
      />

      <div className={styles.main}>
        <div className={`${styles.title} ${done ? styles.struck : ""}`}>{task.title}</div>
        {task.context ? <div className={styles.context}>{task.context}</div> : null}

        <div className={styles.chips}>
          {due ? (
            <span className={`${styles.chip} ${overdue ? styles.chipOverdue : ""}`} title={`Due ${task.due}`}>
              {due}
            </span>
          ) : null}
          {estimate ? <span className={styles.chip} title="Estimate">{estimate}</span> : null}
          {showsPriority(task.priority) ? (
            <span
              className={styles.chip}
              title={`${PRIORITY_LABEL[task.priority]} priority`}
              style={{ color: `var(--priority-${task.priority})` }}
            >
              <span aria-hidden="true">●</span> {PRIORITY_LABEL[task.priority]}
            </span>
          ) : null}
          {progress ? (
            <span className={styles.chip} title="Subtasks done">
              {progress.done}/{progress.total}
            </span>
          ) : null}
        </div>
      </div>

      <TaskMenu task={task} actions={actions} busy={busy} />
    </li>
  );
}
