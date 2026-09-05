// Owns: the inline edit form on a task row (PROJECT.md §10.1). It sends only the fields that
// actually changed, so `task.update` snapshots exactly those keys and an undo restores exactly
// them — a form that PATCHed all eleven fields would make every edit look like a rewrite.
//
// Failure behavior is the point of this file. A refused save — including the `secret_rejected`
// refusal of §11.5 — leaves every field exactly as it was typed and puts the server's message above
// the buttons, inline rather than in a toast: §13.5 shows an error on the surface that raised it,
// and this is that surface. The message names the file and the pattern and never the matched text;
// nothing here reformats it, so nothing here can leak what the scanner refused to print.

"use client";

import { useState } from "react";
import type { Task } from "@/lib/store/tasks";
import { datePart } from "@/lib/schedule/dates";
import { PRIORITY_LABEL } from "./format";
import styles from "./TaskList.module.css";

export interface TaskEditFormProps {
  task: Task;
  busy: boolean;
  onCancel: () => void;
  onSave: (changes: Record<string, unknown>) => Promise<string | null>;
}

const timePart = (value: string | null): string => {
  const match = value ? /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(value) : null;
  return match ? match[1] : "";
};

export default function TaskEditForm({ task, busy, onCancel, onSave }: TaskEditFormProps) {
  const [title, setTitle] = useState(task.title);
  const [context, setContext] = useState(task.context ?? "");
  const [priority, setPriority] = useState(String(task.priority));
  const [estimate, setEstimate] = useState(task.estimateMin === null ? "" : String(task.estimateMin));
  const [due, setDue] = useState(task.due ? datePart(task.due) : "");
  const [day, setDay] = useState(task.scheduled ? datePart(task.scheduled) : "");
  const [time, setTime] = useState(timePart(task.scheduled));
  const [notes, setNotes] = useState(task.body);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const scheduled = day ? (time ? `${day}T${time}` : day) : null;
    const next: Record<string, unknown> = {
      title: title.trim(),
      context: context.trim() || null,
      priority: Number(priority),
      estimateMin: estimate.trim() === "" ? null : Number(estimate),
      due: due || null,
      scheduled,
      body: notes,
    };

    const current: Record<string, unknown> = {
      title: task.title,
      context: task.context,
      priority: task.priority,
      estimateMin: task.estimateMin,
      due: task.due,
      scheduled: task.scheduled,
      body: task.body,
    };

    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(next)) {
      if (JSON.stringify(value) !== JSON.stringify(current[key])) changes[key] = value;
    }

    if (Object.keys(changes).length === 0) {
      onCancel();
      return;
    }
    if (typeof changes.title === "string" && changes.title === "") {
      setError("A task needs a title.");
      return;
    }

    // Nothing is cleared before this resolves: if it comes back an error, every field below still
    // holds what was typed into it.
    const failure = await onSave(changes);
    if (failure) setError(failure);
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <input
        className={styles.formTitle}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label="Title"
        autoFocus
      />

      <div className={styles.formGrid}>
        <label>
          <span>Due</span>
          <input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
        </label>
        <label>
          <span>Scheduled</span>
          <input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
        </label>
        <label>
          <span>At</span>
          <input
            type="time"
            value={time}
            disabled={day === ""}
            onChange={(event) => setTime(event.target.value)}
          />
        </label>
        <label>
          <span>Priority</span>
          <select value={priority} onChange={(event) => setPriority(event.target.value)}>
            {[1, 2, 3, 4].map((level) => (
              <option key={level} value={level}>
                {PRIORITY_LABEL[level]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Estimate (min)</span>
          <input
            type="number"
            min="0"
            step="5"
            value={estimate}
            onChange={(event) => setEstimate(event.target.value)}
          />
        </label>
        <label>
          <span>Context</span>
          <input value={context} onChange={(event) => setContext(event.target.value)} />
        </label>
      </div>

      <textarea
        className={styles.formNotes}
        value={notes}
        rows={4}
        onChange={(event) => setNotes(event.target.value)}
        aria-label="Notes"
        placeholder="Notes, and `- [ ]` subtasks"
      />

      {error ? (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.formButtons}>
        <button type="submit" className={styles.primary} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
