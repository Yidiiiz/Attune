// Owns: the secret scan `runBatch` runs over a batch before a byte of it is logged (PROJECT.md
// Decision 50) — a pure predicate over a batch and its snapshots, split out of `batch.ts` along the
// seam Decision 56 named in advance, because it shares no state with the ordered transaction there.
//
// Failure behavior: none of its own. It reads and returns; `runBatch` decides what a hit means.

import { findSecret } from "../security/secrets.ts";
import type { Snapshot } from "./log.ts";
import type { Applied, BatchSpec } from "./batch.ts";

/** The text a snapshot puts into the log. `{ git: true }` carries none; the commit holds it. */
function snapshotText(snap: Snapshot): string {
  if (snap === null) return "";
  if ("content" in snap) return snap.content;
  if ("fields" in snap) return JSON.stringify(snap.fields);
  return "";
}

interface Rejection {
  where: string;
  pattern: string;
}

/**
 * Everything this batch is about to write into `actions.jsonl`, scanned before a byte of it is
 * written: the summaries and meta that become log fields and mirror lines, the target paths, and
 * both sides of every snapshot.
 *
 * The log is append-only and committed, so a credential reaching it is not an ordinary leak — the
 * pre-commit hook finds it on the *next* commit and refuses every commit after that, and undo does
 * not help because the undo batch snapshots the same text again. Scrubbing is not available here:
 * snapshots exist to restore files byte for byte. So the batch is refused instead, whole, before
 * anything is logged (AGENTS.md hard rules; PROJECT.md Decision 50).
 */
export function scanBatch(spec: BatchSpec, applied: Applied[]): Rejection | null {
  const described = [
    spec.summary,
    ...applied.map((step) => step.spec.summary),
    JSON.stringify(spec.meta ?? {}),
  ].join("\n");
  const inDescription = findSecret(described);
  if (inDescription) return { where: "the summary of this change", pattern: inDescription };

  for (const step of applied) {
    for (const rel of step.targets) {
      const inPath = findSecret(rel);
      if (inPath) return { where: rel, pattern: inPath };
    }
    // `before` counts too: deleting a file that already held a credential would copy it into the log
    // on the way out, which is the same deadlock arriving by a politer route.
    for (const snapshots of [step.before, step.after]) {
      for (const [rel, snap] of Object.entries(snapshots)) {
        const hit = findSecret(snapshotText(snap));
        if (hit) return { where: rel, pattern: hit };
      }
    }
  }

  return null;
}
