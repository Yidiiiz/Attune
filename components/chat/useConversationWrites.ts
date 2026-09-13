// Owns: the conversation's one-field writes — switching branch (§16.2) and choosing its model
// (§10.2). Each is a single `PATCH` followed by the ordered `reload` from `useConversation.ts`,
// which is why that hook passes its `reload` in rather than this one reading on its own. Split out
// of `useConversation.ts` along the seam named at the Phase 6b close: the turn on one side, these
// on the other.
//
// Failure behavior: a refused write is a toast (§13.5 — neither control has an on-screen origin to
// report beside) and nothing on screen changes, because the view only moves on a re-read.

"use client";

import { useCallback } from "react";
import { buildTree, latestLeafUnder } from "@/lib/chat/tree";
import { reportFailure, send as post } from "@/components/tasks/writes";
import type { ConversationState } from "./useConversation";

export function useConversationWrites(
  state: ConversationState,
  reload: (id: string) => Promise<ConversationState | null>,
) {
  /**
   * Switch to a sibling branch (§16.2). The whole operation is one field: resolve the branch to the
   * leaf that should be active under it — newest child at each step, `latestLeafUnder`'s policy —
   * and `PATCH activeLeafId`. Nothing else moves, because nothing else is branch state.
   *
   * It writes rather than setting local state on purpose: which branch is open survives a reload
   * and is what the next session opens on, so a switch that lived only in this component would be
   * forgotten by the navigation that follows it. The dirty check is Conventions': a click on the
   * branch already open writes nothing.
   */
  const switchTo = useCallback(
    async (messageId: string): Promise<void> => {
      const conversationId = state.conversation.id;
      const leafId = latestLeafUnder(buildTree(state.messages), messageId);
      if (leafId === state.conversation.activeLeafId) return;

      const answer = await post(`/api/chats/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify({ activeLeafId: leafId }),
      });
      if (answer.error !== null) {
        // A branch arrow has no on-screen origin of its own, so §13.5 sends this to a toast.
        reportFailure("The branch was not switched", answer.error);
        return;
      }
      await reload(conversationId);
    },
    [reload, state.conversation.activeLeafId, state.conversation.id, state.messages],
  );

  /**
   * The model this conversation runs on (§10.2). Another one-field `PATCH`, and the same dirty
   * check: re-choosing what is already chosen writes no batch and makes no commit.
   */
  const setModel = useCallback(
    async (model: string): Promise<void> => {
      if (model === state.conversation.model) return;
      const conversationId = state.conversation.id;
      const answer = await post(`/api/chats/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify({ model }),
      });
      if (answer.error !== null) {
        // The select snaps back to the conversation's model on the next render, because the value
        // it shows is the conversation's and the conversation did not change.
        reportFailure("The model was not changed", answer.error);
        return;
      }
      await reload(conversationId);
    },
    [reload, state.conversation.id, state.conversation.model],
  );

  return { switchTo, setModel };
}
