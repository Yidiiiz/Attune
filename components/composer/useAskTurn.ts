// Owns: PROJECT.md §9.6 — Ask mode from the floating sheet. It creates a real conversation under
// `data/chats/` (Decision 17), streams the reply into the sheet, and remembers which conversation
// belongs to which task for the rest of the session so a second question about the same task
// continues rather than starting again.
//
// A conversation is created **before** the first send rather than lazily afterwards, because the
// message route needs one to write into and because Decision 37 says these are ordinary
// conversations: they appear in the Chats panel like any other, and a question that turns out to
// matter should already be findable.
//
// The session map is deliberately in memory. It is "the same task within this session", not a
// stored association — `conversation.context.taskIds` is the durable record, and rebuilding the map
// from it on load would silently reopen a conversation from last week (§16.9).
//
// Failure behavior: §13.5's routing, the same as `useComposerTurn`'s — an authentication or
// configuration failure raises a toast because its remedy is the Settings screen, everything else
// is returned to be shown inline in the sheet beside the text that caused it. A send that fails
// before any delta leaves nothing: `runChatTurn` removes the optimistic pair, and the sheet keeps
// what was typed.

"use client";

import { useCallback, useRef, useState } from "react";
import { uuidv7 } from "@/lib/chat/uuid";
import { reportFailure, send as post } from "@/components/tasks/writes";
import type { TurnListeners } from "@/components/chat/useConversation";
import type { AutoApplied } from "@/lib/chat/types";

/** taskId → conversation, for this page's lifetime only. */
const started = new Map<string, string>();

export interface AskTurn {
  conversationId: string | null;
  reply: string;
  streaming: boolean;
  /**
   * The write this answer's turn applied itself, drawn under the answer with its Undo — the sheet's
   * copy of the transcript marker, since a toast carries no buttons (Decision 84). It belongs to the
   * answer on screen, so the next question clears it.
   */
  applied: AutoApplied[];
  /** Forget one after its Undo landed; the log already says it is undone. */
  dropApplied: (batch: string) => void;
  ask: (text: string, taskIds: string[]) => Promise<string | null>;
  stop: () => void;
  reset: () => void;
}

/**
 * Proposals and the auto-applied write go to `listeners` as they arrive — the sheet hands them to
 * its tray and its toast (§9.6), the same two places the chat tab sends its own.
 */
export function useAskTurn(listeners: TurnListeners = {}): AskTurn {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [applied, setApplied] = useState<AutoApplied[]>([]);
  const abort = useRef<AbortController | null>(null);
  const listen = useRef(listeners);
  listen.current = listeners;

  const reset = useCallback(() => {
    setReply("");
    setApplied([]);
  }, []);

  const dropApplied = useCallback((batch: string) => {
    setApplied((all) => all.filter((one) => one.batch !== batch));
  }, []);

  const ask = useCallback(
    async (text: string, taskIds: string[]): Promise<string | null> => {
      const key = taskIds.join(",");
      let id = conversationId ?? (key.length > 0 ? started.get(key) ?? null : null);

      if (id === null) {
        const created = await post("/api/chats", {
          method: "POST",
          body: JSON.stringify({ context: { file: null, taskIds } }),
        });
        if (created.error !== null) {
          reportFailure("The conversation was not started", created.error);
          return null;
        }
        id = created.data.id as string;
        if (key.length > 0) started.set(key, id);
      }
      setConversationId(id);
      setReply("");
      setApplied([]);
      setStreaming(true);

      const controller = new AbortController();
      abort.current = controller;
      let failure: { message: string; code: string } | null = null;
      let delivered = "";

      try {
        const response = await fetch(`/api/chats/${id}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            userMessageId: uuidv7(),
            text,
            assistantMessageId: uuidv7(),
            mode: "ask",
          }),
        });

        if (!response.ok || response.body === null) {
          const problem = await response.json().catch(() => ({}));
          failure = { message: problem.error ?? response.statusText, code: problem.code ?? "error" };
        } else {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const raw of lines) {
              if (raw.trim().length === 0) continue;
              const event = JSON.parse(raw);
              if (event.type === "delta") {
                delivered += event.text;
                setReply(delivered);
              } else if (event.type === "proposal") {
                listen.current.onProposal?.(event.proposal);
              } else if (event.type === "applied") {
                setApplied((all) => [...all, event.applied]);
                listen.current.onApplied?.(event.applied);
              } else if (event.type === "error") {
                failure = { message: event.message, code: event.code };
              }
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) failure = { message: (err as Error).message, code: "error" };
      } finally {
        abort.current = null;
        setStreaming(false);
      }

      if (failure === null) return null;
      if (failure.code === "auth" || failure.code === "provider") {
        reportFailure("The question was not sent", failure.message);
        return null;
      }
      return failure.message;
    },
    [conversationId],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  return { conversationId, reply, streaming, applied, dropApplied, ask, stop, reset };
}
