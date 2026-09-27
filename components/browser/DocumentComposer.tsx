// Owns: the composer docked under a document (PROJECT.md §10.2) — the same box the chat tab uses,
// wired to say something *about the open file*.
//
// Three things happen on a send, in this order, and the order is the whole design. The conversation
// is made to exist and to carry this file as its context (§16.9), because a reply about a file that
// the conversation does not record is a reply nobody can find again. The text is then handed over
// through `sessionStorage` rather than the URL. Only then does the view navigate, so a failure at
// either of the first two steps leaves the text in the box with the reason above it (§13.5), which
// is the same contract a refused send has everywhere else.
//
// **Why not send from here.** The reply streams into the conversation, and the conversation is what
// the chat view renders; sending here would mean a second streaming surface, or a document view that
// silently held a turn nobody could see. The handover is what keeps one surface for one job.
//
// Failure behavior: nothing is navigated to until the conversation exists and the text is stored.
// A conversation that cannot be created, a context that cannot be set, and storage that refuses are
// all inline messages that keep every character.

"use client";

import { useRouter } from "next/navigation";
import { send } from "@/components/tasks/writes";
import ChatComposer from "@/components/chat/ChatComposer";
import { stashHandover } from "./handover.ts";

export interface DocumentComposerProps {
  /** The open document, which becomes the conversation's `context.file`. */
  path: string;
  /** The conversation this document was opened from, or null to start one about the file. */
  conversation: string | null;
  error: string | null;
  onError: (message: string | null) => void;
}

export default function DocumentComposer({ path, conversation, error, onError }: DocumentComposerProps) {
  const router = useRouter();

  /** The conversation to send in, made to carry this file. Returns its id, or a message. */
  async function conversationFor(): Promise<{ id: string } | { problem: string }> {
    if (conversation === null) {
      const made = await send("/api/chats", {
        method: "POST",
        body: JSON.stringify({ context: { file: path, taskIds: [] } }),
      });
      if (made.error !== null) return { problem: made.error };
      const id = made.data.id;
      return typeof id === "string" ? { id } : { problem: "the new conversation had no id" };
    }

    // Read first, because `context` is written whole: a blind PATCH would drop the task ids
    // "Ask about this" put there (§16.9).
    const current = await send(`/api/chats/${conversation}`, { method: "GET" });
    if (current.error !== null) return { problem: current.error };
    const context = (current.data.conversation as { context?: { file?: unknown; taskIds?: unknown } } | undefined)?.context;
    const taskIds = Array.isArray(context?.taskIds) ? (context.taskIds as string[]) : [];

    if (context?.file !== path) {
      const set = await send(`/api/chats/${conversation}`, {
        method: "PATCH",
        body: JSON.stringify({ context: { file: path, taskIds } }),
      });
      if (set.error !== null) return { problem: set.error };
    }
    return { id: conversation };
  }

  async function onSend(text: string, attachments: string[]): Promise<string | null> {
    onError(null);
    const found = await conversationFor();
    if ("problem" in found) return `This was not sent — ${found.problem}`;

    if (!stashHandover(found.id, { text, attachments })) {
      return "This browser would not hold the message while the conversation opened, so nothing was sent. Copy what you typed and open the conversation yourself.";
    }
    router.push(`/chat?c=${encodeURIComponent(found.id)}&ask=1`);
    return null;
  }

  return (
    <ChatComposer
      onSend={onSend}
      onStop={() => {}}
      streaming={false}
      error={error}
      onDismissError={() => onError(null)}
      onError={onError}
      placeholder={`Ask about ${path.split("/").pop() ?? path}`}
    />
  );
}
