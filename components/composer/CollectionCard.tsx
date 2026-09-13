// Owns: one proposed collection append (PROJECT.md §9.5 step 6) — the target, the items, and the
// buttons. Shared by the preview panel, where Tasks mode's extraction lands one, and the proposal
// tray, where a turn's `propose_collection_append` does, so the two cannot drift into saying
// different things about the same write.
//
// Failure behavior: none of its own. `error` is the refused Add's message, shown on the card with the
// items still there (§13.5).

"use client";

import styles from "./Composer.module.css";

export interface CollectionCardProps {
  collection: string;
  items: string[];
  note?: string;
  busy: boolean;
  error: string | null;
  onAdd: () => void;
  onDiscard: () => void;
}

export default function CollectionCard({ collection, items, note, busy, error, onAdd, onDiscard }: CollectionCardProps) {
  return (
    <div className={styles.collectionProposal} data-preview="collection" data-proposal="collection">
      <div className={styles.collection}>
        <span className={styles.collectionName}>
          {collection.startsWith("new:") ? `New collection: ${collection.slice(4)}` : collection}
        </span>
        <ul className={styles.items}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      {note === undefined ? null : <p className={styles.note}>{note}</p>}
      {error === null ? null : (
        <p className={styles.error} role="alert" data-ui="proposal-error">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <span className={styles.count}>
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
        <button type="button" className={styles.primary} onClick={onAdd} disabled={busy || items.length === 0} data-action="add">
          {busy ? "Adding…" : "Add"}
        </button>
        <button type="button" className={styles.secondary} onClick={onDiscard} disabled={busy}>
          Discard
        </button>
      </div>
    </div>
  );
}
