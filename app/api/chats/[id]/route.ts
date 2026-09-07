// Owns: one conversation — everything in it, the fields anyone can change about it, and deleting it
// (PROJECT.md §14, §16.2).
//
// `PATCH` carries the leaf move, which is the highest-frequency write in the chat tab: switching
// branches is `activeLeafId` and nothing else (§16.1). It is an ordinary logged, committed
// `chat.update` (Decision 11) — consistency with "everything is reversible" beats commit quiet, and
// §7.5 hides the type from the history list by default so the noise costs nothing on screen.
//
// Failure behavior: a conversation that is not there is `not_found` → 404, from the store. A field
// this route does not know about is rejected by zod rather than written through, because
// `conversation.md` is parsed by a schema that would keep an unknown key forever.

import { z } from "zod";
import { runBatch } from "@/lib/history/batch";
import { removeConversation, updateConversation } from "@/lib/history/chat-actions";
import { readConversation } from "@/lib/store/chats";
import { modelEntry } from "@/lib/agent/registry";
import { StoreError } from "@/lib/store/paths";
import { body, handle, ok } from "../../respond";

export const dynamic = "force-dynamic";

const Changes = z.object({
  title: z.string().min(1).optional(),
  pinned: z.boolean().optional(),
  activeLeafId: z.string().nullable().optional(),
  model: z.string().optional(),
  context: z
    .object({ file: z.string().nullable().default(null), taskIds: z.array(z.string()).default([]) })
    .optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  return handle(async () => ok(await readConversation((await params).id)));
}

/** What a change is called in the log, so `chat.update` rows say which of the five it was. */
function describe(changes: z.infer<typeof Changes>, title: string): string {
  if (changes.activeLeafId !== undefined) return `switch branch in '${title}'`;
  if (changes.title !== undefined) return `rename '${title}' to '${changes.title}'`;
  if (changes.pinned !== undefined) return `${changes.pinned ? "pin" : "unpin"} '${title}'`;
  if (changes.model !== undefined) return `use ${changes.model} in '${title}'`;
  return `update '${title}'`;
}

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    const changes = Changes.parse(await body(request));
    const { conversation, messages } = await readConversation(id);

    // A model the registry does not know would be written into the file and then refused on every
    // turn, one screen away from where it was chosen (§11.4).
    if (changes.model !== undefined && modelEntry(changes.model) === null) {
      throw new StoreError("invalid", `${changes.model} is not a model this app knows about`);
    }
    // The same for a leaf: a conversation pointing at a message that is not in it renders empty.
    if (
      changes.activeLeafId !== undefined &&
      changes.activeLeafId !== null &&
      !messages.some((message) => message.id === changes.activeLeafId && !message.deleted)
    ) {
      throw new StoreError("not_found", `no message ${changes.activeLeafId} in this conversation`);
    }

    const summary = describe(changes, conversation.title || id);
    const result = await runBatch({
      actor: "user",
      scope: "user",
      summary,
      commitPrefix: "chat",
      actions: [updateConversation(id, changes, summary)],
    });
    return ok({ ...result });
  });
}

export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    const { conversation } = await readConversation(id);
    const summary = `delete '${conversation.title || id}'`;

    const result = await runBatch({
      actor: "user",
      scope: "user",
      summary,
      commitPrefix: "chat",
      actions: [removeConversation(id, summary)],
    });
    return ok({ ...result });
  });
}
