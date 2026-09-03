import { describe, expect, it } from "vitest";
import { findConflicts, undoState } from "./undo.ts";
import { groupBatches } from "./log.ts";
import type { ActionEntry, ActionType, Snapshots } from "./log.ts";

let seq = 0;

function entry(
  batch: string,
  type: ActionType,
  targets: string[],
  meta: Record<string, unknown> = {},
): ActionEntry {
  seq += 1;
  const snapshots: Snapshots = Object.fromEntries(targets.map((rel) => [rel, { content: rel }]));
  return {
    schema: 1,
    seq,
    ts: "2026-09-03T14:12:00-04:00",
    batch,
    actor: "user",
    scope: "user",
    type,
    summary: `${type} ${targets.join(",")}`,
    targets,
    before: snapshots,
    after: snapshots,
    commit: "a1b2c3d",
    meta,
  };
}

const batches = (...entries: ActionEntry[]) => groupBatches(entries);

describe("undoState", () => {
  it("reports an unknown batch rather than claiming it is undoable", () => {
    const state = undoState(batches(entry("b1", "task.create", ["tasks/a.md"])), "nope");
    expect(state).toEqual({ undoable: false, redoable: false, reason: "no batch nope" });
  });

  it("makes a fresh batch undoable and not redoable", () => {
    const state = undoState(batches(entry("b1", "task.create", ["tasks/a.md"])), "b1");
    expect(state.undoable).toBe(true);
    expect(state.redoable).toBe(false);
  });

  it("flips both flags once the batch has been undone", () => {
    const state = undoState(
      batches(
        entry("b1", "task.create", ["tasks/a.md"]),
        entry("u1", "undo", ["tasks/a.md"], { undoes: "b1" }),
      ),
      "b1",
    );
    expect(state).toEqual({ undoable: false, redoable: true, reason: "already undone" });
  });

  it("flips them back after a redo", () => {
    const state = undoState(
      batches(
        entry("b1", "task.create", ["tasks/a.md"]),
        entry("u1", "undo", ["tasks/a.md"], { undoes: "b1" }),
        entry("r1", "redo", ["tasks/a.md"], { redoes: "b1" }),
      ),
      "b1",
    );
    expect(state.undoable).toBe(true);
    expect(state.redoable).toBe(false);
  });

  it("follows the latest undo/redo, not the first", () => {
    const state = undoState(
      batches(
        entry("b1", "task.create", ["tasks/a.md"]),
        entry("u1", "undo", ["tasks/a.md"], { undoes: "b1" }),
        entry("r1", "redo", ["tasks/a.md"], { redoes: "b1" }),
        entry("u2", "undo", ["tasks/a.md"], { undoes: "b1" }),
      ),
      "b1",
    );
    expect(state.undoable).toBe(false);
    expect(state.redoable).toBe(true);
  });

  it("ignores undo entries pointing at a different batch", () => {
    const state = undoState(
      batches(
        entry("b1", "task.create", ["tasks/a.md"]),
        entry("b2", "task.create", ["tasks/b.md"]),
        entry("u1", "undo", ["tasks/b.md"], { undoes: "b2" }),
      ),
      "b1",
    );
    expect(state.undoable).toBe(true);
  });
});

describe("findConflicts", () => {
  it("finds nothing when nothing later touched the same files", () => {
    expect(
      findConflicts(
        batches(
          entry("b1", "task.create", ["tasks/a.md"]),
          entry("b2", "task.update", ["tasks/b.md"]),
        ),
        "b1",
      ),
    ).toEqual([]);
  });

  it("names every later batch that touched a shared file", () => {
    expect(
      findConflicts(
        batches(
          entry("b1", "task.create", ["tasks/a.md", "tasks/b.md"]),
          entry("b2", "task.update", ["tasks/b.md"]),
          entry("b3", "task.update", ["tasks/c.md"]),
          entry("b4", "task.delete", ["tasks/a.md"]),
        ),
        "b1",
      ),
    ).toEqual(["b2", "b4"]);
  });

  it("ignores earlier batches, however much they overlap", () => {
    expect(
      findConflicts(
        batches(
          entry("b0", "task.update", ["tasks/a.md"]),
          entry("b1", "task.update", ["tasks/a.md"]),
        ),
        "b1",
      ),
    ).toEqual([]);
  });

  it("does not count this batch's own undo as a conflict", () => {
    expect(
      findConflicts(
        batches(
          entry("b1", "task.create", ["tasks/a.md"]),
          entry("u1", "undo", ["tasks/a.md"], { undoes: "b1" }),
        ),
        "b1",
      ),
    ).toEqual([]);
  });

  it("does count an unrelated batch's undo, since it wrote the same file", () => {
    expect(
      findConflicts(
        batches(
          entry("b1", "task.update", ["tasks/a.md"]),
          entry("b2", "task.update", ["tasks/a.md"]),
          entry("u2", "undo", ["tasks/a.md"], { undoes: "b2" }),
        ),
        "b1",
      ),
    ).toEqual(["b2", "u2"]);
  });
});
