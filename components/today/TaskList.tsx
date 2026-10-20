// Owns: the work and optional sections of the Today body (PROJECT.md §10.1) — Overdue, Today's focus, Also
// possible, Wants, Done today — and nothing about what a row does. The order and membership were decided
// by `rankDay` before this file saw them; this is the part that draws them.
//
// Failure behavior: an empty day renders a sentence rather than four empty headings, and a section
// with nothing in it is absent rather than present-and-empty, which is what §10.1 asks for.

"use client";

import { useEffect, useState } from "react";
import type { Task } from "@/lib/store/tasks";
import { datePart } from "@/lib/schedule/dates";
import type { RankedDay } from "@/lib/schedule/rank";
import TaskRow from "./TaskRow";
import type { RowActions } from "@/components/tasks/actions";
import styles from "@/components/tasks/TaskList.module.css";

export interface TaskListProps {
  ranked: RankedDay;
  viewDate: string;
  actions: RowActions;
  clock?: { now: Date; timezone: string; defaultTime: string };
}

function Rows({
  tasks,
  viewDate,
  actions,
  muted,
  overdue,
  dimOthers,
  clock,
}: {
  tasks: Task[];
  viewDate: string;
  actions: RowActions;
  muted?: boolean;
  overdue?: boolean;
  dimOthers?: boolean;
  clock?: { now: Date; timezone: string; defaultTime: string };
}) {
  return (
    <ul className={styles.rows}>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          viewDate={viewDate}
          actions={actions}
          muted={muted}
          dimmed={dimOthers && (task.due === null || datePart(task.due) > viewDate)}
          overdue={overdue}
          clock={clock}
        />
      ))}
    </ul>
  );
}

export default function TaskList({ ranked, viewDate, actions, clock }: TaskListProps) {
  const [now, setNow] = useState(clock?.now);
  useEffect(() => {
    if (!clock) return;
    const refresh = () => setNow(new Date());
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [clock?.timezone]);
  const currentClock = clock && now ? { ...clock, now } : undefined;
  const [alsoOpen, setAlsoOpen] = useState(false);
  const [wantsOpen, setWantsOpen] = useState(false);
  const [allWants, setAllWants] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const { overdue, focus, alsoPossible, doneToday, wants = [] } = ranked;
  const dimOthers = [...overdue, ...focus, ...alsoPossible].some(task =>
    (task.status === "todo" || task.status === "doing") && task.due !== null && datePart(task.due) === viewDate);
  const total = overdue.length + focus.length + alsoPossible.length + doneToday.length + wants.length;

  if (total === 0) {
    return <p className={styles.empty}>Nothing for this day. A clear day is an answer too.</p>;
  }

  return (
    <div className={styles.list}>
      {overdue.length > 0 ? (
        <section className={styles.section}>
          <h2 className={`${styles.heading} ${styles.overdueHeading}`}>Overdue</h2>
          <Rows tasks={overdue} viewDate={viewDate} actions={actions} overdue clock={currentClock} />
        </section>
      ) : null}

      {focus.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.heading}>Today&rsquo;s focus</h2>
          <Rows tasks={focus} viewDate={viewDate} actions={actions} dimOthers={dimOthers} clock={currentClock} />
        </section>
      ) : null}

      {alsoPossible.length > 0 ? (
        <section className={styles.section}>
          <button
            type="button"
            className={`${styles.heading} ${styles.toggleHeading}`}
            onClick={() => setAlsoOpen((open) => !open)}
            aria-expanded={alsoOpen}
          >
            <span className={styles.caret} aria-hidden="true">
              {alsoOpen ? "▾" : "▸"}
            </span>
            Also possible
            <span className={styles.count}>{alsoPossible.length}</span>
          </button>
          {alsoOpen ? <Rows tasks={alsoPossible} viewDate={viewDate} actions={actions} dimOthers={dimOthers} clock={currentClock} /> : null}
        </section>
      ) : null}

      {wants.length > 0 ? (
        <section className={styles.section} aria-label="Wants">
          <button type="button" className={`${styles.heading} ${styles.toggleHeading}`} onClick={() => setWantsOpen(open => !open)} aria-expanded={wantsOpen}>
            <span className={styles.caret} aria-hidden="true">{wantsOpen ? "▾" : "▸"}</span>Wants
            <span className={styles.count}>{wants.length}</span>
          </button>
          {wantsOpen ? <>
            <Rows tasks={allWants ? wants : wants.slice(0, 3)} viewDate={viewDate} actions={actions} dimOthers={dimOthers} clock={currentClock} />
            {wants.length > 3 ? <button className={styles.moreWants} type="button" onClick={() => setAllWants(all => !all)}>{allWants ? "Show less" : `Show all ${wants.length}`}</button> : null}
          </> : null}
        </section>
      ) : null}

      {doneToday.length > 0 ? (
        <section className={styles.section}>
          <button type="button" className={`${styles.heading} ${styles.toggleHeading}`} onClick={() => setDoneOpen(open => !open)} aria-expanded={doneOpen}>
            <span className={styles.caret} aria-hidden="true">{doneOpen ? "▾" : "▸"}</span>
            Done
            <span className={styles.count}>{doneToday.length}</span>
          </button>
          {/* Start collapsed on every visit; the local toggle never hides the count. */}
          {doneOpen ? (
            <Rows tasks={doneToday} viewDate={viewDate} actions={actions} muted />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
