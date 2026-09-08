// Owns: one conversation on screen — the active path, the composer under it, and everything a
// message row can be asked to do: retry, discard, delete, edit, regenerate, branch, and switch.
//
// What it renders is `activePath(buildTree(messages), activeLeafId)` and nothing else (§16.2). The
// sidebar and annotations are the stages after this one; this file is deliberately the shape they
// attach to rather than a smaller thing they would replace.
//
// **The three sibling-creating actions are one call with three parents** (§16.2), and that is the
// whole of branching:
//
//   - **Edit** hangs a new prompt from the edited one's *parent*, so the two versions are siblings
//     and the original is untouched — a message that was said is a fact, and a fact is not edited.
//   - **Regenerate** (which is what Retry is) hangs a new reply from the original reply's parent.
//   - **Branch from here** hangs a new prompt from *this* message, forking the tail rather than
//     replacing the head.
//
// The reasoning for reading the third as a distinct operation, and for offering Edit on prompts
// and Branch on replies, is PROJECT.md Decision 68 — where an argument about what the spec means
// belongs, rather than in a component header.
//
// Failure behavior: every write here goes through an API route and then re-reads, so nothing on
// screen is a local guess. §13.5's split is applied in `useConversation` — a key error toasts, a
// refusal lands inline above the composer with the text still in the box. A delete refused for
// having replies under it (§16.2) toasts, because a row menu has no on-screen origin of its own.

"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { activePath, buildTree, siblingsOf } from "@/lib/chat/tree";
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
  const { state, streamingId, error, setError, send, stop, reload, switchTo } = useConversation(initial);
  const bottom = useRef<HTMLDivElement | null>(null);

  const tree = useMemo(() => buildTree(state.messages), [state.messages]);
  const path = useMemo(
    () => activePath(tree, state.conversation.activeLeafId),
    [tree, state.conversation.activeLeafId],
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

  /** Edit and resend: a user sibling of the edited prompt, then a reply under it. */
  const edit = (message: Message, text: string): Promise<string | null> =>
    send(text, { parentId: message.parentId });

  /** Branch from here: a new prompt parented at this message, forking everything after it. */
  const branch = (message: Message, text: string): Promise<string | null> =>
    send(text, { parentId: message.id });

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
              siblings={siblingsOf(tree, message.id)}
              onSwitch={(id) => void switchTo(id)}
              onDelete={(m: Message) => void remove(m)}
              {...(message.role === "user" ? { onEdit: edit } : { onRetry: retry })}
              {...(message.role === "assistant" && message.status === "complete"
                ? { onBranch: branch }
                : {})}
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
