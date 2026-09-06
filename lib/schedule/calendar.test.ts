// Covers PROJECT.md §10.3: the shape of each view's grid, the two `firstDayOfWeek` alignments, the
// months that come out at four, five and six rows, both 2026 `America/New_York` DST transitions,
// and the grouping rule — `due` or `scheduled`, plus `completedAt`, with archived tasks in neither
// (Decision 54). The DST cases are the reason this module never builds a local `Date`: a week
// spanning March 8 is still seven cells, and a naive local-time step produces six or eight.

import { describe, expect, it } from "vitest";
import {
  cellDate,
  gridFor,
  groupDays,
  isCalendarView,
  shiftAnchor,
  startOfWeek,
  weekdayOf,
} from "./calendar.ts";
import type { Task } from "../store/tasks.ts";

/** A complete task, so a test can name only the fields the case is about. */
function task(fields: Partial<Task> & { id: string; title: string }): Task {
  return {
    schema: 1,
    status: "todo",
    priority: 3,
    estimateMin: null,
    due: null,
    scheduled: null,
    completedAt: null,
    category: null,
    context: null,
    tags: [],
    links: [],
    repeat: null,
    repeatUntil: null,
    source: "manual",
    collection: null,
    createdAt: "2026-09-01T09:00:00-04:00",
    updatedAt: "2026-09-01T09:00:00-04:00",
    createdBy: "user",
    path: `tasks/2026-09-01-${fields.id}.md`,
    body: "",
    ...fields,
  } as Task;
}

const ids = (tasks: Task[]): string[] => tasks.map((t) => t.id);

describe("weekdayOf", () => {
  it("reads the weekday of a date-only string, 0 = Sunday", () => {
    expect(weekdayOf("2026-09-06")).toBe(0); // a Sunday
    expect(weekdayOf("2026-09-07")).toBe(1);
    expect(weekdayOf("2026-09-12")).toBe(6);
    expect(weekdayOf("1970-01-01")).toBe(4); // the epoch was a Thursday
  });

  it("is unaffected by a DST transition falling inside the same week", () => {
    expect(weekdayOf("2026-03-07")).toBe(6);
    expect(weekdayOf("2026-03-08")).toBe(0); // spring forward in America/New_York
    expect(weekdayOf("2026-03-09")).toBe(1);
    expect(weekdayOf("2026-11-01")).toBe(0); // fall back
    expect(weekdayOf("2026-11-02")).toBe(1);
  });
});

describe("startOfWeek", () => {
  it("aligns to Monday or Sunday as asked", () => {
    expect(startOfWeek("2026-09-10", "monday")).toBe("2026-09-07");
    expect(startOfWeek("2026-09-10", "sunday")).toBe("2026-09-06");
  });

  it("returns the date itself when it is already the first day", () => {
    expect(startOfWeek("2026-09-07", "monday")).toBe("2026-09-07");
    expect(startOfWeek("2026-09-06", "sunday")).toBe("2026-09-06");
  });
});

describe("gridFor — rolling", () => {
  it("is four rows of seven starting at the anchor, not at a week boundary", () => {
    const grid = gridFor("rolling", "2026-09-10", "monday");
    expect(grid.rows).toHaveLength(4);
    expect(grid.rows.every((row) => row.length === 7)).toBe(true);
    expect(grid.rows[0][0]).toBe("2026-09-10"); // a Thursday: the anchor, not the Monday before it
    expect(grid.from).toBe("2026-09-10");
    expect(grid.to).toBe("2026-10-07");
    expect(grid.rows[3][6]).toBe("2026-10-07");
  });

  it("has no weekday header, because column three is a different weekday each row", () => {
    expect(gridFor("rolling", "2026-09-10", "monday").weekdays).toEqual([]);
  });

  it("ignores firstDayOfWeek", () => {
    const mon = gridFor("rolling", "2026-09-10", "monday");
    const sun = gridFor("rolling", "2026-09-10", "sunday");
    expect(sun.rows).toEqual(mon.rows);
  });
});

describe("gridFor — week", () => {
  it("is one aligned row of seven containing the anchor", () => {
    const grid = gridFor("week", "2026-09-10", "monday");
    expect(grid.rows).toEqual([
      ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"],
    ]);
    expect(grid.from).toBe("2026-09-07");
    expect(grid.to).toBe("2026-09-13");
    expect(grid.weekdays).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("starts on Sunday when settings say so", () => {
    const grid = gridFor("week", "2026-09-10", "sunday");
    expect(grid.rows[0][0]).toBe("2026-09-06");
    expect(grid.weekdays).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });
});

describe("gridFor — month", () => {
  it("covers a four-row month: February 2027 is 28 days beginning on a Monday", () => {
    const grid = gridFor("month", "2027-02-15", "monday");
    expect(grid.rows).toHaveLength(4);
    expect(grid.from).toBe("2027-02-01");
    expect(grid.to).toBe("2027-02-28");
  });

  it("that same month needs five rows when the week starts on Sunday", () => {
    const grid = gridFor("month", "2027-02-15", "sunday");
    expect(grid.rows).toHaveLength(5);
    expect(grid.from).toBe("2027-01-31");
    expect(grid.to).toBe("2027-03-06");
  });

  it("covers a five-row month", () => {
    const grid = gridFor("month", "2026-09-06", "monday");
    expect(grid.rows).toHaveLength(5);
    expect(grid.from).toBe("2026-08-31");
    expect(grid.to).toBe("2026-10-04");
  });

  it("covers a six-row month: August 2026 is 31 days beginning on a Saturday", () => {
    const grid = gridFor("month", "2026-08-20", "monday");
    expect(grid.rows).toHaveLength(6);
    expect(grid.from).toBe("2026-07-27");
    expect(grid.to).toBe("2026-09-06");
  });

  it("pads with adjacent-month days rather than blanks", () => {
    const grid = gridFor("month", "2026-09-06", "monday");
    expect(grid.rows[0][0]).toBe("2026-08-31");
    expect(grid.rows[4][6]).toBe("2026-10-04");
  });
});

describe("gridFor — DST", () => {
  for (const [name, anchor] of [
    ["spring forward, March 8 2026", "2026-03-08"],
    ["fall back, November 1 2026", "2026-11-01"],
  ] as const) {
    it(`gives every view whole rows of seven distinct dates across ${name}`, () => {
      for (const view of ["rolling", "month", "week"] as const) {
        for (const firstDay of ["monday", "sunday"] as const) {
          const grid = gridFor(view, anchor, firstDay);
          const flat = grid.rows.flat();
          expect(flat).toHaveLength(grid.rows.length * 7);
          expect(new Set(flat).size).toBe(flat.length);
          expect(flat[0]).toBe(grid.from);
          expect(flat[flat.length - 1]).toBe(grid.to);
        }
      }
    });
  }

  it("keeps the transition day itself in the grid exactly once", () => {
    const grid = gridFor("rolling", "2026-03-01", "monday");
    expect(grid.rows.flat().filter((d) => d === "2026-03-08")).toEqual(["2026-03-08"]);
  });

  it("steps consecutively across the transition rather than skipping or repeating a day", () => {
    const week = gridFor("week", "2026-03-08", "monday").rows[0];
    expect(week).toEqual([
      "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08",
    ]);
  });
});

describe("shiftAnchor", () => {
  it("moves rolling and week by seven days in each direction", () => {
    expect(shiftAnchor("rolling", "2026-09-10", 1)).toBe("2026-09-17");
    expect(shiftAnchor("rolling", "2026-09-10", -1)).toBe("2026-09-03");
    expect(shiftAnchor("week", "2026-09-10", 1)).toBe("2026-09-17");
  });

  it("moves month by a calendar month", () => {
    expect(shiftAnchor("month", "2026-09-15", 1)).toBe("2026-10-15");
    expect(shiftAnchor("month", "2026-09-15", -1)).toBe("2026-08-15");
    expect(shiftAnchor("month", "2026-12-15", 1)).toBe("2027-01-15");
    expect(shiftAnchor("month", "2026-01-15", -1)).toBe("2025-12-15");
  });

  it("clamps to the last day rather than spilling into the following month", () => {
    expect(shiftAnchor("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftAnchor("month", "2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftAnchor("month", "2028-01-31", 1)).toBe("2028-02-29"); // a leap year
  });

  it("still lands on the intended month when a DST transition is inside it", () => {
    expect(shiftAnchor("month", "2026-02-08", 1)).toBe("2026-03-08");
    expect(shiftAnchor("rolling", "2026-03-05", 1)).toBe("2026-03-12");
    expect(shiftAnchor("rolling", "2026-10-29", 1)).toBe("2026-11-05");
  });
});

describe("isCalendarView", () => {
  it("accepts the three views and nothing else", () => {
    expect(isCalendarView("rolling")).toBe(true);
    expect(isCalendarView("month")).toBe(true);
    expect(isCalendarView("week")).toBe(true);
    expect(isCalendarView("day")).toBe(false);
    expect(isCalendarView(undefined)).toBe(false);
    expect(isCalendarView(["rolling"])).toBe(false);
  });
});

describe("cellDate", () => {
  it("prefers due, falls back to scheduled, and is null with neither", () => {
    expect(cellDate(task({ id: "a", title: "A", due: "2026-09-10", scheduled: "2026-09-12" }))).toBe("2026-09-10");
    expect(cellDate(task({ id: "b", title: "B", scheduled: "2026-09-12" }))).toBe("2026-09-12");
    expect(cellDate(task({ id: "c", title: "C" }))).toBe(null);
  });

  it("reads the date half of a date-time", () => {
    expect(cellDate(task({ id: "d", title: "D", scheduled: "2026-09-10T14:30" }))).toBe("2026-09-10");
  });

  it("is null for a value that is not a date", () => {
    expect(cellDate(task({ id: "e", title: "E", due: "next tuesday" }))).toBe(null);
  });
});

describe("groupDays", () => {
  const tasks = [
    task({ id: "due-mid", title: "Due mid-range", due: "2026-09-10" }),
    task({ id: "sched-only", title: "Scheduled only", scheduled: "2026-09-11" }),
    task({ id: "both", title: "Both fields", due: "2026-09-10", scheduled: "2026-09-12" }),
    task({ id: "undated", title: "No date at all" }),
    task({ id: "outside", title: "Outside the range", due: "2026-10-20" }),
    task({
      id: "done-yesterday",
      title: "Finished yesterday",
      status: "done",
      due: "2026-09-05",
      completedAt: "2026-09-05T16:00:00-04:00",
    }),
    task({
      id: "archived",
      title: "Archived",
      status: "archived",
      due: "2026-09-10",
      completedAt: "2026-09-10T10:00:00-04:00",
    }),
  ];

  const days = groupDays(tasks, "2026-09-05", "2026-09-12");

  it("gives every date in the range an entry, empty ones included", () => {
    expect(Object.keys(days)).toEqual([
      "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08",
      "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12",
    ]);
    expect(days["2026-09-08"]).toEqual({ due: [], completed: [] });
  });

  it("places a task by due, and by scheduled only when there is no due", () => {
    expect(ids(days["2026-09-10"].due)).toEqual(["both", "due-mid"]);
    expect(ids(days["2026-09-11"].due)).toEqual(["sched-only"]);
    expect(ids(days["2026-09-12"].due)).toEqual([]); // `both` hangs on its due date, not its scheduled
  });

  it("places a completed task on its completedAt day", () => {
    expect(ids(days["2026-09-05"].completed)).toEqual(["done-yesterday"]);
  });

  it("leaves an undated task, an out-of-range task, and an archived task out of every cell", () => {
    const everything = Object.values(days).flatMap((d) => [...ids(d.due), ...ids(d.completed)]);
    expect(everything).not.toContain("undated");
    expect(everything).not.toContain("outside");
    expect(everything).not.toContain("archived");
  });

  it("keeps an open overdue task in its due-date cell — Decision 54", () => {
    const missed = task({ id: "missed", title: "Missed it", due: "2026-09-01" });
    const grouped = groupDays([missed], "2026-08-30", "2026-09-06");
    expect(ids(grouped["2026-09-01"].due)).toEqual(["missed"]);
    expect(grouped["2026-09-01"].completed).toEqual([]);
  });

  it("puts a task done on the day it was due into both lists, so either cell mode finds it", () => {
    const sameDay = task({
      id: "same",
      title: "Done on time",
      status: "done",
      due: "2026-09-05",
      completedAt: "2026-09-05T09:00:00-04:00",
    });
    const grouped = groupDays([sameDay], "2026-09-05", "2026-09-05");
    expect(ids(grouped["2026-09-05"].due)).toEqual(["same"]);
    expect(ids(grouped["2026-09-05"].completed)).toEqual(["same"]);
  });

  it("treats an unparsable due as undated instead of throwing", () => {
    const broken = task({ id: "broken", title: "Broken", due: "whenever" });
    const grouped = groupDays([broken, task({ id: "fine", title: "Fine", due: "2026-09-10" })], "2026-09-09", "2026-09-11");
    expect(ids(grouped["2026-09-10"].due)).toEqual(["fine"]);
  });

  it("orders a cell by time of day, then priority, then title, then id", () => {
    const cell = groupDays(
      [
        task({ id: "z", title: "Zulu", due: "2026-09-10" }),
        task({ id: "a", title: "Alpha", due: "2026-09-10" }),
        task({ id: "p1", title: "Urgent", due: "2026-09-10", priority: 1 }),
        task({ id: "t9", title: "Nine o'clock", scheduled: "2026-09-10T09:00" }),
        task({ id: "t7", title: "Seven o'clock", scheduled: "2026-09-10T07:00" }),
      ],
      "2026-09-10",
      "2026-09-10",
    );
    expect(ids(cell["2026-09-10"].due)).toEqual(["t7", "t9", "p1", "a", "z"]);
  });

  it("orders completed by when they were finished", () => {
    const cell = groupDays(
      [
        task({ id: "late", title: "Late", status: "done", completedAt: "2026-09-05T18:00:00-04:00" }),
        task({ id: "early", title: "Early", status: "done", completedAt: "2026-09-05T08:00:00-04:00" }),
      ],
      "2026-09-05",
      "2026-09-05",
    );
    expect(ids(cell["2026-09-05"].completed)).toEqual(["early", "late"]);
  });

  it("gives an identical grouping for shuffled input — the property the calendar depends on", () => {
    const shuffled = [...tasks].reverse();
    expect(JSON.stringify(groupDays(shuffled, "2026-09-05", "2026-09-12"))).toBe(
      JSON.stringify(groupDays(tasks, "2026-09-05", "2026-09-12")),
    );
  });

  it("spans a DST transition without losing or repeating a day", () => {
    const grouped = groupDays([], "2026-03-05", "2026-03-11");
    expect(Object.keys(grouped)).toEqual([
      "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11",
    ]);
  });
});
