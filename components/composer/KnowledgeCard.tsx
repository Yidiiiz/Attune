// Owns: one proposed knowledge write, as the user decides on it (PROJECT.md §6.3, §9.5): what it
// does, to which file, why, and — for a new note — which map will link to it. The content is
// editable; nothing else is, because the path, the operation and the map are what the model was
// asked to decide and what `runBatch`'s rules are checked against.
//
// **A rewritten write shows as what it became** (Phase 7 condition). When `filterWrites` turned a new
// note into an append to an existing one, the card says "Add to" and names the existing note, with
// the rewrite's reason under it — so the operation approved here is the operation applied.
//
// Failure behavior: none of its own. A refused Add comes back as `error` and is shown on this card,
// above the untouched content, next to the button that would try again (§13.5, Decision 50).

"use client";

import type { ProposedWrite } from "@/lib/agent/memory";
import styles from "./Composer.module.css";

export interface KnowledgeCardProps {
  write: ProposedWrite;
  busy: boolean;
  error: string | null;
  onChange: (content: string) => void;
  onAdd: () => void;
  onDiscard: () => void;
}

const VERB: Record<ProposedWrite["op"], string> = {
  create: "New note",
  append: "Add to",
  replace: "Rewrite",
};

export default function KnowledgeCard({ write, busy, error, onChange, onAdd, onDiscard }: KnowledgeCardProps) {
  return (
    <li className={styles.card} data-proposal="knowledge" data-op={write.op} data-path={write.path}>
      <div className={styles.knowledgeHead}>
        <span className={styles.op}>{VERB[write.op]}</span>
        <code className={styles.path}>{write.path}</code>
      </div>

      {write.reason.trim().length === 0 ? null : <p className={styles.note}>{write.reason}</p>}
      {write.rewritten === undefined ? null : (
        <p className={styles.note} data-ui="rewritten">
          Proposed as a new note at {write.rewritten.path}; {write.rewritten.why}.
        </p>
      )}
      {write.op === "create" && write.path.startsWith("knowledge/notes/") ? (
        <p className={styles.note}>
          {write.mapLink === null ? "No map will link to this note." : `Linked from ${write.mapLink}.`}
        </p>
      ) : null}

      {error === null ? null : (
        <p className={styles.error} role="alert" data-ui="proposal-error">
          {error}
        </p>
      )}

      <textarea
        className={styles.body}
        rows={Math.min(10, Math.max(2, write.content.split("\n").length))}
        value={write.content}
        disabled={busy}
        aria-label={`Content for ${write.path}`}
        onChange={(event) => onChange(event.target.value)}
      />

      <div className={styles.actions}>
        <span className={styles.count} />
        <button type="button" className={styles.primary} onClick={onAdd} disabled={busy} data-action="add">
          {busy ? "Adding…" : "Add"}
        </button>
        <button type="button" className={styles.secondary} onClick={onDiscard} disabled={busy}>
          Discard
        </button>
      </div>
    </li>
  );
}
