// Owns: what a *task* file's document view adds (PROJECT.md §10.2) — a Complete button and the `⋯`
// menu from Today, with the same inline edit form behind it.
//
// It is the Today row's controls rather than a second set of them, which is AGENTS.md amendment
// `m` arriving: this is the third surface to want them, so `TaskMenu`, `TaskEditForm` and the writes
// behind both now live in `components/tasks/` and all three surfaces share one copy. A second
// hand-written Complete here is how two surfaces come to disagree about whether a repeat says so.
//
// **The task is read through its own route, not from the document.** `/api/files/read` hands over
// frontmatter as plain values, and rebuilding a `Task` from them would be a second parser for §4.1's
// record — one that silently fills in whatever a hand-edited file left out. `GET /api/tasks/<id>` is
// the store's own reader, with §4.1's repairs already applied.
//
// There is no "Ask about this" here, and that is deliberate rather than missing: the composer docked
// under the document is the Ask, and it already carries this file as its context (§16.9).
//
// **Every control here is inert while the document has an unsaved draft.** Each of them rewrites the
// very file the editor is holding, so a Complete pressed over a draft would make the next Save a
// conflict nobody caused — the same reason a checkbox stops taking clicks (§10.2).
//
// Failure behavior: a task that cannot be read leaves the document itself readable and says why in
// this strip alone. Every write routes its own failure per §13.5 — the menu's to a toast, the edit
// form's inline — and the document is re-read after each one, so what is on screen is the file.

"use client";

import { useCallback, useEffect, useState } from "react";
import { send as get } from "@/components/tasks/writes";
import { useTaskActions } from "@/components/tasks/actions";
import TaskEditForm from "@/components/tasks/TaskEditForm";
import TaskMenu from "@/components/tasks/TaskMenu";
import type { Task } from "@/lib/store/tasks";
import styles from "./Browser.module.css";

export interface TaskDocumentProps {
  /** The task's id, from the document's own frontmatter. */
  id: string;
  /** Why these controls are inert, or null: an unsaved draft of this very file (§10.2). */
  blocked: string | null;
  /** Re-read the document, because every one of these writes rewrites the file under it. */
  onChanged: () => void;
}

export default function TaskDocument({ id, blocked, onChanged }: TaskDocumentProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    const answer = await get(`/api/tasks/${encodeURIComponent(id)}`, { method: "GET" });
    if (answer.error !== null) {
      setError(answer.error);
      return;
    }
    setError(null);
    setTask(answer.data.task as Task);
  }, [id]);

  const { actions } = useTaskActions({
    onChanged: () => {
      void reload();
      onChanged();
    },
  });

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error !== null) {
    return (
      <p className={styles.panelError} role="alert" data-ui="task-error">
        This task's own controls are not available — {error}
      </p>
    );
  }
  if (task === null) return null;

  const busy = actions.busyId === task.id || blocked !== null;
  const done = task.status === "done";

  if (actions.editingId === task.id) {
    return (
      <div className={styles.taskBar} data-ui="task-bar">
        <TaskEditForm task={task} busy={busy} onCancel={actions.cancelEdit} onSave={(changes) => actions.save(task, changes)} />
      </div>
    );
  }

  return (
    <div className={styles.taskBar} data-ui="task-bar">
      <button
        type="button"
        className={styles.stripButton}
        data-ui="task-complete"
        disabled={busy || done}
        onClick={() => actions.complete(task)}
      >
        {done ? "Completed" : "Complete"}
      </button>
      <span className={styles.taskStatus} data-ui="task-status">
        {task.status}
      </span>
      <TaskMenu task={task} actions={actions} busy={busy} />
      {blocked === null ? null : (
        <span className={styles.taskStatus} data-ui="task-blocked">
          not while {blocked}
        </span>
      )}
    </div>
  );
}
