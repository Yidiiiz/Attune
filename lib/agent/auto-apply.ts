// Owns: the one knowledge write in this app that lands without a person pressing a button (PROJECT.md
// §6.3). It runs once per turn, from `runChatTurn`, **after** the turn's own finalize batch and only
// when that turn completed — a stopped or failed reply keeps its proposals as cards, because a write
// nobody asked for should not ride on a reply nobody finished.
//
// What makes it tolerable is that it is never silent: the batch is `actor: agent` in the log, the
// client is sent an `applied` event for the toast and its Undo, and `meta.autoApplied` is what the
// transcript marker is read from afterwards (`lib/history/auto-applied.ts`). Which write qualifies,
// and the one-per-turn cap, are `memory.ts`'s; this file only applies the choice.
//
// Failure behavior: a refused auto-apply — the profile file missing, a credential in the text — is
// not the turn's failure. The write goes back to the card list with the rest, where Add will show the
// same refusal inline, and the server's console says why it did not apply itself.

import { runBatch } from "../history/batch.ts";
import { writeKnowledge } from "../history/knowledge-actions.ts";
import type { AutoApplied, AutoAppliedMeta } from "../history/auto-applied.ts";
import { addedLines, pickAutoApply } from "./memory.ts";
import type { ProposedWrite } from "./memory.ts";

export async function autoApply(
  conversationId: string,
  messageId: string,
  writes: ProposedWrite[],
): Promise<{ applied: AutoApplied | null; rest: ProposedWrite[] }> {
  const { auto, rest } = pickAutoApply(writes, false);
  if (auto === null) return { applied: null, rest };

  const source = `chat:${conversationId}`;
  const action = writeKnowledge(auto, source);
  const marker: AutoAppliedMeta = { conversation: conversationId, message: messageId, path: auto.path, lines: addedLines(auto) };
  try {
    const result = await runBatch({
      actor: "agent",
      scope: "user",
      summary: action.summary,
      commitPrefix: "knowledge",
      meta: { source, autoApplied: marker },
      actions: [action],
    });
    return { applied: { batch: result.batch, message: messageId, path: auto.path, lines: marker.lines, summary: action.summary }, rest };
  } catch (err) {
    console.warn(`agent: the write to ${auto.path} did not apply itself (${(err as Error).message}); it is shown as a card instead`);
    return { applied: null, rest: writes };
  }
}
