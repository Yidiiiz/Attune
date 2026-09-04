// Owns: the four sections of the Today body (PROJECT.md §10.1) — Overdue, Today's focus, Also
// possible, Done today — and nothing about what a row does. The order and membership were decided
// by `rankDay` before this file saw them; this is the part that draws them.
//
// Failure behavior: an empty day renders a sentence rather than four empty headings, and a section
// with nothing in it is absent rather than present-and-empty, which is what §10.1 asks for.

"use client";

import { useState } from "react";
import type { Task } from "@/lib/store/tasks";
import type { RankedDay } from "@/lib/schedule/rank";
import TaskRow, { type RowActions } from "./TaskRow";
import styles from "./TaskList.module.css";

export interface TaskListProps {
  ranked: RankedDay;
  viewDate: string;
  showCompleted: boolean;
  actions: RowActions;
}

function Rows({
  tasks,
  viewDate,
  actions,
  muted,
  overdue,
}: {
  tasks: Task[];
  viewDate: string;
  actions: RowActions;
  muted?: boolean;
  overdue?: boolean;
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
          overdue={overdue}
        />
      ))}
    </ul>
  );
}

export default function TaskList({ ranked, viewDate, showCompleted, actions }: TaskListProps) {
  const [alsoOpen, setAlsoOpen] = useState(false);
  const { overdue, focus, alsoPossible, doneToday } = ranked;
  const total = overdue.length + focus.length + alsoPossible.length + doneToday.length;

  if (total === 0) {
    return <p className={styles.empty}>Nothing for this day. A clear day is an answer too.</p>;
  }

  return (
    <div className={styles.list}>
      {overdue.length > 0 ? (
        <section className={styles.section}>
          <h2 className={`${styles.heading} ${styles.overdueHeading}`}>Overdue</h2>
          <Rows tasks={overdue} viewDate={viewDate} actions={actions} overdue />
        </section>
      ) : null}

      {focus.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.heading}>Today&rsquo;s focus</h2>
          <Rows tasks={focus} viewDate={viewDate} actions={actions} />
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
          {alsoOpen ? <Rows tasks={alsoPossible} viewDate={viewDate} actions={actions} muted /> : null}
        </section>
      ) : null}

      {doneToday.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.heading}>
            Done
            <span className={styles.count}>{doneToday.length}</span>
          </h2>
          {/* `showCompleted` hides the rows, never the fact that they exist: the count above is the
              honest minimum, and hiding that too would make a finished day look like an empty one. */}
          {showCompleted ? (
            <Rows tasks={doneToday} viewDate={viewDate} actions={actions} muted />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
