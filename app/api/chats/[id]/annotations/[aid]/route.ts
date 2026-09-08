// Owns: changing one annotation (PROJECT.md §14, §16.4) — its text, whether it goes into context,
// and its soft delete and restore.
//
// **`PUT` is the only verb, and delete is a field on it.** §16.4 says soft delete with a restore
// tray, so removal and restoration are the same operation with `deleted` set either way; a `DELETE`
// method beside it would be a second path to the same file that could disagree about what a delete
// means. §16.2's message deletion is genuinely two operations — soft or hard, depending on what
// hangs below — and has its own route for that reason. An annotation has nothing hanging below it.
//
// The write is whole-file (§16.4): the stored annotation is read, the named fields are replaced,
// and the result is written. There is no shared array to clobber, which is the failure §16.8 lists.
//
// Failure behavior: an annotation this conversation does not have is `not_found` → 404, checked
// here rather than left to produce an empty file under a new id. A no-op — a body that changes
// nothing — still returns 200 and writes nothing, because `runBatch`'s dirty check refuses to
// commit a file it did not change (Conventions).

import { z } from "zod";
import { runBatch } from "@/lib/history/batch";
import { saveAnnotation } from "@/lib/history/chat-actions";
import { readConversation } from "@/lib/store/chats";
import { StoreError } from "@/lib/store/paths";
import { body, handle, ok } from "../../../../respond";

export const dynamic = "force-dynamic";

const Changes = z.object({
  text: z.string().optional(),
  includeInContext: z.boolean().optional(),
  deleted: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string; aid: string }> };

/** What the change is called in the log, so an `annotation.write` row says which of the three. */
function describe(changes: z.infer<typeof Changes>, title: string): string {
  if (changes.deleted === true) return `remove an annotation in '${title}'`;
  if (changes.deleted === false) return `restore an annotation in '${title}'`;
  if (changes.includeInContext !== undefined) {
    return `${changes.includeInContext ? "include" : "exclude"} an annotation in '${title}'`;
  }
  return `edit an annotation in '${title}'`;
}

export async function PUT(request: Request, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id, aid } = await params;
    const changes = Changes.parse(await body(request));
    const { conversation, annotations } = await readConversation(id);

    const existing = annotations.find((annotation) => annotation.id === aid);
    if (existing === undefined) {
      throw new StoreError("not_found", `no annotation ${aid} in this conversation`);
    }

    const annotation = { ...existing, ...changes };
    const summary = describe(changes, conversation.title || id);
    const result = await runBatch({
      actor: "user",
      scope: "user",
      summary,
      commitPrefix: "chat",
      actions: [saveAnnotation(id, annotation, summary)],
    });
    return ok({ ...result, annotation });
  });
}
