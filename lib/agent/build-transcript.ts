// Owns: completed Build exchanges as ordinary conversation records (§13.4).
// Failure behavior: the shared batch refuses unsafe text without partial message files.
import { runBatch } from "../history/batch.ts";
import { createConversation, saveMessage, updateConversation } from "../history/chat-actions.ts";
import { newConversationId, readConversation } from "../store/chats.ts";
import { readSettings } from "../store/settings.ts";
import { ConversationSchema, MessageSchema } from "../chat/types.ts";
import { extractRefs } from "../chat/refs.ts";
import { uuidv7 } from "../chat/uuid.ts";
import { nowIso } from "../schedule/dates.ts";

export async function recordBuild(prompt: string, answer: string, conversationId?: string, failure?: string): Promise<string> {
  const settings = await readSettings();
  const now = nowIso(settings.timezone);
  const id = conversationId ?? await newConversationId();
  const existing = conversationId ? (await readConversation(id)).conversation : null;
  const userId = uuidv7(), assistantId = uuidv7();
  const conversation = existing ?? ConversationSchema.parse({ id, title: prompt.slice(0, 70), model: settings.models.build.model, createdAt: now, updatedAt: now });
  const message = (role: "user" | "assistant", mid: string, parent: string | null, text: string) => ({
    ...MessageSchema.parse({ id: mid, parentId: parent, role, createdAt: now,
      model: role === "assistant" ? settings.models.build.model : null, refs: extractRefs(text),
      status: role === "assistant" && failure ? "failed" : "complete", error: role === "assistant" ? failure ?? null : null }), text,
  });
  await runBatch({ actor: "user", scope: "user", summary: "Build conversation", commitPrefix: "chat", actions: [
    ...(existing ? [] : [createConversation(conversation)]),
    saveMessage(id, message("user", userId, conversation.activeLeafId, prompt)),
    saveMessage(id, message("assistant", assistantId, userId, answer)),
    updateConversation(id, { activeLeafId: assistantId }),
  ] });
  return id;
}
