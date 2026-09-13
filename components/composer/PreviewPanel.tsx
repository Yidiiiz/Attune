// Owns: what came back from a send, and the buttons that act on it (PROJECT.md §9.5 steps 2, 3, 5
// and 6). It renders one of the three answers §9.4 defines and nothing else; the sheet owns the
// textarea, the request, and the follow-up that revises what is shown here.
//
// The collection card is `CollectionCard`, shared with the proposal tray (`ProposalPanel`), so a
// collection proposal looks and adds the same whether an extraction or a chat turn produced it.
//
// Failure behavior: this component reports, it does not write. Add hands the selected drafts to the
// sheet, which owns the request and where its failure is shown — a refusal has to leave every card
// exactly as it was so the user can fix a title and press Add again (Decision 50).

"use client";

import type { ExtractResult } from "@/lib/agent/chat";
import type { ModelTaskDraft } from "@/lib/agent/tools";
import CollectionCard from "./CollectionCard";
import TaskCard from "./TaskCard";
import styles from "./Composer.module.css";

export interface PreviewPanelProps {
  result: ExtractResult;
  drafts: ModelTaskDraft[];
  selected: boolean[];
  categories: string[];
  /** True while a send or an add is in flight; cards stay editable, buttons do not. */
  busy: boolean;
  onChangeDraft: (index: number, next: ModelTaskDraft) => void;
  onSelect: (index: number, selected: boolean) => void;
  onAdd: () => void;
  onAddCollection: () => void;
  onDiscard: () => void;
}

export default function PreviewPanel({
  result,
  drafts,
  selected,
  categories,
  busy,
  onChangeDraft,
  onSelect,
  onAdd,
  onAddCollection,
  onDiscard,
}: PreviewPanelProps) {
  // §9.5 step 2: a question is shown as a message, and the textarea below becomes the answer box.
  if (result.kind === "question") {
    return (
      <div className={styles.preview}>
        <p className={styles.question} data-preview="question">
          {result.text}
        </p>
        <p className={styles.hint}>Answer below, or rephrase what you asked for.</p>
      </div>
    );
  }

  // §9.5 step 6: the target and the items. A refusal is the sheet's to show, like the tasks' Add.
  if (result.kind === "collection") {
    return (
      <div className={styles.preview}>
        <CollectionCard
          collection={result.collection}
          items={result.items}
          {...(result.note === undefined ? {} : { note: result.note })}
          busy={busy}
          error={null}
          onAdd={onAddCollection}
          onDiscard={onDiscard}
        />
      </div>
    );
  }

  const count = selected.filter(Boolean).length;

  return (
    <div className={styles.preview}>
      {result.note === undefined ? null : <p className={styles.note}>{result.note}</p>}

      <ul className={styles.cards} data-preview="tasks">
        {drafts.map((draft, index) => (
          <TaskCard
            key={index}
            draft={draft}
            index={index}
            selected={selected[index] ?? true}
            categories={categories}
            disabled={busy}
            onSelect={(next) => onSelect(index, next)}
            onChange={(next) => onChangeDraft(index, next)}
          />
        ))}
      </ul>

      <div className={styles.actions}>
        <span className={styles.count}>
          {count} of {drafts.length} selected
        </span>
        <button
          type="button"
          className={styles.primary}
          onClick={onAdd}
          disabled={busy || count === 0}
          data-action="add"
        >
          {count === drafts.length ? "Add all" : "Add selected"}
        </button>
        <button type="button" className={styles.secondary} onClick={onDiscard} disabled={busy}>
          Discard
        </button>
      </div>
    </div>
  );
}
