// Owns: step 3 of `runChatTurn` (lib/agent/turn.ts) — §16.3's one finality contract. `finalizeTurn`
// writes a finished or failed turn as one `chat.message` batch; `discard` removes a turn nothing was
// said in. Split out of `turn.ts` along the seam named at the Phase 6a close.
//
// Failure behavior: whatever `runBatch` and `streamingDiscard` raise reaches `runChatTurn`, which
// discards what is left on disk and reports the code (§13.5).

import { runBatch } from "../history/batch.ts";
import { saveMessage, updateConversation } from "../history/chat-actions.ts";
import { streamingDiscard } from "../history/streaming.ts";
import { extractRefs } from "../chat/refs.ts";
import { messagePath } from "../store/chats.ts";
import type { ChatTurnInput } from "./turn.ts";
import type { ProviderMessage } from "./registry.ts";
import type { Conversation, Message } from "../chat/types.ts";

/** How many words of the first message become a conversation's title before anyone renames it. */
const TITLE_WORDS = 7;

/** §9.5 step 5's sibling: a first line, shortened, so a conversation has a name in the panel. */
export function titleFrom(text: string): string {
  const flat = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`~\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length === 0) return "Untitled conversation";
  const words = flat.split(" ").slice(0, TITLE_WORDS).join(" ");
  return words.length < flat.length ? `${words}…` : words;
}

export interface Started {
  conversation: Conversation;
  user: Message | null;
  assistant: Message;
  messages: ProviderMessage[];
}

/** Step 3, and the only place a turn's status is decided (§16.3's one finality contract). */
export async function finalizeTurn(
  input: ChatTurnInput,
  started: Started,
  text: string,
  failure: { message: string } | null,
): Promise<void> {
  const status = failure === null ? "complete" : "failed";
  const assistant: Message = {
    ...started.assistant,
    status,
    text,
    refs: extractRefs(text),
    error: failure === null ? null : failure.message,
  };

  const title =
    started.conversation.title.trim().length === 0 && started.user !== null
      ? titleFrom(started.user.text)
      : null;

  const named = title ?? (started.conversation.title.trim() || input.conversationId);

  await runBatch({
    actor: "user",
    scope: "user",
    summary: failure === null ? `Reply in '${named}'` : `Unfinished reply in '${named}'`,
    commitPrefix: "chat",
    meta: { mode: input.mode, model: assistant.model, ...(failure === null ? {} : { failed: true }) },
    actions: [
      ...(started.user === null
        ? []
        : [saveMessage(input.conversationId, { ...started.user, status: "complete" }, "Send a message")]),
      saveMessage(input.conversationId, assistant, failure === null ? "Record a reply" : "Record an unfinished reply"),
      updateConversation(
        input.conversationId,
        { activeLeafId: assistant.id, ...(title === null ? {} : { title }) },
        "Move the conversation's leaf",
      ),
    ],
  });
}

/** Nothing was said, so nothing is kept: the optimistic pair is removed and never logged. */
export async function discard(input: ChatTurnInput, started: Started): Promise<void> {
  if (started.user !== null) await streamingDiscard(messagePath(input.conversationId, started.user.id));
  await streamingDiscard(messagePath(input.conversationId, started.assistant.id));
}
