// Owns: the two decisions the composer makes that are not about pixels — how a revised preview is
// merged with what is on screen (PROJECT.md §9.5 step 4), and the keys its per-device state lives
// under. Split out of `ComposerSheet.tsx` because it is pure: §2 requires pure modules to have
// tests, and the merge rule is the one part of the panel that can be wrong in a way nobody notices.
//
// Failure behavior: none of its own. `mergeDraft` is total — any pair of lists produces a list —
// because the alternative is a follow-up that throws away work the user can see on screen.

import type { ModelTaskDraft } from "@/lib/agent/tools";

/** The typed prompt, so a sheet closed by accident does not lose it (§9.1). */
export const DRAFT_KEY = "composer.draft";

/** The last mode used, remembered per tab (§9.3). */
export const MODE_KEY = "composer.mode";

export type Mode = "tasks" | "ask" | "build";

export const isMode = (value: unknown): value is Mode =>
  value === "tasks" || value === "ask" || value === "build";

const FIELDS = [
  "title",
  "body",
  "status",
  "priority",
  "estimateMin",
  "due",
  "scheduled",
  "category",
  "context",
  "tags",
  "links",
  "repeat",
  "repeatUntil",
  "collection",
  "inferred",
] as const;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * §9.5 step 4: a follow-up returns a whole revised list, and the panel replaces its cards **in
 * place, preserving any inline edits the model did not touch**, matched by index.
 *
 * Three lists are needed to say that precisely, and the third is the one that is easy to forget.
 * `sent` is what the model was shown. `current` is what is on screen now, which can differ because
 * the cards stay editable while the request is in flight — only the textarea is disabled (§9.5
 * step 1). `revised` is the answer. So, field by field:
 *
 * - the model returned what it was given → it did not touch that field → keep `current`, which is
 *   either the same value or an edit made while waiting;
 * - the model returned something else → it acted on the follow-up → take `revised`.
 *
 * Comparing against `sent` rather than against `current` is the whole point. Against `current`, an
 * edit made during the flight would look like a change the model made and would be overwritten by
 * the value the user had just replaced.
 */
export function mergeDraft(
  sent: ModelTaskDraft[],
  current: ModelTaskDraft[],
  revised: ModelTaskDraft[],
): ModelTaskDraft[] {
  return revised.map((item, index) => {
    const before = sent[index];
    const onScreen = current[index];
    // A card the model added, or one the user never had: nothing to preserve.
    if (before === undefined || onScreen === undefined) return item;

    const merged: ModelTaskDraft = { ...item };
    for (const field of FIELDS) {
      if (same(item[field], before[field])) {
        (merged as Record<string, unknown>)[field] = onScreen[field];
      }
    }
    return merged;
  });
}

/**
 * Selection follows the cards through a revision (§9.5 step 5). A card that survives keeps its
 * checkbox; cards the revision added are selected, because the default is that everything proposed
 * is going to be added and unticking is the deliberate act.
 */
export function mergeSelection(selected: boolean[], count: number): boolean[] {
  return Array.from({ length: count }, (_, index) => selected[index] ?? true);
}
