// Owns: the Chat tab (PROJECT.md §10.2, §16). A route-level server file, so it reads the store
// directly under §3's read exemption; everything it changes, it changes through an API route.
//
// `?c=<id>` is the whole of its navigation state. Opening a conversation is a link, which means the
// browser's Back button works, a conversation is shareable as a URL, and the client never has to
// keep a list in sync with a selection — the server re-reads both on every navigation.
//
// The floating `+` button is deliberately absent (§9.1, §15): this page has a docked composer, and
// the enforcement is simply that nothing here mounts `ComposerButton`.
//
// Failure behavior: a `?c=` naming a conversation that is not there falls back to the empty state
// rather than erroring — a stale link is a navigation mistake, not a broken page. An unreadable
// message costs that message and the rest of the conversation still opens (§5).

import { listConversations, readConversation } from "@/lib/store/chats";
import { readSettings } from "@/lib/store/settings";
import { addDays, todayIn } from "@/lib/schedule/dates";
import { isScripted } from "@/lib/agent/scripted";
import ChatsPanel from "@/components/chat/ChatsPanel";
import ChatView from "@/components/chat/ChatView";
import Rail from "@/components/chat/Rail";
import type { ConversationState } from "@/components/chat/useConversation";
import styles from "@/components/chat/Chat.module.css";

export const dynamic = "force-dynamic";

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Search) {
  const asked = (await searchParams).c;
  const settings = await readSettings();
  const today = todayIn(settings.timezone);
  const conversations = await listConversations();

  let open: ConversationState | null = null;
  if (typeof asked === "string") {
    try {
      open = await readConversation(asked);
    } catch {
      open = null; // a link to a conversation that has been deleted lands on the empty state
    }
  }

  return (
    <div className={styles.layout}>
      <Rail>
        <ChatsPanel
          conversations={conversations}
          openId={open?.conversation.id ?? null}
          today={today}
          yesterday={addDays(today, -1)}
          weekStart={addDays(today, -7)}
        />
      </Rail>

      <main className={styles.main}>
        {open === null ? (
          <div className={styles.blank}>
            <h1 className={styles.blankTitle}>Chat</h1>
            <p className={styles.empty}>
              {conversations.length === 0
                ? "Nothing here yet. Press New to start a conversation."
                : "Pick a conversation on the left, or press New."}
            </p>
          </div>
        ) : (
          <ChatView key={open.conversation.id} initial={open} scripted={isScripted()} />
        )}
      </main>
    </div>
  );
}
