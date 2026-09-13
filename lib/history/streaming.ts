// Owns: PROJECT.md §8's one sanctioned exception to "every write goes through `runBatch`" — the
// partial text of a reply that is still arriving. It was deferred out of Phase 2 into the phase
// with its only caller, which is Phase 6.
//
// Why the exception exists: a streaming reply rewrites the same file every few hundred
// milliseconds, and each of those writes through `runBatch` would be a log line and a git commit
// for a sentence fragment. §8 says it plainly — never commit a streaming message. So the deltas go
// straight to disk with no log entry, and the finalized message is written once through `runBatch`
// as a single `chat.message` batch. Undo therefore sees one message, which is the unit a person
// would undo, and `actions.jsonl` does not fill with fragments of a paragraph.
//
// Why it is its own module rather than a flag on a store function: an unaudited write path is
// exactly the thing hard rule 6 exists to prevent, so it is worth one file whose whole content is
// the guard that keeps it narrow. Two conditions, both checked on every call — the path must name a
// message file inside a conversation, and the bytes must say `status: streaming`. Anything else is
// a programming error and is refused rather than written. Every path it writes is registered in
// `in-flight.ts` first, which is what keeps a batch committing in the meantime from sweeping it up.
//
// `streamingDiscard` is the same exception in the other direction — §16.3's "delete both files"
// when a send is rejected before any delta. It is here rather than in the caller so that *every*
// unlogged touch of `data/` is in this one file, behind the same guard, and it refuses to remove a
// message that has stopped streaming: a finalized message is in the log, and deleting one outside
// the log would leave an entry describing a file that is not there.
//
// `sweepInterruptedMessages` is the other end of the same idea: the two guards above keep the hole
// narrow while the app is running, and this one closes what a process that died left in it. It is
// the only thing in this file that goes *through* `runBatch` rather than around it, and it is the
// reason the exception stays honest — every file that skips the log is either being written right
// now or is repaired at the next startup (Decision 64).
//
// Failure behavior: refuses loudly and writes nothing. A caller that reaches here with a finalized
// message, a task file, or a path outside `chats/` gets `StoreError("invalid")` and has to go
// through `runBatch` like everything else. There is no force and no option to relax either check:
// the moment this accepts a path it was not designed for, `data/` has a writer nothing records.

import { splitFrontmatter } from "../store/frontmatter.ts";
import { deleteFile, exists, listTree, readText, writeText } from "../store/files.ts";
import { CHATS_DIR, parseMessage } from "../store/chats.ts";
import { StoreError } from "../store/paths.ts";
import { runBatch } from "./batch.ts";
import { repairInterrupted } from "./chat-actions.ts";
import { heldByLiveTurn, markStreaming } from "./in-flight.ts";
import { readActions, readLogText } from "./log.ts";
import type { TreeNode } from "../store/files.ts";
import type { Message } from "../chat/types.ts";

/** `chats/<conv-id>/messages/<uuidv7>.md`, and nothing else (§4.7). */
const STREAMING_TARGET =
  /^chats\/c_[0-9a-z_]+\/messages\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.md$/;

/**
 * Write the current partial text of a streaming message, bypassing the log and the commit.
 *
 * `content` is the whole file, already rendered by `renderMessage` — this function does not build
 * it, because the guard below has to read the same bytes that reach the disk rather than a shape
 * that was promised to it.
 */
function requireMessagePath(rel: string): void {
  if (!STREAMING_TARGET.test(rel)) {
    throw new StoreError(
      "invalid",
      `${rel} is not a chat message file; the streaming write path exists only for ` +
        `chats/<id>/messages/<uuid>.md and everything else goes through runBatch`,
    );
  }
}

export async function streamingWrite(rel: string, content: string, turn: string): Promise<void> {
  requireMessagePath(rel);

  const { data } = splitFrontmatter(content);
  if (data.status !== "streaming") {
    throw new StoreError(
      "invalid",
      `refusing to write ${rel} outside the log: its status is ${JSON.stringify(data.status)}, and ` +
        `only a message still streaming may bypass runBatch (§8)`,
    );
  }

  // Before the write, so there is no moment when the file exists and a batch could stage it.
  markStreaming(rel, turn);
  await writeText(rel, content);
}

/**
 * Remove a message that never finished — the optimistic pair behind a send the provider rejected
 * before it said anything (§16.3). Nothing logged it, so nothing has to un-log it.
 *
 * A file that is missing is not an error: the caller is unwinding, and unwinding twice must be
 * safe. A file that is no longer streaming *is* an error, because it belongs to the log now.
 */
export async function streamingDiscard(rel: string): Promise<void> {
  requireMessagePath(rel);
  if (!(await exists(rel))) return;

  const { data } = splitFrontmatter(await readText(rel));
  if (data.status !== "streaming") {
    throw new StoreError(
      "invalid",
      `refusing to delete ${rel} outside the log: its status is ${JSON.stringify(data.status)}, so ` +
        `it has been recorded and only an undo may remove it`,
    );
  }

  await deleteFile(rel);
}

/**
 * Find the messages a previous run abandoned mid-turn and repair them (Decision 64).
 *
 * The wound this closes is the one the guards above cannot: `streamingDiscard` and the route's
 * drain handle a client going away, but a process that dies has no chance to do either, and what it
 * leaves is a message file that says `streaming` with nothing in the log. Decision 63's invariant
 * is what makes that recognisable — and, until this runs, invisible, because a `streaming` message
 * is drawn exactly like a reply that is still on its way.
 *
 * **Why it is safe to assume an orphan.** It runs at startup, so this process has no live streams;
 * §16.0 rule 2 says there are no concurrent writers; and a path that appears in any log entry is
 * left alone regardless. So a `streaming` file that nothing recorded can only be one an earlier run
 * did not finish.
 *
 * Failure behavior: **a log that did not read cleanly means nothing is swept.** `readActions` skips
 * a torn line and keeps going, which is right for the history view and wrong as this function's
 * only input: the line it dropped could be the very entry naming a message about to be "repaired",
 * and a log that failed to parse entirely would read as an empty one, making every message look
 * orphaned. So the parsed entries are counted against the non-empty lines, and a mismatch stops the
 * sweep. A *message* file it cannot parse is different — that one is skipped and named, and the
 * rest are still repaired. Anything `runBatch` refuses fails the whole sweep and leaves the files
 * as they were, which is the same answer as not having run: the next startup tries again.
 */
export async function sweepInterruptedMessages(): Promise<{ repaired: number }> {
  let logged: Set<string>;
  try {
    const lines = (await readLogText()).split("\n").filter((line) => line.trim().length > 0);
    const entries = await readActions();
    if (entries.length !== lines.length) {
      console.error(
        `history: ${lines.length - entries.length} action log line(s) did not parse, so no ` +
          "interrupted messages were swept; a dropped line could be the one recording them",
      );
      return { repaired: 0 };
    }
    logged = new Set(entries.flatMap((entry) => entry.targets));
  } catch (err) {
    console.error(`history: could not read the action log, so no interrupted messages were swept (${(err as Error).message})`);
    return { repaired: 0 };
  }

  const flatten = (nodes: TreeNode[]): string[] =>
    nodes.flatMap((node) => (node.type === "file" ? [node.path] : flatten(node.children ?? [])));

  const orphans: Array<{ convId: string; message: Message }> = [];
  for (const rel of flatten(await listTree(CHATS_DIR))) {
    // A turn in this process still holds it, so it is a live stream and not an orphan. At startup
    // there are none (the sweep runs in `scripts/dev.mjs`, before the server exists); the check is
    // what keeps that true if the sweep is ever called from anywhere else.
    if (!STREAMING_TARGET.test(rel) || logged.has(rel) || heldByLiveTurn(rel)) continue;
    try {
      const message = parseMessage(await readText(rel));
      if (message.status !== "streaming") continue;
      orphans.push({ convId: rel.split("/")[1], message });
    } catch (err) {
      console.error(`history: skipping ${rel} while sweeping (${(err as Error).message})`);
    }
  }

  if (orphans.length === 0) return { repaired: 0 };

  const count = `${orphans.length} message${orphans.length === 1 ? "" : "s"}`;
  await runBatch({
    actor: "user",
    scope: "user",
    summary: `recover ${count} left by an interrupted run`,
    commitPrefix: "chat",
    meta: { interruptedSweep: true },
    actions: orphans.map((orphan) => repairInterrupted(orphan.convId, orphan.message)),
  });

  console.error(`history: recovered ${count} left streaming by an earlier run; the replies are marked unfinished`);
  return { repaired: orphans.length };
}
