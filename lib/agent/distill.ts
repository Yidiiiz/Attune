// Owns: "Distill to knowledge" (PROJECT.md §5's Chats menu, §4.6, Decision 18) — a conversation's
// active path turned into a session summary *proposal*. Nothing here writes: the proposal goes to the
// conversation's tray as a card, and the user's Add is what reaches `runBatch`, like every other
// knowledge write that is not §6.3's small profile append.
//
// It streams through `Provider.streamChat` rather than `parse`, so the scripted provider answers it
// and the menu item is checkable in a browser with no key. The conversation is sent as itself, with
// one user turn after it asking for the summary; the instructions are the only system block, because
// a summary is of what was said, not of the user's profile.
//
// Failure behavior: an empty conversation is refused before any model call. A provider failure is
// the `AgentError` it raised, which the route turns into §13.5's shape — a key problem toasts, the
// rest shows inline in the tray. An answer with no text is refused rather than proposed as an empty
// summary, which would look like a success and replace a real one.

import { activePath, buildTree } from "../chat/tree.ts";
import { readConversation } from "../store/chats.ts";
import { exists } from "../store/files.ts";
import { StoreError } from "../store/paths.ts";
import { estimateTokens } from "./context.ts";
import { DISTILL, DISTILL_REQUEST } from "./prompts.ts";
import { AgentError, effortFor, providerFor } from "./registry.ts";
import type { Effort } from "./registry.ts";
import { toProviderMessages } from "./turn.ts";
import type { ProposedWrite } from "./memory.ts";

/** A summary is short (§6.5 counts notes over 200 words); this is a failure guard, not a target. */
const MAX_TOKENS = 4000;

export async function distillConversation(
  id: string,
  opts: { effort?: Effort; signal: AbortSignal },
): Promise<{ kind: "knowledge"; writes: ProposedWrite[] }> {
  const { conversation, messages, annotations } = await readConversation(id);
  const said = toProviderMessages(activePath(buildTree(messages), conversation.activeLeafId), annotations);
  if (said.length === 0) throw new StoreError("invalid", "there is nothing in this conversation to distill yet");

  const model = conversation.model;
  let text = "";
  for await (const event of providerFor(model).streamChat(
    {
      model,
      effort: effortFor(model, opts.effort),
      system: [{ label: "Instructions", source: "lib/agent/prompts.ts", text: DISTILL, tokens: estimateTokens(DISTILL) }],
      messages: [...said, { role: "user", content: [{ type: "text", text: DISTILL_REQUEST }] }],
      tools: [],
      maxTokens: MAX_TOKENS,
    },
    opts.signal,
  )) {
    if (event.type === "text") text += event.text;
  }

  const summary = text.trim();
  if (summary.length === 0) throw new AgentError("provider", "the model returned no summary");

  // One summary per conversation (§4.6): a second distill replaces the first, and the card says so.
  const path = `knowledge/sessions/${id}.md`;
  const present = await exists(path);
  return {
    kind: "knowledge",
    writes: [{
      path,
      op: present ? "replace" : "create",
      content: summary,
      reason: present ? "a new summary of this conversation, replacing the last one" : "a summary of this conversation",
      mapLink: null,
    }],
  };
}
