// Owns: turning a list of drafts into one `task.create` batch, with the summary and the `meta` that
// PROJECT.md §9.5 step 5 specifies. Not a route — Next only treats `route.ts` as one — because two
// of them need it: `POST /api/tasks`, which the composer's Add all button calls, and
// `POST /api/agent/apply`, which applies the same proposal when it arrives as a `Proposal` instead.
//
// It exists as one function rather than two copies because the summary is a written-down rule
// ("add N tasks from prompt") and the `meta.prompt` it carries is what makes a batch traceable back
// to the words that produced it. Two copies would agree today and disagree the first time either
// one is edited.
//
// Failure behavior: none of its own. Everything it can fail at belongs to `runBatch`, including the
// §11.5 refusal of a prompt that carries something credential-shaped — which is a live case here,
// because the prompt is written into `meta` and `meta` is scanned before anything is logged.

import { runBatch } from "@/lib/history/batch";
import { createTask } from "@/lib/history/actions";
import type { BatchResult } from "@/lib/history/batch";
import type { TaskDraft } from "@/lib/history/actions";

export interface CreateTasksInput {
  items: TaskDraft[];
  /** §4.1's `source` field: `prompt`, `chat:<id>`, `collection:<path>`, or `manual`. */
  source: string;
  actor: "user" | "agent";
  /** What the user typed, when these drafts came from a composer send. */
  prompt?: string;
}

/** §9.5 step 5: `add N tasks from prompt`, or the single task's title when there is only one. */
export function summarize(items: TaskDraft[], prompt: string | undefined): string {
  const from = prompt === undefined ? "" : " from prompt";
  if (items.length === 1 && prompt === undefined) return `add '${items[0].title}'`;
  return `add ${items.length} task${items.length === 1 ? "" : "s"}${from}`;
}

export async function createTasks(input: CreateTasksInput): Promise<BatchResult> {
  const { items, source, actor, prompt } = input;
  return runBatch({
    actor,
    scope: "user",
    summary: summarize(items, prompt),
    commitPrefix: "task",
    meta: { source, ...(prompt === undefined ? {} : { prompt }) },
    actions: items.map((item) => createTask({ ...item, source, createdBy: actor })),
  });
}
