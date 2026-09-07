// Owns: the conversation list the Chats panel renders, and starting a new one (PROJECT.md §14).
//
// A conversation is created empty, before anything is said, because §9.6 and §16.9 both need one to
// exist before the first turn: "Ask about this" starts a conversation *about* a task, and the
// document view starts one about a file. The title arrives with the first message (Decision 61's
// neighbour — `titleFrom` in `lib/agent/turn.ts`), so what is created here is deliberately unnamed.
//
// Failure behavior: the list is the store's, so an unreadable `conversation.md` costs that one row
// and is logged, never the panel. Creation goes through `runBatch` like every other write, which
// means a conversation whose context path looks like a credential is refused before anything lands.

import { z } from "zod";
import { runBatch } from "@/lib/history/batch";
import { createConversation } from "@/lib/history/chat-actions";
import { listConversations, newConversationId } from "@/lib/store/chats";
import { readSettings } from "@/lib/store/settings";
import { nowIso } from "@/lib/schedule/dates";
import { body, handle, ok } from "../respond";

export const dynamic = "force-dynamic";

const New = z.object({
  title: z.string().default(""),
  /** §16.9: what this conversation is about, set by "Ask about this" or the document view. */
  context: z
    .object({ file: z.string().nullable().default(null), taskIds: z.array(z.string()).default([]) })
    .default({ file: null, taskIds: [] }),
  model: z.string().optional(),
});

export async function GET(): Promise<Response> {
  return handle(async () => ok({ conversations: await listConversations() }));
}

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const input = New.parse(await body(request));
    const settings = await readSettings();
    const id = await newConversationId();
    const now = nowIso(settings.timezone);

    const result = await runBatch({
      actor: "user",
      scope: "user",
      summary: input.title.trim().length > 0 ? `start '${input.title}'` : "start a conversation",
      commitPrefix: "chat",
      actions: [
        createConversation({
          schema: 1,
          id,
          title: input.title,
          activeLeafId: null,
          pinned: false,
          model: input.model ?? settings.models.default.model,
          context: input.context,
          createdAt: now,
          updatedAt: now,
        }),
      ],
    });

    return ok({ id, ...result });
  });
}
