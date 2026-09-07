// Owns: §16.2's deletion rules, which are three cases and one refusal. A message with children is
// 409 `has_children` — the replies under it hang from its id, and hiding or removing it would
// either strand them or lie about the shape of the conversation. A childless *failed* message is
// removed outright, because it never held content worth keeping (Decision 8). Anything else is
// marked `deleted`, body intact, and its annotations report as "on a deleted message" (§16.4).
//
// Which of the three happened is decided in `lib/history/chat-actions.ts`, not here: this route
// picks no policy, it only turns a refusal into the status §16.2 names.
//
// Failure behavior: the refusal is the feature. `runBatch` rolls back and nothing is written, and
// the client shows the message beside the row it came from — an error with an on-screen origin
// (§13.5), not a toast.

import { runBatch } from "@/lib/history/batch";
import { removeMessage } from "@/lib/history/chat-actions";
import { readConversation } from "@/lib/store/chats";
import { buildTree } from "@/lib/chat/tree";
import { fail, handle, ok } from "../../../../respond";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; mid: string }> };

export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id, mid } = await params;
    const { conversation, messages } = await readConversation(id);
    const tree = buildTree(messages);

    // Answered here rather than left to the builder's `invalid`, because §16.2 names this status
    // and this code, and a client distinguishes "cannot" from "malformed" by them.
    if ((tree.children.get(mid) ?? []).length > 0) {
      return fail(
        "this message has replies under it; delete those first, or branch away from it instead",
        "has_children",
        409,
      );
    }

    const summary = `delete a message in '${conversation.title || id}'`;
    const result = await runBatch({
      actor: "user",
      scope: "user",
      summary,
      commitPrefix: "chat",
      actions: [removeMessage(id, mid)],
    });
    return ok({ ...result });
  });
}
