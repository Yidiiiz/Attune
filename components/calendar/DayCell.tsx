// Owns: one cell of the calendar grid (PROJECT.md §10.3) — its date, its items, and its behaviour
// as a drop target. It holds one piece of state, whether it has been expanded past five items,
// because that is a property of this cell on this screen and nothing above needs to re-render for
// it.
//
// A past cell shows what was missed as well as what was finished (Decision 54): the due list is
// drawn on every day, and the completed list is folded in on today and past days, minus anything
// already in the due list — a task finished on the day it was due appears once.
//
// Failure behavior: the drop target only ever calls back with a date. The write, its refusal and
// its toast belong to `CalendarView`, so a cell cannot get the error surface wrong.

"use client";

import { useState } from "react";
import type { Task } from "@/lib/store/tasks";
import type { CalendarDay } from "@/lib/schedule/calendar";
import styles from "./Calendar.module.css";

/** Past this many items the cell folds, per §10.3. */
const VISIBLE = 5;

export interface DayCellProps {
  date: string;
  day: CalendarDay;
  today: string;
  /** Set on Month view for the padding days either side of the month being viewed. */
  outside?: boolean;
  selectedId: string | null;
  busyId: string | null;
  /** The date currently under a drag, and what dropping there would write. */
  dropping: { date: string; field: "scheduled" | "due" } | null;
  onSelect: (task: Task) => void;
  onDragStart: (task: Task) => void;
  onDragOver: (date: string, shift: boolean) => void;
  onDragLeave: (date: string) => void;
  onDrop: (date: string, shift: boolean) => void;
}

const time = (task: Task): string | null => {
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(task.due ?? task.scheduled ?? "");
  return match ? match[1] : null;
};

export default function DayCell(props: DayCellProps) {
  const { date, day, today, outside, selectedId, busyId, dropping } = props;
  const [expanded, setExpanded] = useState(false);

  const past = date < today;
  const isToday = date === today;

  const dueIds = new Set(day.due.map((task) => task.id));
  const items =
    past || isToday
      ? [...day.due, ...day.completed.filter((task) => !dueIds.has(task.id))]
      : day.due;

  const hidden = expanded ? 0 : Math.max(0, items.length - VISIBLE);
  const shown = expanded ? items : items.slice(0, VISIBLE);
  const active = dropping?.date === date ? dropping.field : null;

  const classes = [
    styles.cell,
    past ? styles.pastCell : "",
    isToday ? styles.todayCell : "",
    outside ? styles.outsideCell : "",
    active !== null ? styles.dropTarget : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      // The cell's date in the DOM. Nothing in the app reads it; it is what lets an acceptance
      // check name a cell, since a cell otherwise shows only its day number.
      data-date={date}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        props.onDragOver(date, event.shiftKey);
      }}
      onDragLeave={() => props.onDragLeave(date)}
      onDrop={(event) => {
        event.preventDefault();
        props.onDrop(date, event.shiftKey);
      }}
    >
      <div className={styles.cellHead}>
        <span className={styles.dayNumber}>{Number(date.slice(8, 10))}</span>
        {active !== null ? (
          <span className={styles.dropHint}>{active === "due" ? "set due" : "schedule"}</span>
        ) : null}
      </div>

      <ul className={`${styles.items} ${expanded ? styles.itemsExpanded : ""}`}>
        {shown.map((task) => {
          const done = task.status === "done";
          const overdue = !done && task.status !== "archived" && dueIds.has(task.id) && date < today;
          const at = time(task);
          return (
            <li key={task.id}>
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", task.id);
                  props.onDragStart(task);
                }}
                onClick={() => props.onSelect(task)}
                className={[
                  styles.item,
                  done ? styles.itemDone : "",
                  overdue ? styles.itemOverdue : "",
                  selectedId === task.id ? styles.itemSelected : "",
                  busyId === task.id ? styles.itemBusy : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={selectedId === task.id}
                title={task.title}
              >
                {at !== null ? <span className={styles.itemTime}>{at}</span> : null}
                <span className={styles.itemTitle}>{task.title}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {hidden > 0 ? (
        <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
          {`+${hidden} more`}
        </button>
      ) : null}
      {expanded && items.length > VISIBLE ? (
        <button type="button" className={styles.more} onClick={() => setExpanded(false)}>
          Show less
        </button>
      ) : null}
    </div>
  );
}
