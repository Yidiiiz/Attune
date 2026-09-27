// Owns: one line of the Today list (PROJECT.md §10.1) — the checkbox, the title, the context
// subheader, the four metadata chips, and the `⋯` menu. When the row is being edited it hands its
// whole width to `TaskEditForm` instead, so the form appears where the row was rather than over it.
//
// **The title is a link to the task's own document** (§10.1's last sentence, AGENTS.md amendment
// `l`). It waited for Phase 8 because until then it would have pointed at a page that did not
// exist; the address comes from `href.ts` so a task opens exactly as a tree row or a backlink opens
// it, rather than from a second spelling of `/chat?open=`.
//
// Failure behavior: every action here is asked of the server and the row shows `busy` until the
// answer arrives; nothing is written optimistically, so a refused write leaves the row exactly as
// it was rather than snapping back from a state that never existed.

"use client";

import Link from "next/link";
import type { Task } from "@/lib/store/tasks";
import { documentHref } from "@/components/browser/href";
import type { RowActions } from "@/components/tasks/actions";
import TaskEditForm from "@/components/tasks/TaskEditForm";
import TaskMenu from "@/components/tasks/TaskMenu";
import { PRIORITY_LABEL, durationLabel, relativeDue, showsPriority, subtaskProgress } from "@/components/tasks/format";
import styles from "@/components/tasks/TaskList.module.css";

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
        <div className={`${styles.title} ${done ? styles.struck : ""}`}>
          <Link className={styles.titleLink} href={documentHref(task.path, "data", null)} title={task.path}>
            {task.title}
          </Link>
        </div>
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
