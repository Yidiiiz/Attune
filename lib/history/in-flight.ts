// Owns: the message files a turn is streaming into right now, **and which turn owns each one**, so
// a batch that commits in the meantime can leave them out. §8 says never commit a streaming message,
// and `runBatch` stages `data/` whole — so without this, any batch landing mid-turn (a task added
// from another tab, a setting changed, Phase 7's auto-applied habit) sweeps the half-written reply
// into its commit, and git holds a `status: streaming` file that nothing in the log describes.
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
// **The exception is keyed to ownership, not to target membership.** The one batch allowed to write
// and commit a held file is the one that says it finalizes that file's turn (`BatchSpec.turn`). Any
// other batch that declares a held path is refused whole, before anything is logged — declaring the
// path is not the same as owning it, and a rule keyed to declaration would let any writer that
// happened to name the file pull the half-written reply into its commit.
//
// **Every entry has a lifetime.** `streamingWrite` registers a path before its first byte lands; the
// turn's finalizing batch ends the hold when it commits, and `runChatTurn`'s `finally` releases
// whatever is left on every other exit. A file still `streaming` at that
// point becomes an **orphan** — owned by nobody, kept out of every commit, and named once — and the
// next batch that declares it (a delete, the sweep) takes it over and clears the entry. A file that
// has stopped streaming without being released is a stale entry and is dropped at the next batch,
// named too. Both are loud because the failure they guard against is silent: a path left here is
// excluded from every later commit and nothing notices.
//
// Failure behavior: a file that cannot be read is treated as still streaming — excluding a file for
// one extra commit is recoverable, committing a partial reply is not. A second turn registering a
// path another turn holds is refused with `StoreError("invalid")`: two writers on one message file
// is a bug, not a race to settle.

import { exists, readText } from "../store/files.ts";
import { splitFrontmatter } from "../store/frontmatter.ts";
import { StoreError } from "../store/paths.ts";

/** Path → the turn that owns it, or `null` once that turn has ended and left the file streaming. */
const held = new Map<string, string | null>();

/** Called by `streamingWrite` before it writes. `data/`-relative, like every path in the store. */
export function markStreaming(rel: string, turn: string): void {
  const owner = held.get(rel);
  if (owner !== undefined && owner !== turn) {
    throw new StoreError(
      "invalid",
      `${rel} is already being streamed by ${owner === null ? "a turn that has ended" : `turn ${owner}`}; ` +
        `turn ${turn} may not write it`,
    );
  }
  held.set(rel, turn);
}

/** How many paths are held. What a check reads after a turn ends, beside `activeStreams()`. */
export const streamingPaths = (): number => held.size;

/** Whether a turn that has not ended holds `rel` — what tells the sweep a live stream from an orphan. */
export const heldByLiveTurn = (rel: string): boolean => typeof held.get(rel) === "string";

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
    if (!held.has(rel)) continue;
    if ((await stillStreaming(rel)) === true) {
      held.set(rel, null);
      console.error(
        `history: ${rel} still says streaming after its turn ended, so it stays out of every commit ` +
          "until a batch repairs it or the next startup's sweep does (Decision 64)",
      );
      continue;
    }
    held.delete(rel);
  }
}

/**
 * The refusal for a batch that declares a path some other live turn is streaming into, or null.
 * Synchronous and run before anything is logged, so a refusal can roll back and leave no trace.
 */
export function contestedTargets(targets: string[], turn: string | undefined): string | null {
  const contested = targets.filter((rel) => {
    const owner = held.get(rel);
    return typeof owner === "string" && owner !== turn;
  });
  if (contested.length === 0) return null;
  const message =
    `${contested.join(", ")} ${contested.length === 1 ? "is a reply" : "are replies"} still arriving, ` +
    "and only the turn writing it may change it. Nothing was written; try again when it has finished";
  console.warn(`history: refused a batch that declared a streaming file it does not own — ${contested.join(", ")}`);
  return message;
}

/**
 * The held paths a batch's commit must leave out. A path stays in the commit only when the batch
 * declares it **and** may own it: it is the batch's own turn, or the file is an orphan this batch is
 * taking over. `contestedTargets` has already refused every other batch that declares one.
 */
export async function commitExclusions(targets: string[], turn: string | undefined): Promise<string[]> {
  const own = new Set(targets);
  const excluded: string[] = [];
  for (const [rel, owner] of [...held]) {
    // The owning turn's finalizing batch ends the hold itself, rather than leaving it to the turn's
    // `finally`: a batch from another request landing between the two would otherwise find a held
    // file that has stopped streaming and report a stale entry that is not one.
    if (own.has(rel) && owner === turn) {
      held.delete(rel);
      continue;
    }
    if (own.has(rel) && owner === null) {
      held.delete(rel);
      console.error(`history: ${rel} was left streaming by a turn that ended; this batch repairs it`);
      continue;
    }
    const streaming = await stillStreaming(rel);
    // An orphan whose file is gone protects nothing. A live turn's missing file is different: it may
    // simply not be written yet, and excluding a path that does not exist costs nothing.
    if (streaming === null && owner === null) {
      held.delete(rel);
      continue;
    }
    if (streaming === false) {
      console.error(
        `history: ${rel} was held as streaming but no longer is, and nothing released it; it is ` +
          "being committed normally again. Whatever ended that turn skipped runChatTurn's finally",
      );
      held.delete(rel);
      continue;
    }
    excluded.push(rel);
  }
  return excluded;
}
