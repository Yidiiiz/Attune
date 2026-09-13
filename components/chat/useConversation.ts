// Owns: the client half of a turn — PROJECT.md §16.3's optimistic insert, the NDJSON read, the
// rollback, and the stop. It is the counterpart of `lib/agent/turn.ts`: that file decides what
// reaches disk, this one decides what is on screen while it does.
//
// **Ids are minted here** (§16.2) and sent with the request, so the pair is drawn before the server
// has answered and an annotation can anchor to an id that already exists. The route echoes them
// back as the first line, which is the handshake that says the server agreed.
//
// **Branching is this same `send` with a different parent** (§16.2). Edit, regenerate and branch
// from here are not three code paths: they are `parentId` and `withoutPrompt`, which the route and
// `runChatTurn` already understood before anything on screen could ask for them. `switchTo` is the
// other half — one field on `conversation.md` — and between them that is the whole of §16.2.
//
// **Optimistic inserts roll back.** A send rejected before any delta removes both rows and puts the
// text back in the composer — §16.3's rule, and the §15 item that says a rejected send leaves no
// message behind. A failure *after* deltas keeps the rows: something was said, and the reply is
// marked failed with a Retry beside it.
//
// The accumulating text lives in this component's state and the abort controller in a ref, so
// navigating away unmounts both and aborts the request — which is what clears the *server's* buffer
// too, since the route forwards the signal (§16.8's "stream buffers leaking"). There is no
// module-level map here on purpose: a buffer that outlives its component is exactly the leak.
//
// Failure behavior: after every terminal path the conversation is re-read from the server rather
// than patched locally, so what is on screen is what is on disk — a refusal needs no unwinding, and
// a partial reply cannot drift from the file that holds it. §13.5's routing is applied once, here:
// `auth` and `provider` raise a toast because their remedy is the Settings screen, everything else
// is returned to be shown inline beside the text that caused it.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uuidv7 } from "@/lib/chat/uuid";
import { reportFailure, send as post } from "@/components/tasks/writes";
import { useConversationWrites } from "./useConversationWrites";
import type { Annotation, Conversation, Message } from "@/lib/chat/types";

export interface ConversationState {
  conversation: Conversation;
  messages: Message[];
  annotations: Annotation[];
}

/** What a send needs beyond the text: absent for an ordinary send at the current leaf. */
export interface SendOptions {
  /** An explicit parent — an edit, a regenerate, or a branch from here (§16.2). */
  parentId?: string | null;
  /** No new prompt: a regenerate appends only an assistant sibling. */
  withoutPrompt?: boolean;
  /** `data/`-relative paths from §9.2's upload, carried on the user message (§4.7, amendment `o`). */
  attachments?: string[];
}

const draft = (id: string, parentId: string | null, role: Message["role"], text: string): Message => ({
  schema: 1,
  id,
  parentId,
  role,
  status: "streaming",
  createdAt: new Date().toISOString(),
  model: null,
  attachments: [],
  refs: [],
  deleted: false,
  error: null,
  text,
});

export function useConversation(initial: ConversationState) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  // `initial` seeds this state once and is never adopted again (Decision 69). Opening another
  // conversation is a remount, not an update: `app/chat/page.tsx` keys `ChatView` by conversation
  // id. So a server render arriving mid-session is always a *stale* view of the conversation
  // already open — `send` ends with `router.refresh()` for the panel's sake, and that payload
  // lands whenever it lands, which is how a first send's refresh used to overwrite a second send's
  // `reload` and snap the view back to the state before the edit. `reload()` is the only path in,
  // because it is ours and therefore ordered. §16.8 rules out a filesystem watcher, and Decision
  // 20's focus refetch does not exist yet (amendment `q`); when it does it calls `reload`.

  // Unmounting aborts, which ends the request, which ends the server's turn and clears its buffer.
  useEffect(() => () => abort.current?.abort(), []);

  /**
   * Re-read the conversation and adopt it — **unless a later read has already been adopted.**
   *
   * The ticket is not defensive programming; it closes the second half of Decision 69's race and
   * the browser checks found it too. `send` ends by re-reading, and `void send(...)` means nothing
   * waits for that read. Meanwhile the view is already correct optimistically, so the reader can
   * act — switch a branch, change the model — and their write's re-read can resolve *first*. The
   * older payload then lands on top and silently undoes what they just did.
   *
   * Reads are ordered by issue rather than by arrival because a read issued later sees a state at
   * least as new as one issued earlier. The discarded payload is still returned, since a caller
   * asking "has this message stopped streaming?" wants the freshest answer either way.
   */
  const issued = useRef(0);
  const applied = useRef(0);
  const reload = useCallback(async (id: string): Promise<ConversationState | null> => {
    issued.current += 1;
    const ticket = issued.current;
    const answer = await post(`/api/chats/${id}`);
    if (answer.error !== null) return null;
    const next = answer.data as unknown as ConversationState;
    if (ticket > applied.current) {
      applied.current = ticket;
      setState(next);
    }
    return next;
  }, []);

  /**
   * Re-read until the message has stopped streaming. Only the abort path needs this: a normal turn
   * ends after `finalizeTurn` has written, but Stop returns the moment the socket closes, while the
   * server is still deciding what to keep. So wait on the observable consequence — the status on
   * disk — with the attempt count as a failure guard and not as a schedule.
   */
  const settle = useCallback(
    async (id: string, messageId: string): Promise<void> => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const next = await reload(id);
        const message = next?.messages.find((one) => one.id === messageId);
        if (next === null || message === undefined || message.status !== "streaming") return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
    [reload],
  );

  const send = useCallback(
    async (text: string, options: SendOptions = {}): Promise<string | null> => {
      const conversationId = state.conversation.id;
      const userMessageId = options.withoutPrompt === true ? null : uuidv7();
      const assistantMessageId = uuidv7();
      const parentId =
        options.parentId === undefined ? state.conversation.activeLeafId : options.parentId;

      // Drawn before the request leaves, so the exchange appears the moment Enter is pressed.
      const optimistic: Message[] = [
        ...(userMessageId === null
          ? []
          : [{ ...draft(userMessageId, parentId, "user", text), attachments: options.attachments ?? [] }]),
        draft(assistantMessageId, userMessageId ?? parentId, "assistant", ""),
      ];
      setState((current) => ({
        ...current,
        conversation: { ...current.conversation, activeLeafId: assistantMessageId },
        messages: [...current.messages, ...optimistic],
      }));
      setStreamingId(assistantMessageId);
      setError(null);

      const controller = new AbortController();
      abort.current = controller;
      let failure: { message: string; code: string } | null = null;
      let delivered = "";

      try {
        const response = await fetch(`/api/chats/${conversationId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            ...(userMessageId === null
              ? {}
              : { userMessageId, text, attachments: options.attachments ?? [] }),
            assistantMessageId,
            ...(options.parentId === undefined ? {} : { parentId: options.parentId }),
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

            // NDJSON: whole lines only. The tail stays in `buffer` until its newline arrives.
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const raw of lines) {
              if (raw.trim().length === 0) continue;
              const event = JSON.parse(raw);
              if (event.type === "delta") {
                delivered += event.text;
                setState((current) => ({
                  ...current,
                  messages: current.messages.map((message) =>
                    message.id === assistantMessageId ? { ...message, text: delivered } : message,
                  ),
                }));
              } else if (event.type === "error") {
                failure = { message: event.message, code: event.code };
              }
            }
          }
        }
      } catch (err) {
        // An abort is the user's own Stop: the server is finalizing the partial reply, so this is
        // not a failure to report — the reload below shows what it kept.
        if (!controller.signal.aborted) {
          failure = { message: (err as Error).message, code: "error" };
        }
      } finally {
        abort.current = null;
        setStreamingId(null);
      }

      if (controller.signal.aborted) await settle(conversationId, assistantMessageId);
      else await reload(conversationId);
      // The panel is server-rendered, and a first send names the conversation: without this the
      // list still says "New conversation" until the next navigation.
      router.refresh();

      if (failure === null) return null;

      // §16.3: nothing was said, so the rows go and the caller puts the text back in the box.
      if (delivered.length === 0) {
        setState((current) => ({
          ...current,
          messages: current.messages.filter(
            (message) => message.id !== assistantMessageId && message.id !== userMessageId,
          ),
        }));
      }

      // §13.5: the remedy for a key or a provider is on another screen, so those toast; everything
      // else belongs beside the text that caused it. Either way the message is *returned*, because
      // the return value says "this did not land" and the composer keeps what was typed on both
      // paths — §15's rejected send leaves the text in the box, whichever way it was reported.
      if (failure.code === "auth" || failure.code === "provider") {
        reportFailure("The message was not sent", failure.message);
      } else {
        setError(failure.message);
      }
      return failure.message;
    },
    [reload, router, settle, state.conversation.activeLeafId, state.conversation.id],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  const { switchTo, setModel } = useConversationWrites(state, reload);

  return { state, streamingId, error, setError, send, stop, reload, switchTo, setModel };
}
