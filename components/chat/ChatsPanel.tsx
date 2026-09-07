// Owns: rail panel 1 of PROJECT.md §10.2 — the conversation list, grouped, searchable, with the
// context menu that renames, pins and deletes. The other three panels (Knowledge, Files, Graph) are
// Phase 8's; this one is built now because a conversation cannot be opened without it.
//
// Grouping is by the day a conversation was last touched, against a `today` handed down from the
// server. Doing the arithmetic on the server's clock rather than the browser's keeps the headings
// honest for someone whose machine is in a different timezone from their settings (§4.9).
//
// **Distill to knowledge is present and disabled**, naming Phase 7. §10.2 lists it in this menu and
// it writes a session summary, which needs `lib/store/knowledge.ts`; a menu that quietly omits it
// would leave the next phase to rediscover that it belongs here.
//
// Failure behavior: every action goes through an API route and reports through §13.5's rule — a
// rename is an edit with an on-screen origin, so a refusal lands in the field; pin and delete come
// from a menu with no origin of their own, so they toast. Nothing is patched locally: after a write
// the page re-reads, so the list is what is on disk.

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { reportFailure, send as post } from "@/components/tasks/writes";
import type { ConversationMeta } from "@/lib/chat/types";
import styles from "./Chat.module.css";

export interface ChatsPanelProps {
  conversations: ConversationMeta[];
  openId: string | null;
  /** Today in the settings timezone, from the server. */
  today: string;
  yesterday: string;
  weekStart: string;
}

type Group = "Pinned" | "Today" | "Yesterday" | "This week" | "Older";

const ORDER: Group[] = ["Pinned", "Today", "Yesterday", "This week", "Older"];

function groupFor(conversation: ConversationMeta, props: ChatsPanelProps): Group {
  if (conversation.pinned) return "Pinned";
  const day = conversation.updatedAt.slice(0, 10);
  if (day >= props.today) return "Today";
  if (day === props.yesterday) return "Yesterday";
  if (day >= props.weekStart) return "This week";
  return "Older";
}

export default function ChatsPanel(props: ChatsPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string; error: string | null } | null>(null);

  const matching = props.conversations.filter((conversation) =>
    (conversation.title || conversation.id).toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function act(id: string, what: string, body: Record<string, unknown>): Promise<void> {
    const answer = await post(`/api/chats/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    if (answer.error !== null) reportFailure(what, answer.error);
    else router.refresh();
    setMenuFor(null);
  }

  async function remove(id: string, title: string): Promise<void> {
    setMenuFor(null);
    if (!window.confirm(`Delete '${title}'? Everything in it goes too. This is undoable from History.`)) {
      return;
    }
    const answer = await post(`/api/chats/${id}`, { method: "DELETE" });
    if (answer.error !== null) {
      reportFailure("The conversation was not deleted", answer.error);
      return;
    }
    if (props.openId === id) router.push("/chat");
    else router.refresh();
  }

  async function saveName(id: string): Promise<void> {
    if (renaming === null) return;
    const title = renaming.value.trim();
    if (title.length === 0) return;
    const answer = await post(`/api/chats/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });
    // A rename has its own field on screen, so its refusal stays there (§13.5, Decision 50).
    if (answer.error !== null) setRenaming({ ...renaming, error: answer.error });
    else {
      setRenaming(null);
      router.refresh();
    }
  }

  async function create(): Promise<void> {
    const answer = await post("/api/chats", { method: "POST", body: JSON.stringify({}) });
    if (answer.error !== null) {
      reportFailure("The conversation was not started", answer.error);
      return;
    }
    router.push(`/chat?c=${answer.data.id as string}`);
  }

  return (
    <div className={styles.panel} data-ui="chats-panel">
      <div className={styles.panelHead}>
        <input
          className={styles.search}
          type="search"
          placeholder="Search conversations"
          value={query}
          data-ui="chat-search"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className={styles.newButton} onClick={() => void create()} data-ui="new-chat">
          New
        </button>
      </div>

      <nav className={styles.panelList}>
        {matching.length === 0 ? (
          <p className={styles.empty}>
            {props.conversations.length === 0 ? "No conversations yet." : "Nothing matches."}
          </p>
        ) : null}

        {ORDER.map((group) => {
          const rows = matching.filter((conversation) => groupFor(conversation, props) === group);
          if (rows.length === 0) return null;
          return (
            <section key={group}>
              <h2 className={styles.groupHeading}>{group}</h2>
              {rows.map((conversation) => {
                const title = conversation.title || "New conversation";
                const open = conversation.id === props.openId;
                return (
                  <div
                    key={conversation.id}
                    className={`${styles.chatRow} ${open ? styles.chatRowOpen : ""}`}
                    data-conversation={conversation.id}
                  >
                    {renaming?.id === conversation.id ? (
                      <span className={styles.renameBox}>
                        <input
                          className={styles.renameInput}
                          value={renaming.value}
                          autoFocus
                          data-ui="rename-input"
                          onChange={(event) => setRenaming({ ...renaming, value: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void saveName(conversation.id);
                            if (event.key === "Escape") setRenaming(null);
                          }}
                        />
                        {renaming.error === null ? null : (
                          <span className={styles.inlineError} data-ui="error">
                            {renaming.error}
                          </span>
                        )}
                      </span>
                    ) : (
                      <Link href={`/chat?c=${conversation.id}`} className={styles.chatLink}>
                        {conversation.pinned ? <span aria-label="pinned">★ </span> : null}
                        {title}
                      </Link>
                    )}

                    <button
                      type="button"
                      className={styles.rowMenuButton}
                      aria-label={`Actions for ${title}`}
                      onClick={() => setMenuFor(menuFor === conversation.id ? null : conversation.id)}
                    >
                      ⋯
                    </button>

                    {menuFor === conversation.id ? (
                      <div className={styles.rowMenu} data-ui="chat-menu">
                        <button
                          type="button"
                          onClick={() => {
                            setRenaming({ id: conversation.id, value: title, error: null });
                            setMenuFor(null);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void act(conversation.id, "The conversation was not pinned", {
                              pinned: !conversation.pinned,
                            })
                          }
                        >
                          {conversation.pinned ? "Unpin" : "Pin"}
                        </button>
                        <button type="button" onClick={() => void remove(conversation.id, title)}>
                          Delete
                        </button>
                        <button type="button" disabled title="Distilling to knowledge arrives in Phase 7.">
                          Distill to knowledge
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>
          );
        })}
      </nav>
    </div>
  );
}
