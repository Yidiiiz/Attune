// Covers `pendingCommit` — the decision half of the deferred backfill (Decision 47). The rule it
// encodes is "the newest run of nulls, grouped by batch, and only the last group"; the case that
// rule exists for is an older batch that legitimately never got a hash sitting behind a newer one
// that is merely waiting for it. Stamping the older one would write a hash that is simply wrong.

import { describe, expect, it } from "vitest";
import { pendingCommit } from "./log.ts";
import type { ActionEntry } from "./log.ts";

function entry(over: Partial<ActionEntry> & { batch: string }): ActionEntry {
  return {
    schema: 1,
    seq: 1,
    ts: "2026-09-04T10:00:00-04:00",
    actor: "user",
    scope: "user",
    type: "task.create",
    summary: "add a task",
    targets: ["tasks/open/a.md"],
    before: {},
    after: {},
    commit: null,
    meta: { commitSubject: "task: add a task" },
    ...over,
  };
}

/** The log as it is on disk: one JSON object per line, every line newline-terminated. */
function log(...entries: ActionEntry[]): string {
  return entries.map((e) => `${JSON.stringify(e)}\n`).join("");
}

describe("pendingCommit", () => {
  it("finds nothing in an empty log", () => {
    expect(pendingCommit("")).toBeNull();
  });

  it("finds nothing when the newest batch already has its hash", () => {
    const text = log(entry({ batch: "b_1", commit: "abc1234" }));
    expect(pendingCommit(text)).toBeNull();
  });

  it("returns the newest batch and the subject its commit must carry", () => {
    const text = log(
      entry({ batch: "b_1", commit: "abc1234" }),
      entry({ batch: "b_2", seq: 2, meta: { commitSubject: "task: add two tasks" } }),
    );
    expect(pendingCommit(text)).toMatchObject({ batch: "b_2", subject: "task: add two tasks" });
  });

  it("points its offset at the first line of the batch, not the last", () => {
    const first = entry({ batch: "b_1", commit: "abc1234" });
    const second = entry({ batch: "b_2", seq: 2 });
    const third = entry({ batch: "b_2", seq: 3 });
    const pending = pendingCommit(log(first, second, third));

    // Everything before b_2 stays untouched, so the offset is exactly the length of line one.
    expect(pending?.offset).toBe(Buffer.byteLength(`${JSON.stringify(first)}\n`, "utf8"));
  });

  it("leaves a batch that was never going to commit alone", () => {
    const text = log(entry({ batch: "b_1", meta: { noCommit: true } }));
    expect(pendingCommit(text)).toBeNull();
  });

  it("leaves a batch whose commit failed alone", () => {
    const text = log(entry({ batch: "b_1", meta: { commitFailed: true, commitError: "index.lock" } }));
    expect(pendingCommit(text)).toBeNull();
  });

  it("refuses a batch with no recorded subject, rather than stamping it unchecked", () => {
    const text = log(entry({ batch: "b_1", meta: {} }));
    expect(pendingCommit(text)).toBeNull();
  });

  // The regression the last-group-only rule exists to prevent: b_1's commit failed, b_2's succeeded
  // but is still waiting for b_3 to fill it in. Both are null and adjacent. Only b_2 is pending.
  it("takes only the last group of trailing nulls", () => {
    const failed = entry({ batch: "b_1", meta: { commitFailed: true, commitError: "boom" } });
    const pendingLine = entry({ batch: "b_2", seq: 2, meta: { commitSubject: "task: add a task" } });
    const found = pendingCommit(log(failed, pendingLine));

    expect(found?.batch).toBe("b_2");
    expect(found?.offset).toBe(Buffer.byteLength(`${JSON.stringify(failed)}\n`, "utf8"));
  });

  it("survives a torn line at the tail without stamping the batch above it", () => {
    const good = entry({ batch: "b_1", commit: "abc1234" });
    expect(pendingCommit(`${JSON.stringify(good)}\n{"batch": "b_2", tru`)).toBeNull();
  });
});
