// Owns: one conversation on screen — the active path, the composer under it, and the four things
// a linear chat can do with a message: retry, discard, delete, and scroll to the newest.
//
// What it renders is `activePath(buildTree(messages), activeLeafId)` and nothing else (§16.2).
// Branch switching, the sidebar and annotations are Phase 6b; this file is deliberately the shape
// they attach to rather than a smaller thing they would replace.
//
// **Retry is a regenerate**, per §16.3: a failed reply is not rewritten in place — a complete
// message is immutable and a failed one is a fact — so Retry appends an assistant sibling under the
// same prompt. Discard hard-deletes the failed leaf, which is the one deletion §16.2 allows to
// remove a file outright.
//
// Failure behavior: every write here goes through an API route and then re-reads, so nothing on
// screen is a local guess. §13.5's split is applied in `useConversation` — a key error toasts, a
// refusal lands inline above the composer with the text still in the box.

"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { activePath, buildTree } from "@/lib/chat/tree";
import { reportFailure, send as post } from "@/components/tasks/writes";
import MessageRow from "./MessageRow";
import ChatComposer from "./ChatComposer";
import { useConversation } from "./useConversation";
import type { ConversationState } from "./useConversation";
import type { Message } from "@/lib/chat/types";
import styles from "./Chat.module.css";

export interface ChatViewProps {
  initial: ConversationState;
  /** True while `ATTUNE_FAKE_PROVIDER` is answering, so the page says so rather than looking odd. */
  scripted: boolean;
}

export default function ChatView({ initial, scripted }: ChatViewProps) {
  const router = useRouter();
  const { state, streamingId, error, setError, send, stop, reload } = useConversation(initial);
  const bottom = useRef<HTMLDivElement | null>(null);

  const path = useMemo(
    () => activePath(buildTree(state.messages), state.conversation.activeLeafId),
    [state.messages, state.conversation.activeLeafId],
  );

  // §16.0 rule 6: no virtualization, `scrollIntoView` for navigation. The newest message is what
  // someone wants to see, and it moves while a reply streams.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [path.length, streamingId, state.messages]);

  /** Retry = regenerate: a new assistant sibling under the failed one's own parent (§16.2). */
  const retry = (message: Message): void => {
    void send("", { parentId: message.parentId, withoutPrompt: true });
  };

  const remove = async (message: Message): Promise<void> => {
    const answer = await post(`/api/chats/${state.conversation.id}/messages/${message.id}`, {
      method: "DELETE",
    });
    if (answer.error !== null) {
      // A refusal here has no on-screen origin of its own — it came from a row control — so §13.5
      // sends it to a toast naming what did not happen.
      reportFailure("The message was not deleted", answer.error);
      return;
    }
    await reload(state.conversation.id);
    router.refresh(); // the panel's list shows the conversation's own timestamp
  };

  return (
    <section className={styles.view} data-ui="conversation" data-conversation={state.conversation.id}>
      <header className={styles.viewHeader}>
        <h1 className={styles.viewTitle}>{state.conversation.title || "New conversation"}</h1>
        <span className={styles.viewModel}>{state.conversation.model}</span>
        {scripted ? (
          <span className={styles.scriptedBadge} title="ATTUNE_FAKE_PROVIDER is set: replies come from a script in lib/agent/scripted.ts, not from a model.">
            scripted replies
          </span>
        ) : null}
      </header>

      <div className={styles.messages} data-ui="messages">
        {path.length === 0 ? (
          <p className={styles.empty}>Nothing said yet. What are you working on?</p>
        ) : (
          path.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              streaming={message.id === streamingId}
              {...(message.role === "assistant" ? { onRetry: retry, onDelete: (m: Message) => void remove(m) } : {})}
            />
          ))
        )}
        <div ref={bottom} />
      </div>

      <ChatComposer
        onSend={(text) => send(text)}
        onStop={stop}
        streaming={streamingId !== null}
        error={error}
        onDismissError={() => setError(null)}
      />
    </section>
  );
}
