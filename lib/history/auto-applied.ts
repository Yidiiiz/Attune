// Owns: the transcript's record of a knowledge write that applied itself (PROJECT.md §6.3, and the
// Phase 7 addition that the toast be the notification and not the record). The marker is read from
// the action log, never written into a message: a finalized message is not edited, and a second
// writer touching a reply file is exactly what the streaming ownership rule protects against.
//
// **Keyed to identity, not position.** An auto-applied batch carries `meta.autoApplied` naming its
// conversation, the assistant message whose turn produced it, the file and the line count. The
// marker is found by those and by the batch id — never by where the line sits in the log — so it
// still resolves after an undo, a redo, or any number of later writes to the same file.
//
// **Undo removes it without a compensating edit.** A batch whose latest undo/redo is an undo is not
// shown (`undoState`); a redo brings it back. Nothing is written to make either happen.
//
// Failure behavior: renders nothing rather than a broken marker, and never silently. A log that
// cannot be read, an unreadable line that names this conversation's auto-applied write, and an entry
// missing a field the marker needs each warn on the server's console, naming the conversation; the
// conversation itself still opens. A log that does not exist yet is an empty history, not a fault.

import { readText } from "../store/files.ts";
import { StoreError } from "../store/paths.ts";
import { groupBatches, LOG_PATH } from "./log.ts";
import type { ActionEntry } from "./log.ts";
import { undoState } from "./undo.ts";
import type { AutoApplied } from "../chat/types.ts";

export type { AutoApplied } from "../chat/types.ts";

/** What `runBatch` is handed as `meta.autoApplied`: everything the marker shows, fixed at write time. */
export interface AutoAppliedMeta {
  conversation: string;
  message: string;
  path: string;
  lines: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const warn = (conversationId: string, what: string): void =>
  console.warn(`history: ${what} in ${conversationId}; no auto-applied marker is shown for it`);

/** Every auto-applied write in a conversation that is currently in effect, oldest first. */
export async function autoAppliedIn(conversationId: string): Promise<AutoApplied[]> {
  let text: string;
  try {
    text = await readText(LOG_PATH);
  } catch (err) {
    if (err instanceof StoreError && err.code === "not_found") return [];
    warn(conversationId, `the action log could not be read (${(err as Error).message})`);
    return [];
  }

  const entries: ActionEntry[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      entries.push(JSON.parse(line) as ActionEntry);
    } catch {
      // `readActions` skips a torn line silently, which is right for the history list and wrong
      // here: if the line was this marker's, skipping it is the silent absence the marker exists
      // to prevent. A cheap test, and a false positive costs one log line.
      if (line.includes('"autoApplied"') && line.includes(conversationId)) {
        warn(conversationId, "an action-log line naming an auto-applied write does not parse");
      }
    }
  }

  const batches = groupBatches(entries);
  const markers: AutoApplied[] = [];
  for (const batch of batches) {
    const meta = batch.entries[0]?.meta?.autoApplied;
    if (!isRecord(meta) || meta.conversation !== conversationId) continue;
    if (typeof meta.message !== "string" || typeof meta.path !== "string" || typeof meta.lines !== "number") {
      warn(conversationId, `the auto-applied batch ${batch.batch} is missing a field its marker needs`);
      continue;
    }
    if (!undoState(batches, batch.batch).undoable) continue;
    markers.push({ batch: batch.batch, message: meta.message, path: meta.path, lines: meta.lines, summary: batch.summary });
  }
  return markers;
}
