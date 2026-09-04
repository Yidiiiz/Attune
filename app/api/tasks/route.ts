// Owns: listing tasks for a day and creating them in one batch (PROJECT.md §14).
//
// GET answers with both shapes: `tasks` is still the whole unranked list, unchanged from Phase 2,
// and the four §10.1 sections are alongside it. A task appears at most twice in the response, which
// on a local single-user app is cheaper than making every caller re-run the ranker to interpret a
// list of ids.

import { z } from "zod";
import { runBatch } from "@/lib/history/batch";
import { createTask } from "@/lib/history/actions";
import { listTasks } from "@/lib/store/tasks";
import { readSettings } from "@/lib/store/settings";
import { rankDay } from "@/lib/schedule/rank";
import { todayIn } from "@/lib/schedule/dates";
import { StoreError } from "@/lib/store/paths";
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

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const settings = await readSettings();
    const asked = new URL(request.url).searchParams.get("date");
    if (asked !== null && !/^\d{4}-\d{2}-\d{2}$/.test(asked)) {
      throw new StoreError("invalid", `date must be YYYY-MM-DD: ${asked}`);
    }

    const date = asked ?? todayIn(settings.timezone);
    const tasks = await listTasks();
    return ok({
      date,
      ...rankDay(tasks, date, settings, new Date()),
      tasks,
      errors: listTasks.errors,
    });
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
