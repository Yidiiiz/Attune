// Owns: a proposal tray on screen (PROJECT.md §9.5, §9.6) — every card a turn left behind, each with
// its own Add. It renders `useProposals`' state and nothing else, so the chat tab's tray above the
// composer and the sheet's in Ask mode are the same component over the same hook.
//
// This is what closes §9.6's gap: Ask mode collected task proposals and never drew them. Task drafts
// render with the preview panel's `TaskCard`, collections with the preview panel's `CollectionCard`.
//
// Failure behavior: none of its own. Each card shows its own refusal; `tray.error` is for a failure
// that belongs to no card, such as a distill that did not come back, and sits at the top.

"use client";

import CollectionCard from "./CollectionCard";
import KnowledgeCard from "./KnowledgeCard";
import TaskCard from "./TaskCard";
import type { Tray, TrayItem } from "./useProposals";
import styles from "./Composer.module.css";

export interface ProposalPanelProps {
  tray: Tray;
  categories: string[];
  /** Something in progress that will land here — "Summarizing this conversation…". */
  status?: string | null;
}

export default function ProposalPanel({ tray, categories, status = null }: ProposalPanelProps) {
  if (tray.items.length === 0 && tray.error === null && status === null) return null;

  const card = (item: TrayItem) => {
    const common = { busy: item.busy, error: item.error, onAdd: () => void tray.add(item.key), onDiscard: () => tray.discard(item.key) };

    if (item.kind === "knowledge") {
      return (
        <KnowledgeCard
          key={item.key}
          write={item.write}
          {...common}
          onChange={(content) => tray.update(item.key, { ...item, write: { ...item.write, content } })}
        />
      );
    }

    if (item.kind === "collection") {
      return (
        <li key={item.key} className={styles.trayItem}>
          <CollectionCard collection={item.collection} items={item.items} {...common} />
        </li>
      );
    }

    const count = item.selected.filter(Boolean).length;
    return (
      <li key={item.key} className={styles.trayItem} data-proposal="tasks">
        <ul className={styles.cards} data-preview="tasks">
          {item.drafts.map((draft, index) => (
            <TaskCard
              key={index}
              draft={draft}
              index={index}
              selected={item.selected[index] ?? true}
              categories={categories}
              disabled={item.busy}
              onSelect={(next) =>
                tray.update(item.key, { ...item, selected: item.selected.map((one, at) => (at === index ? next : one)) })
              }
              onChange={(next) =>
                tray.update(item.key, { ...item, drafts: item.drafts.map((one, at) => (at === index ? next : one)) })
              }
            />
          ))}
        </ul>
        {item.error === null ? null : (
          <p className={styles.error} role="alert" data-ui="proposal-error">
            {item.error}
          </p>
        )}
        <div className={styles.actions}>
          <span className={styles.count}>
            {count} of {item.drafts.length} selected
          </span>
          <button type="button" className={styles.primary} onClick={common.onAdd} disabled={item.busy || count === 0} data-action="add">
            {count === item.drafts.length ? "Add all" : "Add selected"}
          </button>
          <button type="button" className={styles.secondary} onClick={common.onDiscard} disabled={item.busy}>
            Discard
          </button>
        </div>
      </li>
    );
  };

  return (
    <section className={styles.tray} data-ui="proposals" aria-label="Proposals">
      {status === null ? null : <p className={styles.note} data-ui="proposals-status">{status}</p>}
      {tray.error === null ? null : (
        <p className={styles.error} role="alert" data-ui="proposals-error">
          {tray.error}
          <button type="button" className={styles.linkButton} onClick={() => tray.setError(null)}>
            Dismiss
          </button>
        </p>
      )}
      <ul className={styles.cards}>{tray.items.map(card)}</ul>
    </section>
  );
}
