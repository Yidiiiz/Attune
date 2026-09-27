// Owns: the Chat tab (PROJECT.md §10.2, §16). A route-level server file, so it reads the store
// directly under §3's read exemption; everything it changes, it changes through an API route.
//
// `?c=<id>` is the conversation, plus a one-shot `&distill=1` from the Chats menu that `ChatView`
// consumes and removes (Decision 18). `?open=<path>` is a document (`&repo=1` for "Whole repo"), shown
// in place of the conversation — the main pane holds one or the other, never both — with `c` kept so
// "← Back to chat" returns to it. Opening either is a link, which means the browser's Back button
// works, each is shareable as a URL, and the client never has to keep a list in sync with a
// selection — the server re-reads both on every navigation.
//
// **A document is handed to its view as a path and nothing else.** The view reads the file itself,
// through its own ordered `reload()`, and is keyed by the path so another file is a remount; a server
// render of a document adopted as client state is Decision 69's bug, and not built here to begin with.
//
// The floating `+` button is deliberately absent (§9.1, §15): this page has a docked composer, and
// the enforcement is simply that nothing here mounts `ComposerButton`.
//
// Failure behavior: a `?c=` naming a conversation that is not there falls back to the empty state
// rather than erroring — a stale link is a navigation mistake, not a broken page. An unreadable
// message costs that message and the rest of the conversation still opens (§5).

import { listConversations, readConversation } from "@/lib/store/chats";
import { autoAppliedIn } from "@/lib/history/auto-applied";
import { readSettings } from "@/lib/store/settings";
import { addDays, todayIn } from "@/lib/schedule/dates";
import { isScripted } from "@/lib/agent/scripted";
import { MODELS } from "@/lib/agent/registry";
import ChatsPanel from "@/components/chat/ChatsPanel";
import ChatView from "@/components/chat/ChatView";
import Rail from "@/components/chat/Rail";
import DocumentView from "@/components/browser/DocumentView";
import { FilesPanel, KnowledgePanel } from "@/components/browser/Panels";
import type { ConversationState } from "@/components/chat/useConversation";
import styles from "@/components/chat/Chat.module.css";

export const dynamic = "force-dynamic";

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Search) {
  const query = await searchParams;
  const asked = query.c;
  const opened = typeof query.open === "string" && query.open.length > 0 ? query.open : null;
  const where = query.repo === "1" ? "repo" : "data";
  const settings = await readSettings();
  const today = todayIn(settings.timezone);
  const conversations = await listConversations();

  let open: ConversationState | null = null;
  if (typeof asked === "string" && opened === null) {
    try {
      open = { ...(await readConversation(asked)), applied: await autoAppliedIn(asked) };
    } catch {
      open = null; // a link to a conversation that has been deleted lands on the empty state
    }
  }

  return (
    <div className={styles.layout}>
      <Rail
        panels={{
          chats: (
            <ChatsPanel
              conversations={conversations}
              openId={open?.conversation.id ?? (typeof asked === "string" ? asked : null)}
              today={today}
              yesterday={addDays(today, -1)}
              weekStart={addDays(today, -7)}
            />
          ),
          knowledge: <KnowledgePanel />,
          files: <FilesPanel />,
        }}
      />

      <main className={styles.main}>
        {opened !== null ? (
          <DocumentView
            key={`${where}:${opened}`}
            path={opened}
            where={where}
            conversation={typeof asked === "string" ? asked : null}
          />
        ) : open === null ? (
          <div className={styles.blank}>
            <h1 className={styles.blankTitle}>Chat</h1>
            <p className={styles.empty}>
              {conversations.length === 0
                ? "Nothing here yet. Press New to start a conversation."
                : "Pick a conversation on the left, or press New."}
            </p>
          </div>
        ) : (
          <ChatView
            key={open.conversation.id}
            initial={open}
            models={MODELS.map((entry) => ({ id: entry.id, label: entry.label }))}
            scripted={isScripted()}
            categories={settings.categories}
            distill={query.distill === "1"}
            ask={query.ask === "1"}
          />
        )}
      </main>
    </div>
  );
}
