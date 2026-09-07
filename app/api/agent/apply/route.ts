// Owns: turning a proposal the user approved into one batch (PROJECT.md §14, §9.5). One of the
// three kinds is implemented, and the other two refuse by name rather than pretending.
//
// `kind: "tasks"` goes through the same `createTasks` the composer's Add all button uses, so the
// summary, the `source`, and `meta.prompt` are identical whichever route the drafts arrived by.
//
// `kind: "knowledge"` and `kind: "collection"` need `lib/store/knowledge.ts`, which Phase 7 builds
// — collections have a file format, a map link rule, and an index that regenerates (§4.5, §6.3),
// and writing half of that here would be a second implementation to reconcile later. They answer
// 501 with the phase named. The composer renders a collection proposal with its Add disabled, so
// this is the belt to that UI's braces, not the only thing standing between a click and a write.
//
// Failure behavior: `runBatch` owns everything that can go wrong once a write starts — the rollback,
// the §11.5 refusal, the commit. A refusal here leaves the preview panel exactly as it was, which
// is what lets someone fix a title and press Add again (Decision 50).

import { z } from "zod";
import { TaskDraftSchema } from "@/lib/history/actions";
import { AgentError } from "@/lib/agent/registry";
import { createTasks } from "../../tasks/create";
import { body, handle, ok } from "../../respond";

export const dynamic = "force-dynamic";

const Tasks = z.object({
  kind: z.literal("tasks"),
  // The drafts as the panel now holds them: whatever the model proposed, plus every inline edit.
  // `inferred` is dropped by the schema — it describes where a value came from, not what it is.
  items: z.array(TaskDraftSchema).min(1),
});

const Knowledge = z.object({ kind: z.literal("knowledge") });
const Collection = z.object({ kind: z.literal("collection") });

const Input = z.object({
  proposal: z.discriminatedUnion("kind", [Tasks, Knowledge, Collection]),
  /** The words that produced the proposal, for `meta.prompt` and the §9.5 summary. */
  prompt: z.string().optional(),
  actor: z.enum(["user", "agent"]).default("agent"),
});

const NOT_YET: Record<string, string> = {
  knowledge:
    "Knowledge writes arrive in Phase 7, with the note format and the map-link rule they depend " +
    "on. Nothing was written.",
  collection:
    "Collection writes arrive in Phase 7, with the collection format and the index that " +
    "regenerates around it. Nothing was written.",
};

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { proposal, prompt, actor } = Input.parse(await body(request));

    if (proposal.kind !== "tasks") {
      throw new AgentError("unsupported", NOT_YET[proposal.kind]);
    }

    const result = await createTasks({
      items: proposal.items,
      source: "prompt",
      actor,
      ...(prompt === undefined ? {} : { prompt }),
    });
    return ok({ ...result, created: proposal.items.length });
  });
}
