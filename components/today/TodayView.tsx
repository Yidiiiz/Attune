// Owns: the client half of the Today tab — the state a day view has (which row is being edited,
// which is busy, whether the schedule is showing) and every write the tab can make. The ranking
// happened on the server in `app/page.tsx`; nothing here reorders anything.
//
// Every mutation goes through an API route, per §3: this is a component, so it never touches
// `lib/store` or `runBatch` itself. After a write it calls `router.refresh()` and lets the server
// re-rank, rather than patching a local copy — one source of truth for what the day looks like, and
// the refusal case then needs no unwinding because nothing was changed in advance.
//
// Failure behavior follows §13.5's rule about where an error is shown: a write fired from a row menu
// has no on-screen origin, so it raises a toast naming what did not happen and leaves the row as it
// was; a refused *edit* has one, so the message goes back to the form, which still holds every
// character that was typed. That rule is not implemented here — it lives in
// `components/tasks/writes.ts`, which the calendar's toolbar uses too (Decision 53), so the two
// surfaces cannot drift into disagreeing about where an error appears.

"use client";

import { useCallback, useEffect, useState } from "react";
import type { Task } from "@/lib/store/tasks";
import type { Settings } from "@/lib/store/settings";
import type { RankedDay } from "@/lib/schedule/rank";
import { reportNotice, useTaskWrites } from "@/components/tasks/writes";
import { openComposer } from "@/components/composer/ComposerButton";
import { clockLabel } from "./format";
import DayHeader from "./DayHeader";
import FirstRunCard from "./FirstRunCard";
import TaskList from "./TaskList";
import Timeline from "./Timeline";
import Weather from "./Weather";
import type { RowActions } from "./TaskRow";
import styles from "./TaskList.module.css";

export interface TodayViewProps {
  date: string;
  today: string;
  settings: Settings;
  ranked: RankedDay;
  /** Tasks pinned to a clock time on this day, for the timeline. Chosen on the server. */
  fixed: Task[];
  /** Paths `listTasks` could not parse, shown as one line rather than swallowed (§5). */
  errors: string[];
  nowMs: number;
}

const SCHEDULE_KEY = "today.schedule";

export default function TodayView({ date, today, settings, ranked, fixed, errors, nowMs }: TodayViewProps) {
  const { busyId, run, submit } = useTaskWrites();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Per-device UI state lives in localStorage, not settings.json (Decision 19). Read after mount so
  // the server and the first client render agree.
  useEffect(() => {
    try {
      setScheduleOpen(window.localStorage.getItem(SCHEDULE_KEY) === "1");
    } catch {
      // a browser refusing storage is not a reason to fail the page
    }
  }, []);

  const toggleSchedule = useCallback(() => {
    setScheduleOpen((open) => {
      const next = !open;
      try {
        window.localStorage.setItem(SCHEDULE_KEY, next ? "1" : "0");
      } catch {
        // as above: the toggle still works for this page load
      }
      return next;
    });
  }, []);

  const actions: RowActions = {
    editingId,
    busyId,

    complete: (task) => {
      void (async () => {
        const sent = await run(task.id, `Could not complete '${task.title}'`, `/api/tasks/${task.id}/complete`, {
          method: "POST",
        });
        // A repeat materializes its next instance in the same batch (§4.1). It lands on a later day,
        // so it leaves the screen as it is created; saying so is the only way to know it happened.
        if (sent.error === null && sent.data.repeated === true) {
          reportNotice(`'${task.title}' repeats — the next one is scheduled.`);
        }
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
      });
    },

    reschedule: (task, day) => {
      void run(task.id, `Could not reschedule '${task.title}'`, `/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ scheduled: day }),
      });
    },

    remove: (task) => {
      void run(task.id, `Could not delete '${task.title}'`, `/api/tasks/${task.id}`, { method: "DELETE" });
    },

    startEdit: (task) => setEditingId(task.id),
    cancelEdit: () => setEditingId(null),

    // The write with an on-screen origin, so its failure is shown inline rather than as a toast
    // (§13.5). The form is still there holding what was typed, and that is where the message belongs.
    save: async (task, changes) => {
      const error = await submit(task.id, `/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      if (error !== null) return error;
      setEditingId(null);
      return null;
    },

    // §9.6: the sheet opens in Ask mode carrying the task. The Phase 3 stub that stood here
    // said nothing was sent; now the sheet says that itself, inline, if a send is attempted.
    ask: (task) => openComposer({ mode: "ask", task: { id: task.id, title: task.title } }),
  };

  return (
    <div className={styles.today}>
      <DayHeader
        date={date}
        today={today}
        scheduleOpen={scheduleOpen}
        onToggleSchedule={toggleSchedule}
        weather={<Weather date={date} today={today} enabled={settings.weather.lat !== undefined && settings.weather.lon !== undefined} />}
      />

      {settings.identity.name === "" ? <FirstRunCard settings={settings} /> : null}

      {errors.length > 0 ? (
        <p className={styles.warning} role="status">
          {errors.length === 1 ? "One task file could not be read" : `${errors.length} task files could not be read`}
          : {errors.join(", ")}. The rest of the day is below.
        </p>
      ) : null}


      {scheduleOpen ? (
        <Timeline
          focus={ranked.focus}
          fixed={fixed}
          settings={settings}
          viewDate={date}
          nowMs={nowMs}
          onSchedule={(task, startMin) => {
            void run(task.id, `Could not move '${task.title}'`, `/api/tasks/${task.id}`, {
              method: "PATCH",
              body: JSON.stringify({ scheduled: `${date}T${clockLabel(startMin)}` }),
            });
          }}
        />
      ) : null}

      <TaskList
        ranked={ranked}
        viewDate={date}
        showCompleted={settings.list.showCompleted}
        actions={actions}
      />
    </div>
  );
}
