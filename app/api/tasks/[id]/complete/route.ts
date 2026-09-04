// Owns: completing one task, and materializing the next instance of a repeating one in the same
// batch (PROJECT.md §14, §4.1). Deferred out of Phase 2 into Phase 3, which is the phase that shows
// the result and tests it.
//
// Sharing the batch is the whole design: undo reverses a batch whole, so one undo takes back both
// the completion and the instance it spawned. Two batches would leave an orphan next week's task
// behind after undoing the completion that created it.

import { runBatch } from "@/lib/history/batch";
import { completeTask, createTask, nextInstance } from "@/lib/history/actions";
import { readTask } from "@/lib/store/tasks";
import { handle, ok } from "../../../respond";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    const task = await readTask(id);
    const next = nextInstance(task);
    const summary = next
      ? `complete '${task.title}' and schedule the next one`
      : `complete '${task.title}'`;

    const result = await runBatch({
      actor: "user",
      scope: "user",
      summary,
      commitPrefix: "task",
      actions: [
        completeTask(id, `Complete '${task.title}'`),
        ...(next ? [createTask(next)] : []),
      ],
    });
    return ok({ ...result, repeated: next !== null });
  });
}
