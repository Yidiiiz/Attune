import { describe, expect, it } from "vitest";
import { findConflicts, undoState, unrestorableTarget } from "./undo.ts";
import { groupBatches } from "./log.ts";
import type { ActionEntry, ActionType, Snapshot, Snapshots } from "./log.ts";

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

describe("unrestorableTarget", () => {
  /** One entry whose `before` is exactly the snapshots given, so a test can name the shape. */
  function withSnapshots(type: ActionType, before: Snapshots): ActionEntry {
    const targets = Object.keys(before);
    return { ...entry("b1", type, targets), before, after: before };
  }

  it("passes an ordinary batch, whose targets are all under data/", () => {
    const batch = batches(entry("b1", "task.update", ["tasks/a.md", "tasks/b.md"]))[0];
    expect(unrestorableTarget(batch)).toBeNull();
  });

  it("names .env.local, which is the batch this guard exists for (§11.5, Decision 58)", () => {
    const batch = batches(
      withSnapshots("settings.update", { ".env.local": { fields: { ANTHROPIC_API_KEY: "set" } } }),
    )[0];
    expect(unrestorableTarget(batch)).toBe(".env.local");
  });

  it("catches a content snapshot on the same path, not only a fields one", () => {
    const batch = batches(withSnapshots("settings.update", { ".env.local": { content: "" } }))[0];
    expect(unrestorableTarget(batch)).toBe(".env.local");
  });

  it("leaves a git snapshot alone, which is how code.change reaches repository paths", () => {
    const gitSnapshot: Snapshot = { git: true };
    const batch = batches(
      withSnapshots("code.change", { "lib/agent/chat.ts": gitSnapshot, ".env.local": gitSnapshot }),
    )[0];
    expect(unrestorableTarget(batch)).toBeNull();
  });

  it("leaves a null snapshot alone: it records absence, not contents", () => {
    const batch = batches(withSnapshots("file.add", { "files/docs/2026-09/a.pdf": null }))[0];
    expect(unrestorableTarget(batch)).toBeNull();
  });

  it("catches a path that escapes data/ as well as the one that resolves inside it wrongly", () => {
    const batch = batches(withSnapshots("file.write", { "../secrets.md": { content: "x" } }))[0];
    expect(unrestorableTarget(batch)).toBe("../secrets.md");
  });

  it("names the first unrestorable target when a batch mixes them with ordinary ones", () => {
    const batch = batches(
      withSnapshots("settings.update", {
        "settings/settings.json": { content: "{}" },
        ".env.local": { fields: { ANTHROPIC_API_KEY: "unset" } },
      }),
    )[0];
    expect(unrestorableTarget(batch)).toBe(".env.local");
  });
});
