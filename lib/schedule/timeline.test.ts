// Covers PROJECT.md §10.1's Schedule mode: the window, fixed placement, gap filling in rank order,
// breaks, and the "Didn't fit" list. The invariant every case checks implicitly is that the blocks
// tile the window exactly once — no overlap, no hole — because a timeline that double-books an hour
// is worse than one that admits a task did not fit.

import { describe, expect, it } from "vitest";
import { dayWindow, fixedStart, packDay, unplaced } from "./timeline.ts";
import type { Block } from "./timeline.ts";
import type { Task } from "../store/tasks.ts";
import type { Settings } from "../store/settings.ts";

const NY = "America/New_York";
const VIEW_DATE = "2026-09-08";
/** 10:00 in New York, the start of the configured day. */
const NOW = new Date("2026-09-08T14:00:00Z");

function task(id: string, fields: Partial<Task> = {}): Task {
  return {
    schema: 1, id, title: id, status: "todo", priority: 3, estimateMin: null, due: null,
    scheduled: null, completedAt: null, category: null, context: null, tags: [], links: [],
    repeat: null, repeatUntil: null, source: "manual", collection: null,
    createdAt: "2026-09-01T09:00:00-04:00", updatedAt: "2026-09-01T09:00:00-04:00",
    createdBy: "user", path: `tasks/2026-09-01-${id}.md`, body: "",
    ...fields,
  } as Task;
}

function settings(over: { startMin?: number; endMin?: number; breakMin?: number } = {}): Settings {
  return {
    timezone: NY,
    day: {
      startMin: over.startMin ?? 600,
      endMin: over.endMin ?? 1080,
      blocks: [[600, 780], [840, 1080]],
      breakMin: over.breakMin ?? 10,
    },
    list: { focusSize: 5, lookaheadDays: 14, showCompleted: true },
  } as Settings;
}

const pack = (over: Partial<Parameters<typeof packDay>[0]>): Block[] =>
  packDay({ focus: [], fixed: [], now: NOW, viewDate: VIEW_DATE, settings: settings(), ...over });

/** Blocks must tile [start, end] with no gap and no overlap. */
function expectContiguous(blocks: Block[], start: number, end: number) {
  let at = start;
  for (const block of blocks) {
    expect(block.startMin).toBe(at);
    expect(block.endMin).toBeGreaterThan(block.startMin);
    at = block.endMin;
  }
  expect(at).toBe(end);
}

describe("fixedStart", () => {
  it("reads the minute from a scheduled date-time on this day", () => {
    expect(fixedStart(task("a", { scheduled: "2026-09-08T09:30" }), VIEW_DATE)).toBe(570);
    expect(fixedStart(task("a", { scheduled: "2026-09-08T00:00" }), VIEW_DATE)).toBe(0);
  });

  it("is null for a date-only schedule, another day, or nothing at all", () => {
    expect(fixedStart(task("a", { scheduled: "2026-09-08" }), VIEW_DATE)).toBeNull();
    expect(fixedStart(task("a", { scheduled: "2026-09-09T09:30" }), VIEW_DATE)).toBeNull();
    expect(fixedStart(task("a"), VIEW_DATE)).toBeNull();
  });

  it("is null for a value that will not parse, so the task competes for a gap instead", () => {
    expect(fixedStart(task("a", { scheduled: "2026-09-08Tmorning" }), VIEW_DATE)).toBeNull();
  });
});

describe("dayWindow", () => {
  it("starts at now on today when now is past the day's start", () => {
    // 13:00 local.
    expect(dayWindow(VIEW_DATE, settings(), new Date("2026-09-08T17:00:00Z"))).toEqual({
      start: 780, end: 1080,
    });
  });

  it("starts at day.startMin on today when now is earlier", () => {
    expect(dayWindow(VIEW_DATE, settings(), new Date("2026-09-08T11:00:00Z"))).toEqual({
      start: 600, end: 1080,
    });
  });

  it("ignores now entirely for any other day", () => {
    expect(dayWindow("2026-09-09", settings(), NOW)).toEqual({ start: 600, end: 1080 });
  });
});

describe("packDay", () => {
  it("returns one gap for an empty day", () => {
    const blocks = pack({});
    expect(blocks).toEqual([{ kind: "gap", startMin: 600, endMin: 1080 }]);
  });

  it("returns nothing once the day is over", () => {
    expect(pack({ now: new Date("2026-09-09T02:00:00Z") })).toEqual([]);
  });

  it("places focus tasks in rank order, each followed by a break", () => {
    const blocks = pack({
      focus: [task("a", { estimateMin: 60 }), task("b", { estimateMin: 30 })],
    });
    expect(blocks).toEqual([
      { kind: "task", taskId: "a", startMin: 600, endMin: 660 },
      { kind: "break", startMin: 660, endMin: 670 },
      { kind: "task", taskId: "b", startMin: 670, endMin: 700 },
      { kind: "break", startMin: 700, endMin: 710 },
      { kind: "gap", startMin: 710, endMin: 1080 },
    ]);
    expectContiguous(blocks, 600, 1080);
  });

  it("treats a task with no estimate as 30 minutes", () => {
    const blocks = pack({ focus: [task("a")] });
    expect(blocks[0]).toEqual({ kind: "task", taskId: "a", startMin: 600, endMin: 630 });
  });

  it("places pinned tasks where they are and fills around them", () => {
    const blocks = pack({
      fixed: [task("class", { scheduled: "2026-09-08T12:00", estimateMin: 60 })],
      focus: [task("a", { estimateMin: 60 })],
    });
    expect(blocks).toEqual([
      { kind: "task", taskId: "a", startMin: 600, endMin: 660 },
      { kind: "break", startMin: 660, endMin: 670 },
      { kind: "gap", startMin: 670, endMin: 720 },
      { kind: "fixed", taskId: "class", startMin: 720, endMin: 780 },
      { kind: "gap", startMin: 780, endMin: 1080 },
    ]);
    expectContiguous(blocks, 600, 1080);
  });

  it("skips a gap too small for a task and gives it to a later one that fits", () => {
    const blocks = pack({
      fixed: [task("class", { scheduled: "2026-09-08T10:45", estimateMin: 15 })],
      focus: [task("long", { estimateMin: 90 }), task("short", { estimateMin: 45 })],
    });
    // 'long' is offered the 45-minute opening before class first and cannot take it, so it goes
    // after class and 'short' comes back for the opening. No break follows 'short': the minute it
    // ends is class's, and a break is never allowed to displace anything.
    expect(blocks).toEqual([
      { kind: "task", taskId: "short", startMin: 600, endMin: 645 },
      { kind: "fixed", taskId: "class", startMin: 645, endMin: 660 },
      { kind: "task", taskId: "long", startMin: 660, endMin: 750 },
      { kind: "break", startMin: 750, endMin: 760 },
      { kind: "gap", startMin: 760, endMin: 1080 },
    ]);
    expectContiguous(blocks, 600, 1080);
  });

  it("clips a pinned block that runs past the end of the day", () => {
    const blocks = pack({
      fixed: [task("late", { scheduled: "2026-09-08T17:30", estimateMin: 120 })],
    });
    expect(blocks.at(-1)).toEqual({ kind: "fixed", taskId: "late", startMin: 1050, endMin: 1080 });
    expectContiguous(blocks, 600, 1080);
  });

  it("drops a pinned block that already finished before the window opens", () => {
    const blocks = pack({
      now: new Date("2026-09-08T17:00:00Z"), // 13:00
      fixed: [task("morning", { scheduled: "2026-09-08T09:00", estimateMin: 60 })],
    });
    expect(blocks).toEqual([{ kind: "gap", startMin: 780, endMin: 1080 }]);
  });

  it("places a task that is both focused and pinned exactly once", () => {
    const both = task("a", { scheduled: "2026-09-08T14:00", estimateMin: 60 });
    const blocks = pack({ focus: [both], fixed: [both] });
    expect(blocks.filter((b) => b.taskId === "a")).toEqual([
      { kind: "fixed", taskId: "a", startMin: 840, endMin: 900 },
    ]);
    expectContiguous(blocks, 600, 1080);
  });

  it("omits the break when the task ends the day, rather than overrunning it", () => {
    const blocks = pack({
      settings: settings({ endMin: 660 }),
      focus: [task("a", { estimateMin: 60 })],
    });
    expect(blocks).toEqual([{ kind: "task", taskId: "a", startMin: 600, endMin: 660 }]);
  });

  it("writes no breaks at all when breakMin is zero", () => {
    const blocks = pack({
      settings: settings({ breakMin: 0 }),
      focus: [task("a", { estimateMin: 60 }), task("b", { estimateMin: 60 })],
    });
    expect(blocks.some((b) => b.kind === "break")).toBe(false);
    expectContiguous(blocks, 600, 1080);
  });

  it("is identical on a second call with the same input", () => {
    const input = {
      focus: [task("a", { estimateMin: 60 }), task("b", { estimateMin: 45 })],
      fixed: [task("class", { scheduled: "2026-09-08T12:00", estimateMin: 60 })],
      now: NOW, viewDate: VIEW_DATE, settings: settings(),
    };
    expect(packDay(input)).toEqual(packDay(input));
  });
});

describe("unplaced", () => {
  it("names the focus tasks that did not fit", () => {
    const fits = task("fits", { estimateMin: 60 });
    const huge = task("huge", { estimateMin: 600 });
    const blocks = pack({ focus: [fits, huge] });
    expect(unplaced([fits, huge], blocks).map((t) => t.id)).toEqual(["huge"]);
  });

  it("is empty when everything was placed", () => {
    const only = task("a", { estimateMin: 60 });
    expect(unplaced([only], pack({ focus: [only] }))).toEqual([]);
  });
});
