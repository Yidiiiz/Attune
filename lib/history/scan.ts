// Owns: every reason `runBatch` refuses a batch after applying it and before a byte of it is logged
// — the secret scan (PROJECT.md Decision 50), and a write into a reply another turn is still
// streaming (`in-flight.ts`). Predicates over a batch and its snapshots, split out of `batch.ts`
// along the seam Decision 56 named in advance, because they share no state with the ordered
// transaction there; this is also where each new refusal rule goes.
//
// Failure behavior: none of its own. It reads and returns; `runBatch` rolls back and throws.

import { findSecret } from "../security/secrets.ts";
import type { StoreErrorCode } from "../store/paths.ts";
import { contestedTargets } from "./in-flight.ts";
import type { Snapshot } from "./log.ts";
import type { Applied, BatchSpec } from "./batch.ts";

export interface Refusal {
  code: StoreErrorCode;
  message: string;
}

/** The first reason to refuse this batch, or null. Secrets first, as they were before the others. */
export function refuseBatch(spec: BatchSpec, applied: Applied[], targets: string[]): Refusal | null {
  const secret = scanBatch(spec, applied);
  if (secret) {
    return {
      code: "secret_rejected",
      message:
        `${secret.where} looks like it contains a credential (${secret.pattern}). Nothing was ` +
        `written. Move the value to .env.local, or change the text, and save again.`,
    };
  }
  const contested = contestedTargets(targets, spec.turn);
  if (contested) return { code: "invalid", message: contested };
  return null;
}

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
