// Owns: showing what would be sent, without sending it (PROJECT.md §14, §13.1). The debug view of
// §10.2 renders exactly the array this returns, and §17 makes it one of Phase 5's checks — which is
// also what makes it the one agent route that can be exercised with no API key at all: it assembles
// a prompt and stops there.
//
// Failure behavior: assembly does not throw for missing content, so the usual answer on a fresh
// install is a full set of blocks with empty bodies. A path outside `data/` in `openFile` is the
// one real error, and it is the store's `forbidden_path` → 403.

import { z } from "zod";
import { assembleContext } from "@/lib/agent/context";
import { body, handle, ok, parseInput } from "../../respond";

export const dynamic = "force-dynamic";

const Input = z.object({
  mode: z.enum(["ask", "tasks", "build", "schedule", "theme"]).default("tasks"),
  viewDate: z.string().optional(),
  range: z.tuple([z.string(), z.string()]).optional(),
  openFile: z.string().optional(),
  taskIds: z.array(z.string()).optional(),
});

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const input = parseInput(Input, await body(request));
    const { system, total } = await assembleContext({
      mode: input.mode,
      ...(input.viewDate === undefined ? {} : { viewDate: input.viewDate }),
      ...(input.range === undefined ? {} : { range: input.range }),
      ...(input.openFile === undefined ? {} : { openFile: input.openFile }),
      ...(input.taskIds === undefined ? {} : { taskIds: input.taskIds }),
    });
    // §6.2 targets under 2,000 and the debug view colours the total red past 2,500. The threshold
    // travels with the number so the view does not have to carry a copy of the rule.
    return ok({ system, total, warnAbove: 2500 });
  });
}
