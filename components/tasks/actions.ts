// Owns: what a task row can be asked to do, and the writes behind it — Complete, Duplicate,
// Reschedule, Delete, the inline edit, and §9.6's "Ask about this".
//
// It is here rather than in `components/today/` because of AGENTS.md amendment `m`: two surfaces
// shared these pieces by importing across, and the amendment named the third importer as the signal
// to move them. Phase 8's document view is that third — §10.2 gives a task file "a Complete button
// and the `⋯` menu from Today" — so `TaskEditForm.tsx`, `TaskMenu.tsx`, `format.ts` and the
// stylesheet they share moved with this interface, which used to live in `TaskRow.tsx`.
//
// **The writes moved with it, not only the markup.** Today's copy of them was about seventy lines of
// `run(...)` calls, and a second hand-written copy in the document view is exactly the drift
// Decision 53 records: two surfaces that disagree about whether a repeat says so, or about where a
// refusal appears. Each surface supplies what is genuinely its own — how to re-read after a write,
// and whether it has anywhere to open an Ask.
//
// Failure behavior: §13.5's routing, inherited from `writes.ts`. Everything fired from the row menu
// toasts, because a menu has no on-screen origin; the inline edit's refusal is returned to the form,
// which still holds every character that was typed.

"use client";

import { useState } from "react";
import { reportNotice, useTaskWrites } from "./writes";
import type { TaskWrites } from "./writes";
import type { Task } from "@/lib/store/tasks";

/** What a row can ask its surface to do. Held by the surface, which owns the writes. */
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
  /** Absent where there is no composer to open — the document view's own composer is the Ask there. */
  ask?: (task: Task) => void;
}

export interface TaskActionsOptions {
  /** Run after a write landed, for a surface that re-reads itself rather than through the server. */
  onChanged?: () => void;
  /** §9.6's "Ask about this". Omitted where no composer sheet is mounted. */
  ask?: (task: Task) => void;
}

export function useTaskActions(options: TaskActionsOptions = {}): { actions: RowActions; run: TaskWrites["run"] } {
  const { busyId, run, submit } = useTaskWrites();
  const [editingId, setEditingId] = useState<string | null>(null);
  const changed = (): void => options.onChanged?.();

  const actions: RowActions = {
    editingId,
    busyId,

    complete: (task) => {
      void (async () => {
        const sent = await run(task.id, `Could not complete '${task.title}'`, `/api/tasks/${task.id}/complete`, {
          method: "POST",
        });
        if (sent.error !== null) return;
        changed();
        // A repeat materializes its next instance in the same batch (§4.1). It lands on a later day,
        // so it leaves the screen as it is created; saying so is the only way to know it happened.
        if (sent.data.repeated === true) reportNotice(`'${task.title}' repeats — the next one is scheduled.`);
      })();
    },

    duplicate: (task) => {
      void run(task.id, `Could not duplicate '${task.title}'`, "/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              title: task.title,
              body: task.body,
              priority: task.priority,
              estimateMin: task.estimateMin,
              due: task.due,
              scheduled: task.scheduled,
              category: task.category,
              context: task.context,
              tags: task.tags,
              links: task.links,
              repeat: task.repeat,
              repeatUntil: task.repeatUntil,
            },
          ],
          source: "manual",
        }),
      }).then((sent) => {
        if (sent.error === null) changed();
      });
    },

    reschedule: (task, day) => {
      void run(task.id, `Could not reschedule '${task.title}'`, `/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ scheduled: day }),
      }).then((sent) => {
        if (sent.error === null) changed();
      });
    },

    remove: (task) => {
      void run(task.id, `Could not delete '${task.title}'`, `/api/tasks/${task.id}`, { method: "DELETE" }).then((sent) => {
        if (sent.error === null) changed();
      });
    },

    startEdit: (task) => setEditingId(task.id),
    cancelEdit: () => setEditingId(null),

    // The write with an on-screen origin, so its failure is shown inline rather than as a toast
    // (§13.5). The form is still there holding what was typed, and that is where the message belongs.
    save: async (task, changes) => {
      const error = await submit(task.id, `/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(changes) });
      if (error !== null) return error;
      setEditingId(null);
      changed();
      return null;
    },

    ...(options.ask === undefined ? {} : { ask: options.ask }),
  };

  return { actions, run };
}
