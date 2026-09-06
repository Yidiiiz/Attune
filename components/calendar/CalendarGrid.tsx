// Owns: the layout of the calendar grid (PROJECT.md §10.3) — the weekday header, when there is
// one, and the rows of cells. Layout only: it holds no state and makes no writes, so everything
// interactive is one level up in `CalendarView` and one level down in `DayCell`.
//
// Rolling has no weekday header on purpose: it starts at today rather than at a week boundary, so
// column three is a different weekday in every row and a header would be wrong four times over.

"use client";

import type { Task } from "@/lib/store/tasks";
import type { CalendarDays, CalendarGrid as Grid } from "@/lib/schedule/calendar";
import DayCell from "./DayCell";
import styles from "./Calendar.module.css";

export interface CalendarGridProps {
  grid: Grid;
  days: CalendarDays;
  today: string;
  selectedId: string | null;
  busyId: string | null;
  dropping: { date: string; field: "scheduled" | "due" } | null;
  onSelect: (task: Task) => void;
  onDragStart: (task: Task) => void;
  onDragOver: (date: string, shift: boolean) => void;
  onDragLeave: (date: string) => void;
  onDrop: (date: string, shift: boolean) => void;
}

const EMPTY = { due: [], completed: [] };

export default function CalendarGrid({ grid, days, ...rest }: CalendarGridProps) {
  /** Month pads to whole weeks with the days either side; those are drawn faintly. */
  const month = grid.view === "month" ? grid.anchor.slice(0, 7) : null;

  return (
    <div className={styles.grid}>
      {grid.weekdays.length > 0 ? (
        <div className={styles.weekdays}>
          {grid.weekdays.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      ) : null}

      {grid.rows.map((row) => (
        <div className={styles.row} key={row[0]}>
          {row.map((date) => (
            <DayCell
              key={date}
              date={date}
              day={days[date] ?? EMPTY}
              outside={month !== null && date.slice(0, 7) !== month}
              {...rest}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
