// Owns: §4.5's "Make this a task", as the row list under a collection's preview (AGENTS.md
// amendment `s`, and the Phase 8 approval's open call 8).
//
// **A row list rather than a button inside the rendered body.** The body is sanitized HTML, and
// putting a control into it would mean either injecting markup after sanitizing — which is the one
// thing the pipeline exists to prevent — or teaching the renderer about tasks. The items are read
// from the same text the body was rendered from, by `lib/knowledge/items.ts`, which is the parser
// the promote builder and `kb:check` already use, so a row here and the item the server acts on are
// the same item by construction.
//
// An item that has been promoted says so and offers nothing: the link is in the file, and a second
// task for one item is the broken backlink Decision 47's review refused.
//
// **The rows are the draft's items while there is a draft**, because they are read from the body the
// page is showing — and every button is inert while that draft is unsaved, for the reason a checkbox
// is: a promote appends to the item's own line, so it would land on bytes the draft no longer
// matches and turn the next Save into a conflict nobody caused (§10.2).
//
// Failure behavior: promote is fired from a row with no text of its own to keep, so a refusal names
// the item in a toast (§13.5) and nothing on screen changes until the document has been re-read.

"use client";

import { useState } from "react";
import { reportFailure, send } from "@/components/tasks/writes";
import { itemsOf } from "@/lib/knowledge/items";
import styles from "./Browser.module.css";

export interface CollectionItemsProps {
  /** The collection's path, whose file name is the slug the promote route takes. */
  path: string;
  body: string;
  /** Why the buttons are inert, or null: an unsaved draft of this very file (§10.2). */
  blocked: string | null;
  /** Re-read the document: a promote appends ` → [[t_…]]` to the item's own line. */
  onChanged: () => void;
}

export default function CollectionItems({ path, body, blocked, onChanged }: CollectionItemsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const items = itemsOf(body);
  if (items.length === 0) return null;

  const slug = (path.split("/").pop() ?? path).replace(/\.md$/, "");

  async function promote(item: string, title: string): Promise<void> {
    setBusy(item);
    const answer = await send(`/api/collections/${encodeURIComponent(slug)}/promote`, {
      method: "POST",
      body: JSON.stringify({ item }),
    });
    setBusy(null);
    if (answer.error !== null) reportFailure(`'${title}' did not become a task`, answer.error);
    else onChanged();
  }

  return (
    <section className={styles.items} data-ui="collection-items" aria-label="Items">
      <h2 className={styles.itemsTitle}>Items</h2>
      {blocked === null ? null : (
        <p className={styles.panelNote} role="note" data-ui="items-blocked">
          An item cannot become a task while {blocked}: save or discard first.
        </p>
      )}
      <ul className={styles.itemList}>
        {items.map((item) => (
          <li key={item.slug} data-item={item.slug}>
            <span className={styles.itemText}>{item.text}</span>
            {item.taskId === null ? (
              <button
                type="button"
                className={styles.stripButton}
                data-ui="make-task"
                disabled={busy !== null || blocked !== null}
                title={blocked === null ? undefined : `Not while ${blocked}.`}
                onClick={() => void promote(item.slug, item.title)}
              >
                Make this a task
              </button>
            ) : (
              <span className={styles.itemDone} data-ui="already-a-task">
                already a task
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
