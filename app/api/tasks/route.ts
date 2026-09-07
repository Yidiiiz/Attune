// Owns: listing tasks for a day and creating them in one batch (PROJECT.md §14).
//
// GET answers with the four §10.1 sections and nothing else. The unranked `tasks` array it also
// returned was a Phase 2 placeholder for the days before `rank.ts` existed; nothing consumes it now
// — Today reads the store directly as a route-level server file (§3), and the calendar has its own
// route — and a flat list is a concatenation of the four sections for anyone who ever wants one.

import { z } from "zod";
import { TaskDraftSchema } from "@/lib/history/actions";
import { listTasks } from "@/lib/store/tasks";
import { readSettings } from "@/lib/store/settings";
import { rankDay } from "@/lib/schedule/rank";
import { todayIn } from "@/lib/schedule/dates";
import { StoreError } from "@/lib/store/paths";
import { createTasks } from "./create";
import { body, handle, ok } from "../respond";

export const dynamic = "force-dynamic";

const CreateBody = z.object({
  items: z.array(TaskDraftSchema).min(1),
  source: z.string().default("manual"),
  actor: z.enum(["user", "agent"]).default("user"),
  /**
   * What the user typed, when these came from a composer send (§9.5 step 5). It becomes
   * `meta.prompt` and changes the summary, and it is scanned by `runBatch` before anything is
   * logged — a prompt with a credential in it refuses the whole batch (§11.5, amendment `j`).
   */
  prompt: z.string().optional(),
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
      errors: listTasks.errors,
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { items, source, actor, prompt } = CreateBody.parse(await body(request));
    // A send from the composer says where it came from even when the caller did not: §4.1's
    // `source` records where the work came from, and "manual" would be false for these.
    const from = prompt !== undefined && source === "manual" ? "prompt" : source;
    return ok({ ...(await createTasks({ items, source: from, actor, prompt })) });
  });
}
