// Owns: one task — read it, change fields on it, delete it (PROJECT.md §14).
// Completion is not here: it materializes the next instance of a repeating task in the same batch
// (§4.1), which is Phase 3's work alongside the ranker that shows the result.

import { z } from "zod";
import { runBatch } from "@/lib/history/batch";
import { deleteTask, updateTask } from "@/lib/history/actions";
import { readTask } from "@/lib/store/tasks";
import { body, handle, ok } from "../../respond";

export const dynamic = "force-dynamic";

const Changes = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  status: z.enum(["todo", "doing", "done", "archived"]).optional(),
  priority: z.number().int().min(1).max(4).optional(),
  estimateMin: z.number().int().nullable().optional(),
  due: z.string().nullable().optional(),
  scheduled: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  links: z.array(z.string()).optional(),
  repeat: z.enum(["daily", "weekly", "biweekly", "monthly"]).nullable().optional(),
  repeatUntil: z.string().nullable().optional(),
  collection: z.string().nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  return handle(async () => ok({ task: await readTask((await params).id) }));
}

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    const changes = Changes.parse(await body(request));
    const task = await readTask(id);
    const summary = `update '${task.title}'`;

    const result = await runBatch({
      actor: "user",
      scope: "user",
      summary,
      commitPrefix: "task",
      actions: [updateTask(id, changes, summary)],
    });
    return ok({ ...result });
  });
}

export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    const task = await readTask(id);
    const summary = `delete '${task.title}'`;

    const result = await runBatch({
      actor: "user",
      scope: "user",
      summary,
      commitPrefix: "task",
      actions: [deleteTask(id, summary)],
    });
    return ok({ ...result });
  });
}
