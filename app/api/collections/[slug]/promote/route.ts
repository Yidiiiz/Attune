// Owns: §4.5's "Make this a task" — one collection item promoted to a task, linked both ways, in one
// batch (PROJECT.md §14). Filed under the collection because the task does not exist until this
// creates it: `/api/tasks/[id]/promote`, which the spec first named, had no referent for `[id]`.
//
// No surface calls this yet. The button belongs to Phase 8's document view, the first place a
// collection's items are drawn as rows (amendment `s`); until then it is reached over HTTP, which is
// how Phase 7 checks it.
//
// Failure behavior: an unknown collection or item is a 404, an item already promoted is a 409 —
// `promoteItem` throws before writing, and `runBatch` rolls back the half that ran.

import { z } from "zod";
import { runBatch } from "@/lib/history/batch";
import { promoteItem } from "@/lib/history/knowledge-actions";
import { body as readBody, handle, ok } from "../../../respond";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "a collection slug is lowercase letters, digits and hyphens");
const Input = z.object({ item: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "an item slug is lowercase letters, digits and hyphens") });

export async function POST(request: Request, { params }: Params): Promise<Response> {
  return handle(async () => {
    const slug = Slug.parse((await params).slug);
    const { item } = Input.parse(await readBody(request));
    const rel = `knowledge/collections/${slug}.md`;

    const result = await runBatch({
      actor: "user",
      scope: "user",
      summary: `make '${item}' from ${slug} a task`,
      commitPrefix: "task",
      actions: promoteItem(rel, item),
    });
    return ok({ ...result, task: result.targets.find((target) => target.startsWith("tasks/")) ?? null });
  });
}
