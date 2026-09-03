// Owns: listing tasks and creating them in one batch (PROJECT.md §14).
// GET returns the unranked list this phase; `rankDay` arrives with lib/schedule/rank.ts in Phase 3
// and slots in here without changing the response shape's `tasks` key.

import { z } from "zod";
import { runBatch } from "@/lib/history/batch";
import { createTask } from "@/lib/history/actions";
import { listTasks } from "@/lib/store/tasks";
import { body, handle, ok } from "../respond";

export const dynamic = "force-dynamic";

const Draft = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  status: z.enum(["todo", "doing", "done", "archived"]).optional(),
  priority: z.number().int().min(1).max(4).optional(),
  estimateMin: z.number().int().nullable().optional(),
  due: z.string().nullable().optional(),
  scheduled: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  links: z.array(z.string()).optional(),
  repeat: z.enum(["daily", "weekly", "biweekly", "monthly"]).nullable().optional(),
  repeatUntil: z.string().nullable().optional(),
  collection: z.string().nullable().optional(),
});

const CreateBody = z.object({
  items: z.array(Draft).min(1),
  source: z.string().default("manual"),
  actor: z.enum(["user", "agent"]).default("user"),
});

export async function GET(): Promise<Response> {
  return handle(async () => {
    const tasks = await listTasks();
    return ok({ tasks, errors: listTasks.errors });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { items, source, actor } = CreateBody.parse(await body(request));
    const summary = items.length === 1 ? `add '${items[0].title}'` : `add ${items.length} tasks`;

    const result = await runBatch({
      actor,
      scope: "user",
      summary,
      commitPrefix: "task",
      meta: { source },
      actions: items.map((item) => createTask({ ...item, source, createdBy: actor })),
    });
    return ok({ ...result });
  });
}
