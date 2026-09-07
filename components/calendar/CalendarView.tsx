// Owns: the client half of the Calendar tab (PROJECT.md §10.3) — which item is selected, what is
// being dragged, and every write the tab can make. The grid and the grouping happened on the server
// in `app/calendar/page.tsx`; nothing here re-derives them.
//
// Writes go through `components/tasks/writes.ts`, the same layer Today uses (Decision 53), so a
// failure here lands where §13.5 says it should without this file restating the rule.
//
// Navigation is `<Link>` and the URL: `?view=` and `?anchor=` are the whole of the view state, so
// the arrows and the Today button work before JS loads and a particular week can be linked to. The
// ↑/↓ keys move the anchor by a week, which is the same navigation by another route.
//
// Drag is native HTML5 per §10.3. `shiftKey` is read on every `dragover` rather than at drag start,
// because the hint has to change while the key is held down, and it is read again on the drop so
// what is written is what the hint last said.

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/store/tasks";
import type { CalendarDays, CalendarGrid as Grid, CalendarView as View } from "@/lib/schedule/calendar";
import { shiftAnchor } from "@/lib/schedule/calendar";
import { datePart } from "@/lib/schedule/dates";
import { reportNotice, useTaskWrites } from "@/components/tasks/writes";
import { openComposer } from "@/components/composer/ComposerButton";
import CalendarGrid from "./CalendarGrid";
import SelectionBar from "./SelectionBar";
import styles from "./Calendar.module.css";

export interface CalendarViewProps {
  grid: Grid;
  days: CalendarDays;
  today: string;
  /** Paths `listTasks` could not parse, shown as one line rather than swallowed (§5). */
  errors: string[];
}

const VIEW_LABEL: Record<View, string> = { rolling: "Rolling", month: "Month", week: "Week" };

const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const noon = (date: string): Date => new Date(`${date}T12:00:00Z`);

/** What the header says the view is showing. Month names its month; the others name their range. */
function periodLabel(grid: Grid): string {
  if (grid.view === "month") return MONTH_YEAR.format(noon(grid.anchor));
  return `${MONTH_DAY.format(noon(grid.from))} – ${MONTH_DAY.format(noon(grid.to))}`;
}

const href = (view: View, anchor?: string): string =>
  anchor === undefined ? `/calendar?view=${view}` : `/calendar?view=${view}&anchor=${anchor}`;

export default function CalendarView({ grid, days, today, errors }: CalendarViewProps) {
  const router = useRouter();
  const { busyId, run, submit } = useTaskWrites();
  const [selected, setSelected] = useState<Task | null>(null);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [dropping, setDropping] = useState<{ date: string; field: "scheduled" | "due" } | null>(null);

  const move = useCallback(
    (direction: -1 | 1) => router.push(href(grid.view, shiftAnchor(grid.view, grid.anchor, direction))),
    [router, grid.view, grid.anchor],
  );

  // ↑/↓ scroll the view by a unit (§10.3). Ignored while a field has focus, so typing a date into
  // the toolbar is not also navigation, and ignored with a modifier so browser shortcuts still work.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target !== null && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      move(event.key === "ArrowUp" ? -1 : 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [move]);

  const clearSelection = () => {
    setSelected(null);
    setEditing(false);
  };

  /**
   * One `task.update` batch per drop (§10.3). A drop on the day the task already sits on writes
   * nothing: the PATCH would be a no-op change that still costs a commit.
   */
  const drop = (date: string, shift: boolean) => {
    const task = dragging;
    setDragging(null);
    setDropping(null);
    if (task === null) return;

    const field = shift ? "due" : "scheduled";
    const current = task[field];
    if (current !== null && datePart(current) === date) return;

    void run(task.id, `Could not move '${task.title}'`, `/api/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ [field]: date }),
    });
  };

  return (
    <div className={styles.calendar}>
      <header className={styles.header}>
        <nav className={styles.views} aria-label="Calendar view">
          {(["rolling", "month", "week"] as const).map((view) => (
            <Link
              key={view}
              href={href(view, grid.view === view ? grid.anchor : undefined)}
              className={`${styles.viewLink} ${grid.view === view ? styles.viewCurrent : ""}`}
              aria-current={grid.view === view ? "page" : undefined}
            >
              {VIEW_LABEL[view]}
            </Link>
          ))}
        </nav>

        <div className={styles.period}>
          <Link
            className={styles.arrow}
            href={href(grid.view, shiftAnchor(grid.view, grid.anchor, -1))}
            aria-label="Previous"
          >
            ←
          </Link>
          <h1 className={styles.periodLabel}>{periodLabel(grid)}</h1>
          <Link
            className={styles.arrow}
            href={href(grid.view, shiftAnchor(grid.view, grid.anchor, 1))}
            aria-label="Next"
          >
            →
          </Link>
        </div>

        <Link className={styles.todayLink} href={href(grid.view)}>
          Today
        </Link>
      </header>

      {errors.length > 0 ? (
        <p className={styles.warning} role="status">
          {errors.length === 1 ? "One task file could not be read" : `${errors.length} task files could not be read`}
          : {errors.join(", ")}. The rest of the calendar is below.
        </p>
      ) : null}

      {dragging !== null ? (
        <p className={styles.dragNote} role="status">
          Drop on a day to schedule it there — hold <kbd>Shift</kbd> to set the due date instead.
        </p>
      ) : null}

      <CalendarGrid
        grid={grid}
        days={days}
        today={today}
        selectedId={selected?.id ?? null}
        busyId={busyId}
        dropping={dropping}
        onSelect={(task) => {
          setSelected(task);
          setEditing(false);
        }}
        onDragStart={(task) => {
          setDragging(task);
          setDropping(null);
        }}
        onDragOver={(date, shift) => setDropping({ date, field: shift ? "due" : "scheduled" })}
        onDragLeave={(date) => setDropping((current) => (current?.date === date ? null : current))}
        onDrop={drop}
      />


      {selected !== null ? (
        <SelectionBar
          task={selected}
          today={today}
          busy={busyId === selected.id}
          editing={editing}
          onClose={clearSelection}
          onStartEdit={() => setEditing(true)}
          onCancelEdit={() => setEditing(false)}
          onAsk={(task) => openComposer({ mode: "ask", task: { id: task.id, title: task.title } })}
          onComplete={(task) => {
            void (async () => {
              const sent = await run(task.id, `Could not complete '${task.title}'`, `/api/tasks/${task.id}/complete`, {
                method: "POST",
              });
              // The next instance of a repeat lands on a later day, possibly outside this view, so
              // the only way to know it happened is to be told (§4.1).
              if (sent.error === null && sent.data.repeated === true) {
                reportNotice(`'${task.title}' repeats — the next one is scheduled.`);
              }
              if (sent.error === null) clearSelection();
            })();
          }}
          onDuplicate={(task) => {
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
          }}
          onReschedule={(task, date) => {
            void run(task.id, `Could not reschedule '${task.title}'`, `/api/tasks/${task.id}`, {
              method: "PATCH",
              body: JSON.stringify({ scheduled: date }),
            });
          }}
          onRemove={(task) => {
            void (async () => {
              const sent = await run(task.id, `Could not delete '${task.title}'`, `/api/tasks/${task.id}`, {
                method: "DELETE",
              });
              if (sent.error === null) clearSelection();
            })();
          }}
          onSave={async (task, changes) => {
            const error = await submit(task.id, `/api/tasks/${task.id}`, {
              method: "PATCH",
              body: JSON.stringify(changes),
            });
            if (error !== null) return error;
            clearSelection();
            return null;
          }}
        />
      ) : null}
    </div>
  );
}
