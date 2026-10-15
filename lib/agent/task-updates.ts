// Owns: reviewed field changes to an existing task. No proposal writes; Apply uses
// ordinary task history and checks reviewed values inside the serialized batch.
import { z } from "zod";
import { TaskDraftSchema, updateTask } from "../history/actions.ts";
import type { ActionSpec } from "../history/batch.ts";
import { readTask } from "../store/tasks.ts";
import { StoreError } from "../store/paths.ts";

const Value = z.union([z.string(), z.number(), z.array(z.string()), z.null()]);
const Change = z.object({ field: TaskDraftSchema.keyof(), value: Value });
export const TaskUpdateInput = z.object({
  id: z.string().min(1), changes: z.array(Change).min(1), reason: z.string(),
});
export const TaskUpdateProposal = TaskUpdateInput.extend({
  kind: z.literal("task_update"), title: z.string(),
  changes: z.array(Change.extend({ before: Value })).min(1),
});
export type TaskUpdateProposal = z.infer<typeof TaskUpdateProposal>;

function changesOf(changes: z.infer<typeof TaskUpdateInput>["changes"]) {
  if (new Set(changes.map((change) => change.field)).size !== changes.length) {
    throw new StoreError("invalid", "Each task field may appear only once.");
  }
  return TaskDraftSchema.partial().strict().parse(Object.fromEntries(changes.map(({ field, value }) => [field, value])));
}

export async function proposeTaskUpdate(input: unknown): Promise<TaskUpdateProposal> {
  const parsed = TaskUpdateInput.parse(input);
  changesOf(parsed.changes);
  const task = await readTask(parsed.id);
  return {
    ...parsed, kind: "task_update", title: task.title,
    changes: parsed.changes.map((change) => ({ ...change, before: task[change.field] as z.infer<typeof Value> })),
  };
}

export function applyTaskUpdate(input: TaskUpdateProposal): ActionSpec {
  const proposal = TaskUpdateProposal.parse(input);
  const changes = changesOf(proposal.changes);
  const action = updateTask(proposal.id, changes, `Update '${proposal.title}'`);
  return { ...action, apply: async (store) => {
    const task = await store.tasks.readTask(proposal.id);
    for (const change of proposal.changes) {
      if (JSON.stringify(task[change.field]) !== JSON.stringify(change.before)) {
        throw new StoreError("conflict", "This task changed since the proposal. Ask again for an updated edit.");
      }
    }
    return action.apply(store);
  } };
}
