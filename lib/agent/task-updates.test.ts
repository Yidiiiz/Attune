// Exercise proposal -> reviewed apply -> ordinary Undo in an isolated real checkout.
import { beforeEach, expect, it } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("task-updates");
const { runBatch } = await import("../history/batch.ts");
const { createTask, updateTask } = await import("../history/actions.ts");
const { undoBatch } = await import("../history/undo.ts");
const { listTasks, readTask } = await import("../store/tasks.ts");
const { executeTool } = await import("./tools.ts");
const { applyTaskUpdate } = await import("./task-updates.ts");
const batch = { actor: "agent" as const, scope: "user" as const, summary: "edit", commitPrefix: "task" as const };
let id: string;

beforeEach(async () => {
  await checkout.reset();
  await runBatch({ ...batch, actions: [createTask({ title: "Synthetic appointment", priority: 1, scheduled: "2026-10-15T17:30", estimateMin: 45, body: "Keep these notes." })] });
  id = (await listTasks())[0].id;
});

async function proposal() {
  const outcome = await executeTool("propose_task_update", { id, changes: [{ field: "priority", value: 3 }], reason: "An appointment, normal priority." });
  expect(outcome.isError).toBeUndefined();
  if (outcome.proposal?.kind !== "task_update") throw new Error("Missing edit proposal");
  return outcome.proposal;
}

it("proposes without writing; Apply changes only priority; Undo restores the prior task", async () => {
  const original = await readTask(id);
  const head = checkout.git("rev-parse", "HEAD");
  const edit = await proposal();
  expect(edit.changes).toEqual([{ field: "priority", before: 1, value: 3 }]);
  expect(await readTask(id)).toEqual(original);
  expect(checkout.git("rev-parse", "HEAD")).toBe(head);
  const result = await runBatch({ ...batch, actions: [applyTaskUpdate(edit)] });
  const after = await readTask(id);
  expect(after).toMatchObject({ priority: 3, scheduled: original.scheduled, estimateMin: 45, body: original.body });
  expect(await listTasks()).toHaveLength(1);
  await undoBatch(result.batch);
  expect(await readTask(id)).toEqual(original);
});

it("checks stale reviewed fields inside the queue and refuses without overwriting", async () => {
  const edit = await proposal();
  await runBatch({ ...batch, actions: [updateTask(id, { priority: 2 })] });
  const head = checkout.git("rev-parse", "HEAD");
  await expect(runBatch({ ...batch, actions: [applyTaskUpdate(edit)] })).rejects.toMatchObject({ code: "conflict" });
  expect((await readTask(id)).priority).toBe(2);
  expect(checkout.git("rev-parse", "HEAD")).toBe(head);
});

it("preserves unrelated edits made after proposal creation", async () => {
  const edit = await proposal();
  await runBatch({ ...batch, actions: [updateTask(id, { body: "Newer notes", scheduled: "2026-10-15T18:00" })] });
  await runBatch({ ...batch, actions: [applyTaskUpdate(edit)] });
  expect(await readTask(id)).toMatchObject({ priority: 3, body: "Newer notes", scheduled: "2026-10-15T18:00" });
});

it("refuses missing targets, invalid values, duplicate fields and protected fields", async () => {
  for (const input of [
    { id: "t_missing", changes: [{ field: "priority", value: 3 }] },
    { id, changes: [{ field: "priority", value: 5 }] },
    { id, changes: [{ field: "priority", value: "Normal" }] },
    { id, changes: [{ field: "id", value: "t_other" }] },
    { id, changes: [{ field: "priority", value: 3 }, { field: "priority", value: 2 }] },
  ]) {
    const result = await executeTool("propose_task_update", { ...input, reason: "test" });
    expect(result.isError).toBe(true);
    expect(result.proposal).toBeUndefined();
  }
  expect((await readTask(id)).priority).toBe(1);
});
