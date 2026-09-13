// Owns: turning a proposal the user approved into one batch (PROJECT.md §14, §9.5). All three kinds.
//
// `kind: "tasks"` goes through the same `createTasks` the composer's Add all button uses, so the
// summary, the `source`, and `meta.prompt` are identical whichever route the drafts arrived by.
//
// `kind: "knowledge"` applies exactly the writes it is sent — the card's, after any edit — and
// nothing it infers. That is what makes §6.3's rewrite honest: `filterWrites` turned a duplicate
// create into an append *before* the card was drawn, so the append is what was approved and the
// append is what lands. A new note without a map link is built as asked and refused by `runBatch`,
// which is where §6.3 is enforced for every batch.
//
// `kind: "collection"` appends to a collection, or creates one when `collection` is `new:<title>`.
//
// Failure behavior: `runBatch` owns everything that can go wrong once a write starts — the rollback,
// the §11.5 refusal, the §6.3 refusal, the commit. A refusal here leaves the preview panel exactly as
// it was, which is what lets someone fix a path or add a map and press Add again (Decision 50).

import { z } from "zod";
import { runBatch } from "@/lib/history/batch";
import { TaskDraftSchema } from "@/lib/history/actions";
import { addToCollection, writeKnowledge } from "@/lib/history/knowledge-actions";
import { createTasks } from "../../tasks/create";
import { body, handle, ok, parseInput } from "../../respond";

export const dynamic = "force-dynamic";

const Tasks = z.object({
  kind: z.literal("tasks"),
  // The drafts as the panel now holds them: whatever the model proposed, plus every inline edit.
  // `inferred` is dropped by the schema — it describes where a value came from, not what it is.
  items: z.array(TaskDraftSchema).min(1),
});

const Write = z.object({
  path: z.string().min(1),
  op: z.enum(["create", "append", "replace"]),
  content: z.string(),
  reason: z.string().default(""),
  mapLink: z.string().nullable().default(null),
  // `rewritten` is read by the card and dropped here: it explains the write, it is not part of it.
});

const Knowledge = z.object({ kind: z.literal("knowledge"), writes: z.array(Write).min(1) });

const Collection = z.object({
  kind: z.literal("collection"),
  collection: z.string().min(1),
  items: z.array(z.string().trim().min(1)).min(1),
});

const Input = z.object({
  proposal: z.discriminatedUnion("kind", [Tasks, Knowledge, Collection]),
  /** The words that produced the proposal, for `meta.prompt` and the §9.5 summary. */
  prompt: z.string().optional(),
  actor: z.enum(["user", "agent"]).default("agent"),
  /** Where it came from, as §4.2 spells a note's `source`: `chat:<id>`, `file:<path>`, `manual`. */
  source: z.string().default("manual"),
});

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { proposal, prompt, actor, source } = parseInput(Input, await body(request));
    const meta = { source, ...(prompt === undefined ? {} : { prompt }) };

    if (proposal.kind === "tasks") {
      const result = await createTasks({
        items: proposal.items,
        source: "prompt",
        actor,
        ...(prompt === undefined ? {} : { prompt }),
      });
      return ok({ ...result, created: proposal.items.length });
    }

    if (proposal.kind === "knowledge") {
      const actions = proposal.writes.map((write) => writeKnowledge(write, source));
      const result = await runBatch({
        actor,
        scope: "user",
        summary: actions.length === 1 ? actions[0].summary : `remember ${actions.length} things`,
        commitPrefix: "knowledge",
        meta,
        actions,
      });
      return ok({ ...result, written: proposal.writes.length });
    }

    const action = addToCollection(proposal.collection, proposal.items);
    const result = await runBatch({ actor, scope: "user", summary: action.summary, commitPrefix: "knowledge", meta, actions: [action] });
    return ok({ ...result, added: proposal.items.length });
  });
}
