// Covers PROJECT.md §10.1: the worked example table column by column, the tie-break, the lookahead
// horizon, and the property the whole module exists for — that the same inputs give the same order
// every time. The example is transcribed from the spec rather than from the implementation, so a
// change to the weights fails here before it reaches a screen.

import { describe, expect, it } from "vitest";
import { availableMinutes, rankDay, scoreParts } from "./rank.ts";
import type { Task } from "../store/tasks.ts";
import type { Settings } from "../store/settings.ts";

const NY = "America/New_York";

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

function settings(over: { focusSize?: number; lookaheadDays?: number } = {}): Settings {
  return {
    timezone: NY,
    day: { startMin: 600, endMin: 1080, blocks: [[600, 780], [840, 1080]], breakMin: 10 },
    list: {
      focusSize: over.focusSize ?? 3,
      lookaheadDays: over.lookaheadDays ?? 14,
      showCompleted: true,
    },
  } as Settings;
}

// 14:00 in New York on the example's Monday. With day.endMin 1080 (18:00) that is the 240 minutes
// the worked example assumes: 1080 − max(840, 600).
const VIEW_DATE = "2026-09-08";
const NOW = new Date("2026-09-08T18:00:00Z");

const PSET = task({
  id: "t_20260901_0001", title: "Pset 4",
  due: "2026-09-10", priority: 2, scheduled: "2026-09-08", estimateMin: 90,
});
const EMAIL = task({ id: "t_20260901_0002", title: "Email advisor", priority: 1, estimateMin: 10 });
const NOTEBOOK = task({
  id: "t_20260901_0003", title: "Buy notebook", due: "2026-09-09", priority: 4, estimateMin: 20,
});
const READ = task({
  id: "t_20260901_0004", title: "Read ch. 5", due: "2026-09-15", priority: 3, estimateMin: 60,
});
const SPRING = task({
  id: "t_20260901_0005", title: "Plan spring courses", due: "2026-10-30", priority: 3, estimateMin: 60,
});
const LAB = task({
  id: "t_20260901_0006", title: "Lab report", due: "2026-09-05", priority: 2, estimateMin: 120,
});

const EXAMPLE = [PSET, EMAIL, NOTEBOOK, READ, SPRING, LAB];

describe("availableMinutes", () => {
  it("is what is left of today from now", () => {
    expect(availableMinutes(VIEW_DATE, settings(), NOW)).toBe(240);
  });

  it("uses day.startMin when now is earlier than the day begins", () => {
    // 07:00 local is before startMin 600, so the day is measured from 10:00: 1080 − 600.
    expect(availableMinutes(VIEW_DATE, settings(), new Date("2026-09-08T11:00:00Z"))).toBe(480);
  });

  it("clamps to zero after the day is over rather than going negative", () => {
    expect(availableMinutes(VIEW_DATE, settings(), new Date("2026-09-09T02:00:00Z"))).toBe(0);
  });

  it("is the sum of the configured blocks for any other day", () => {
    expect(availableMinutes("2026-09-09", settings(), NOW)).toBe(420); // 180 + 240
  });
});

describe("the §10.1 worked example", () => {
  const table = [
    { task: PSET, urgency: 8, priority: 6, scheduled: 6, fit: 1, total: 21 },
    { task: EMAIL, urgency: 0, priority: 11, scheduled: 0, fit: 1, total: 12 },
    { task: NOTEBOOK, urgency: 9, priority: 0, scheduled: 0, fit: 1, total: 10 },
    { task: READ, urgency: 3, priority: 2, scheduled: 0, fit: 1, total: 6 },
    { task: SPRING, urgency: 0, priority: 2, scheduled: 0, fit: 1, total: 3 },
  ];

  for (const row of table) {
    it(`scores '${row.task.title}' as the table says`, () => {
      expect(scoreParts(row.task, VIEW_DATE, 240)).toEqual({
        urgency: row.urgency,
        priority: row.priority,
        scheduled: row.scheduled,
        doing: 0,
        fit: row.fit,
        total: row.total,
      });
    });
  }

  it("puts every task in the section the table names", () => {
    const day = rankDay(EXAMPLE, VIEW_DATE, settings(), NOW);
    expect(day.overdue.map((t) => t.title)).toEqual(["Lab report"]);
    expect(day.focus.map((t) => t.title)).toEqual(["Pset 4", "Email advisor", "Buy notebook"]);
    expect(day.alsoPossible.map((t) => t.title)).toEqual(["Read ch. 5", "Plan spring courses"]);
    expect(day.doneToday).toEqual([]);
  });
});

describe("rankDay", () => {
  it("yields an identical order however the input is ordered", () => {
    const forward = rankDay(EXAMPLE, VIEW_DATE, settings(), NOW);
    const reversed = rankDay([...EXAMPLE].reverse(), VIEW_DATE, settings(), NOW);
    const rotated = rankDay([...EXAMPLE.slice(3), ...EXAMPLE.slice(0, 3)], VIEW_DATE, settings(), NOW);

    const ids = (day: ReturnType<typeof rankDay>) => ({
      overdue: day.overdue.map((t) => t.id),
      focus: day.focus.map((t) => t.id),
      alsoPossible: day.alsoPossible.map((t) => t.id),
    });
    expect(ids(reversed)).toEqual(ids(forward));
    expect(ids(rotated)).toEqual(ids(forward));
  });

  it("breaks a score tie by due, then priority, then createdAt, then id", () => {
    // All four score 2 + 1: same priority weight, no due, no schedule, both fit.
    const later = task({ id: "t_b", title: "later", createdAt: "2026-09-02T09:00:00-04:00" });
    const earlier = task({ id: "t_a", title: "earlier", createdAt: "2026-09-01T09:00:00-04:00" });
    const sameTime = task({ id: "t_c", title: "same time", createdAt: earlier.createdAt });

    const day = rankDay([sameTime, later, earlier], VIEW_DATE, settings({ focusSize: 9 }), NOW);
    expect(day.focus.map((t) => t.title)).toEqual(["earlier", "same time", "later"]);
  });

  it("sorts nulls last on due within a tie", () => {
    const undated = task({ id: "t_a", title: "undated", priority: 1 });
    const dated = task({ id: "t_z", title: "dated", priority: 1, due: "2026-09-22" });
    // Both score 11 + 1: due 2026-09-22 is 14 days out, so urgency is 0 for each.
    const day = rankDay([undated, dated], VIEW_DATE, settings({ focusSize: 9 }), NOW);
    expect(day.focus.map((t) => t.title)).toEqual(["dated", "undated"]);
  });

  it("overflows past focusSize into Also possible in score order", () => {
    const day = rankDay(EXAMPLE, VIEW_DATE, settings({ focusSize: 1 }), NOW);
    expect(day.focus.map((t) => t.title)).toEqual(["Pset 4"]);
    expect(day.alsoPossible.map((t) => t.title)).toEqual([
      "Email advisor", "Buy notebook", "Read ch. 5", "Plan spring courses",
    ]);
  });

  it("keeps a task due beyond the lookahead out of focus even when it outscores everything", () => {
    const far = task({
      id: "t_far", title: "Far but critical", priority: 1, due: "2026-12-01", estimateMin: 5,
    });
    // 'Far but critical' scores 12 to 'Read ch. 5's 6, and still loses the focus slot to it.
    expect(scoreParts(far, VIEW_DATE, 240).total).toBeGreaterThan(scoreParts(READ, VIEW_DATE, 240).total);
    const day = rankDay([far, READ], VIEW_DATE, settings(), NOW);
    expect(day.focus.map((t) => t.title)).toEqual(["Read ch. 5"]);
    expect(day.alsoPossible.map((t) => t.title)).toEqual(["Far but critical"]);
  });

  it("exempts a far-off task that is explicitly scheduled for this day", () => {
    const far = task({
      id: "t_far", title: "Far but scheduled", due: "2026-12-01", scheduled: VIEW_DATE,
    });
    const day = rankDay([far], VIEW_DATE, settings(), NOW);
    expect(day.focus.map((t) => t.title)).toEqual(["Far but scheduled"]);
  });

  it("hides a task scheduled for a later day and keeps one scheduled for an earlier one", () => {
    const future = task({ id: "t_a", title: "next week", scheduled: "2026-09-15" });
    const missed = task({ id: "t_b", title: "missed plan", scheduled: "2026-09-06" });
    const day = rankDay([future, missed], VIEW_DATE, settings(), NOW);
    expect(day.focus.map((t) => t.title)).toEqual(["missed plan"]);
    expect(day.alsoPossible).toEqual([]);
  });

  it("reads a scheduled date-time by its date half", () => {
    const timed = task({ id: "t_a", title: "at nine", scheduled: `${VIEW_DATE}T09:00` });
    expect(scoreParts(timed, VIEW_DATE, 240).scheduled).toBe(6);
  });

  it("counts an overdue task as overdue however high it would have scored", () => {
    const day = rankDay([LAB], VIEW_DATE, settings(), NOW);
    expect(day.overdue.map((t) => t.title)).toEqual(["Lab report"]);
    expect(day.focus).toEqual([]);
  });

  it("gives fit only to a task that fits the remaining time", () => {
    expect(scoreParts(LAB, "2026-09-05", 240).fit).toBe(1); // 120 minutes into 240
    expect(scoreParts(LAB, "2026-09-05", 60).fit).toBe(0);
    // No estimate is treated as 30 minutes.
    expect(scoreParts(EMAIL, VIEW_DATE, 30).fit).toBe(1);
    expect(scoreParts(task({ id: "t_x", title: "unestimated" }), VIEW_DATE, 20).fit).toBe(0);
  });

  it("adds the doing bonus", () => {
    const doing = task({ id: "t_a", title: "in progress", status: "doing" });
    expect(scoreParts(doing, VIEW_DATE, 240)).toMatchObject({ doing: 3, total: 2 + 3 + 1 });
  });

  it("collects tasks completed on the viewed day, newest first, and excludes archived ones", () => {
    const doneNow = task({
      id: "t_a", title: "done at noon", status: "done", completedAt: "2026-09-08T12:00:00-04:00",
    });
    const doneEarlier = task({
      id: "t_b", title: "done at nine", status: "done", completedAt: "2026-09-08T09:00:00-04:00",
    });
    const doneYesterday = task({
      id: "t_c", title: "yesterday", status: "done", completedAt: "2026-09-07T23:00:00-04:00",
    });
    const archived = task({ id: "t_d", title: "archived", status: "archived" });

    const day = rankDay([doneEarlier, doneNow, doneYesterday, archived], VIEW_DATE, settings(), NOW);
    expect(day.doneToday.map((t) => t.title)).toEqual(["done at noon", "done at nine"]);
    expect(day.focus).toEqual([]);
    expect(day.alsoPossible).toEqual([]);
  });

  it("treats an unreadable due date as undated instead of failing the whole day", () => {
    const broken = task({ id: "t_a", title: "hand-edited", due: "next tuesday" });
    const day = rankDay([broken, EMAIL], VIEW_DATE, settings(), NOW);
    expect(day.focus.map((t) => t.title)).toEqual(["Email advisor", "hand-edited"]);
  });

  it("returns empty sections for an empty day", () => {
    expect(rankDay([], VIEW_DATE, settings(), NOW)).toEqual({
      overdue: [], focus: [], alsoPossible: [], doneToday: [],
    });
  });
});
