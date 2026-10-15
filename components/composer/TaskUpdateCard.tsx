"use client";

import type { TaskUpdateProposal } from "@/lib/agent/task-updates";
import { PRIORITY_LABEL } from "@/components/tasks/format";
import styles from "./Composer.module.css";

const labels: Record<string, string> = { priority: "Priority", estimateMin: "Estimate (minutes)", due: "Due", scheduled: "Scheduled", repeatUntil: "Repeat until" };
function display(field: string, value: unknown): string {
  if (field === "priority" && typeof value === "number") return PRIORITY_LABEL[value];
  if (value === null) return "None";
  if (Array.isArray(value)) return value.join(", ") || "None";
  return String(value);
}

export default function TaskUpdateCard({ proposal, busy, error, onAdd, onDiscard }: {
  proposal: TaskUpdateProposal; busy: boolean; error: string | null; onAdd: () => void; onDiscard: () => void;
}) {
  return (
    <li className={styles.trayItem} data-proposal="task_update">
      <div className={styles.collection}>
        <span className={styles.collectionName}>{proposal.title}</span>
        <ul className={styles.items}>
          {proposal.changes.map(({ field, before, value }) => (
            <li key={field}>{labels[field] ?? field}: {display(field, before)} → {display(field, value)}</li>
          ))}
        </ul>
      </div>
      {error === null ? null : <p className={styles.error} role="alert" data-ui="proposal-error">{error}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onAdd} disabled={busy} data-action="apply">{busy ? "Applying…" : "Apply"}</button>
        <button type="button" className={styles.secondary} onClick={onDiscard} disabled={busy}>Discard</button>
      </div>
    </li>
  );
}
