// Owns: the message files a turn is streaming into right now, so a batch that commits in the
// meantime can leave them out. §8 says never commit a streaming message, and `runBatch` stages
// `data/` whole — so without this, any batch landing mid-turn (a task added from another tab, a
// setting changed, Phase 7's auto-applied habit) sweeps the half-written reply into its commit, and
// git holds a `status: streaming` file that nothing in the log describes.
//
// **Why the commit excludes rather than stages only what a batch declares.** Staging the declared
// targets alone is the other way to close this, and it fails in the worse direction: a write a
// builder forgot to declare would then never be committed, silently, and the tree would drift from
// history — undo's byte-for-byte checks would be comparing against bytes git never had. Over-staging
// is visible and recoverable; under-staging is neither. So `data/` is still staged whole, minus
// these paths, and `compareStaged` in `git.ts` reports, outside production, every batch whose
// staged set and declared targets differ — which is the evidence for whether the other way would
// ever be safe.
//
// **Every entry has a lifetime.** `streamingWrite` registers a path before its first byte lands;
// `runChatTurn`'s `finally` releases the turn's paths, which is every terminal path — a finished
// reply, a stop, a provider error, a refusal, an unexpected throw. A stale entry is the dangerous
// failure here, because it is silent: a path left in this set is excluded from every later commit
// and nothing notices. So both ways one can arise are loud.
//
// Failure behavior: an entry whose file is still `streaming` when its turn releases it is **kept** —
// that file is an orphan (Decision 64), it must not be committed, and the next startup's sweep
// repairs it — and says so once. An entry whose file has stopped streaming without being released
// is dropped at the next batch, and says so. A file that cannot be read is treated as still
// streaming: excluding a file for one extra commit is recoverable, committing a partial reply is not.

import { exists, readText } from "../store/files.ts";
import { splitFrontmatter } from "../store/frontmatter.ts";

const inFlight = new Set<string>();

/** Called by `streamingWrite` before it writes. `data/`-relative, like every path in the store. */
export function markStreaming(rel: string): void {
  inFlight.add(rel);
}

/** How many paths are held. What a check reads after a turn ends, beside `activeStreams()`. */
export const streamingPaths = (): number => inFlight.size;

/** `null` when the file is not there — not written yet, or discarded. */
async function stillStreaming(rel: string): Promise<boolean | null> {
  try {
    if (!(await exists(rel))) return null;
    return splitFrontmatter(await readText(rel)).data.status === "streaming";
  } catch {
    return true;
  }
}

/** End a turn's hold on its files. Called from `runChatTurn`'s `finally`, so on every exit. */
export async function releaseStreaming(rels: string[]): Promise<void> {
  for (const rel of rels) {
    if (!inFlight.has(rel)) continue;
    if ((await stillStreaming(rel)) === true) {
      console.error(
        `history: ${rel} still says streaming after its turn ended, so it stays out of every commit ` +
          "until the next startup's sweep repairs it (Decision 64)",
      );
      continue;
    }
    inFlight.delete(rel);
  }
}

/**
 * The held paths a batch's commit must leave out: every one that is not among the batch's own
 * targets. The subtraction is what lets the finalizing batch commit the very file it finalizes, and
 * what lets the startup sweep commit the orphans it repairs.
 */
export async function commitExclusions(targets: string[]): Promise<string[]> {
  const own = new Set(targets);
  const excluded: string[] = [];
  for (const rel of inFlight) {
    if (own.has(rel)) continue;
    if ((await stillStreaming(rel)) === false) {
      console.error(
        `history: ${rel} was held as streaming but no longer is, and nothing released it; it is ` +
          "being committed normally again. Whatever ended that turn skipped runChatTurn's finally",
      );
      inFlight.delete(rel);
      continue;
    }
    excluded.push(rel);
  }
  return excluded;
}
