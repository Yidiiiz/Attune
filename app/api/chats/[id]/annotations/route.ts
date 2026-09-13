// Owns: creating an annotation on a message (PROJECT.md §14, §16.4).
//
// The id is minted here rather than on the client, unlike a message's. A message's id has to exist
// before the request so the client can render optimistically and so anchoring knows what it is
// anchoring to (§16.2); an annotation has neither problem — nothing streams into it, and the card
// it becomes is drawn from the response.
//
// **The target message is checked before anything is written.** An annotation whose
// `targetMessageId` names nothing renders in the Unanchored tray forever and can never be repaired,
// because there is no message to repair it against. Refusing at the door is the one place that
// costs nothing.
//
// Failure behavior: a conversation or message that is not there is `not_found` → 404, from the
// store or from the check below. A body zod rejects is `invalid` → 400. Nothing partial is written:
// `runBatch` is one transaction and the annotation is one file (§16.4's rule against shared arrays).

import { z } from "zod";
import { runBatch } from "@/lib/history/batch";
import { saveAnnotation } from "@/lib/history/chat-actions";
import { readConversation } from "@/lib/store/chats";
import { uuidv7 } from "@/lib/chat/uuid";
import { StoreError } from "@/lib/store/paths";
import { body, handle, ok, parseInput } from "../../../respond";

export const dynamic = "force-dynamic";

const New = z.object({
  kind: z.enum(["note", "comment"]),
  targetMessageId: z.string().min(1),
  text: z.string().default(""),
  quote: z.string().nullable().default(null),
  prefix: z.string().nullable().default(null),
  suffix: z.string().nullable().default(null),
  charOffset: z.number().nullable().default(null),
  anchorText: z.string().nullable().default(null),
  offsetRatio: z.number().nullable().default(null),
  includeInContext: z.boolean().default(false),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    const input = parseInput(New, await body(request));
    const { conversation, messages } = await readConversation(id);

    if (!messages.some((message) => message.id === input.targetMessageId)) {
      throw new StoreError("not_found", `no message ${input.targetMessageId} in this conversation`);
    }

    const annotation = {
      schema: 1,
      id: uuidv7(),
      ...input,
      deleted: false,
      createdAt: new Date().toISOString(),
    };

    const result = await runBatch({
      actor: "user",
      scope: "user",
      summary: `annotate a message in '${conversation.title || id}'`,
      commitPrefix: "chat",
      actions: [saveAnnotation(id, annotation)],
    });
    return ok({ ...result, annotation });
  });
}
