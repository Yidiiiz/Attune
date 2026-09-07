// Owns: one proposed task, with every field editable in place (PROJECT.md §9.5 step 3). It edits a
// *draft* — something with no id that is not on disk yet — which is why it is not `TaskEditForm`
// from `components/today/`: that one saves an existing task through an API route, and half of it
// would be dead here. Nothing in this file imports from `components/today/`, so AGENTS.md amendment
// `m` still has only two importers and is not triggered.
//
// Inferred fields carry the dotted underline and the tooltip §9.5 asks for. `inferred` names which
// fields the model filled in from context rather than from the prompt, and marking them is the
// whole reason the model is asked to report them: an invented due date and a stated one look
// identical once they are in a box.
//
// Failure behavior: none of its own — it holds no state and writes nothing. Every edit is reported
// upward and the panel owns the list, so a card cannot disagree with what Add would send.

"use client";

import type { ModelTaskDraft } from "@/lib/agent/tools";
import styles from "./Composer.module.css";

export interface TaskCardProps {
  draft: ModelTaskDraft;
  index: number;
  selected: boolean;
  categories: string[];
  disabled: boolean;
  onSelect: (selected: boolean) => void;
  onChange: (next: ModelTaskDraft) => void;
}

const PRIORITIES: Array<{ value: number; label: string }> = [
  { value: 1, label: "1 critical" },
  { value: 2, label: "2 high" },
  { value: 3, label: "3 normal" },
  { value: 4, label: "4 someday" },
];

/** A date input wants "" for empty and the draft wants null; nothing else differs. */
const toDate = (value: string): string | null => (value === "" ? null : value);

export default function TaskCard({
  draft,
  index,
  selected,
  categories,
  disabled,
  onSelect,
  onChange,
}: TaskCardProps) {
  const set = (patch: Partial<ModelTaskDraft>): void => onChange({ ...draft, ...patch });

  /** §9.5: the underline and the tooltip say the value came from context, not from the prompt. */
  const inferred = (field: string): { className: string; title?: string } =>
    draft.inferred.includes(field)
      ? { className: `${styles.field} ${styles.inferred}`, title: `Inferred from: ${field}` }
      : { className: styles.field };

  return (
    <li className={styles.card} data-draft={String(index)}>
      <div className={styles.cardTop}>
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          aria-label={`Add '${draft.title}'`}
          onChange={(event) => onSelect(event.target.checked)}
        />
        <input
          className={styles.title}
          value={draft.title}
          disabled={disabled}
          aria-label="Title"
          onChange={(event) => set({ title: event.target.value })}
        />
      </div>

      <div className={styles.fields}>
        <label {...inferred("priority")}>
          <span className={styles.label}>Priority</span>
          <select
            value={draft.priority ?? 3}
            disabled={disabled}
            onChange={(event) => set({ priority: Number(event.target.value) })}
          >
            {PRIORITIES.map((priority) => (
              <option key={priority.value} value={priority.value}>
                {priority.label}
              </option>
            ))}
          </select>
        </label>

        <label {...inferred("estimateMin")}>
          <span className={styles.label}>Estimate (min)</span>
          <input
            type="number"
            min={0}
            step={5}
            value={draft.estimateMin ?? ""}
            disabled={disabled}
            onChange={(event) =>
              set({ estimateMin: event.target.value === "" ? null : Number(event.target.value) })
            }
          />
        </label>

        <label {...inferred("due")}>
          <span className={styles.label}>Due</span>
          <input
            type="date"
            value={draft.due ?? ""}
            disabled={disabled}
            onChange={(event) => set({ due: toDate(event.target.value) })}
          />
        </label>

        <label {...inferred("scheduled")}>
          <span className={styles.label}>Scheduled</span>
          <input
            type="date"
            value={draft.scheduled ?? ""}
            disabled={disabled}
            onChange={(event) => set({ scheduled: toDate(event.target.value) })}
          />
        </label>

        <label {...inferred("category")}>
          <span className={styles.label}>Category</span>
          <select
            value={draft.category ?? ""}
            disabled={disabled}
            onChange={(event) => set({ category: event.target.value === "" ? null : event.target.value })}
          >
            <option value="">none</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
            {/* A category the model proposed that is not in settings yet still shows as chosen. */}
            {draft.category !== null && !categories.includes(draft.category) ? (
              <option value={draft.category}>{draft.category}</option>
            ) : null}
          </select>
        </label>

        <label {...inferred("context")}>
          <span className={styles.label}>Context</span>
          <input
            value={draft.context ?? ""}
            disabled={disabled}
            onChange={(event) => set({ context: event.target.value === "" ? null : event.target.value })}
          />
        </label>

        <label {...inferred("tags")}>
          <span className={styles.label}>Tags</span>
          <input
            value={draft.tags.join(", ")}
            disabled={disabled}
            placeholder="comma separated"
            onChange={(event) =>
              set({
                tags: event.target.value
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter((tag) => tag.length > 0),
              })
            }
          />
        </label>
      </div>

      <textarea
        className={styles.body}
        rows={2}
        value={draft.body ?? ""}
        disabled={disabled}
        aria-label="Notes"
        placeholder="Notes"
        onChange={(event) => set({ body: event.target.value })}
      />
    </li>
  );
}
