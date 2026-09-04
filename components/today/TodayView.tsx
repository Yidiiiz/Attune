// Owns: the client half of the Today tab — the state a day view has (which row is being edited,
// which is busy, whether the schedule is showing) and every write the tab can make. The ranking
// happened on the server in `app/page.tsx`; nothing here reorders anything.
//
// Every mutation goes through an API route, per §3: this is a component, so it never touches
// `lib/store` or `runBatch` itself. After a write it calls `router.refresh()` and lets the server
// re-rank, rather than patching a local copy — one source of truth for what the day looks like, and
// the refusal case then needs no unwinding because nothing was changed in advance.
//
// Failure behavior: a failed write raises a toast naming what did not happen and leaves the row as
// it was. A refused *edit* is different and deliberate — the message goes back to the form, which
// still holds every character that was typed (§13.5).

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/store/tasks";
import type { Settings } from "@/lib/store/settings";
import type { RankedDay } from "@/lib/schedule/rank";
import { showToast } from "@/components/shell/Toast";
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

/** Error toasts are per click, not per kind, so a second failure is not silently deduped. */
let toastSeq = 0;

interface Failure {
  message: string;
}

interface Sent {
  failure: Failure | null;
  data: Record<string, unknown>;
}

async function send(url: string, init: RequestInit): Promise<Sent> {
  try {
    const response = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.ok) return { failure: null, data };
    return { failure: { message: data.error ?? `${response.status} ${response.statusText}` }, data };
  } catch (err) {
    return { failure: { message: (err as Error).message }, data: {} };
  }
}

export default function TodayView({ date, today, settings, ranked, fixed, errors, nowMs }: TodayViewProps) {
  const router = useRouter();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [asking, setAsking] = useState<Task | null>(null);

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

  const fail = (what: string, failure: Failure) => {
    toastSeq += 1;
    showToast({ id: `today:${toastSeq}`, tone: "error", text: `${what} — ${failure.message}` });
  };

  const run = async (task: Task, what: string, url: string, init: RequestInit): Promise<Sent> => {
    setBusyId(task.id);
    const sent = await send(url, init);
    setBusyId(null);
    if (sent.failure) fail(what, sent.failure);
    else router.refresh();
    return sent;
  };

  const actions: RowActions = {
    editingId,
    busyId,

    complete: (task) => {
      void (async () => {
        const sent = await run(task, `Could not complete '${task.title}'`, `/api/tasks/${task.id}/complete`, {
          method: "POST",
        });
        // A repeat materializes its next instance in the same batch (§4.1). It lands on a later day,
        // so it leaves the screen as it is created; saying so is the only way to know it happened.
        if (!sent.failure && sent.data.repeated === true) {
          toastSeq += 1;
          showToast({ id: `repeat:${toastSeq}`, text: `'${task.title}' repeats — the next one is scheduled.` });
        }
      })();
    },

    duplicate: (task) => {
      void run(task, `Could not duplicate '${task.title}'`, "/api/tasks", {
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
      void run(task, `Could not reschedule '${task.title}'`, `/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ scheduled: day }),
      });
    },

    remove: (task) => {
      void run(task, `Could not delete '${task.title}'`, `/api/tasks/${task.id}`, { method: "DELETE" });
    },

    startEdit: (task) => setEditingId(task.id),
    cancelEdit: () => setEditingId(null),

    // The one write whose failure does not become a toast: the form is still on screen holding what
    // was typed, and that is where the message belongs (§13.5, amendment `j`).
    save: async (task, changes) => {
      setBusyId(task.id);
      const { failure } = await send(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      setBusyId(null);
      if (failure) return failure.message;
      setEditingId(null);
      router.refresh();
      return null;
    },

    ask: (task) => setAsking(task),
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

      {asking ? (
        <div className={styles.ask} role="status">
          <span className={styles.askMode}>Ask mode</span>
          <span className={styles.askDot} aria-hidden="true">
            ·
          </span>
          <span className={styles.askTitle}>{asking.title}</span>
          <span className={styles.askNote}>The composer arrives in Phase 5; nothing was sent.</span>
          <button type="button" className={styles.askClose} onClick={() => setAsking(null)} aria-label="Close">
            ×
          </button>
        </div>
      ) : null}

      {scheduleOpen ? (
        <Timeline
          focus={ranked.focus}
          fixed={fixed}
          settings={settings}
          viewDate={date}
          nowMs={nowMs}
          onSchedule={(task, startMin) => {
            void run(task, `Could not move '${task.title}'`, `/api/tasks/${task.id}`, {
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
