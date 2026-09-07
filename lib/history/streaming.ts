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
// a programming error and is refused rather than written.
//
// Failure behavior: refuses loudly and writes nothing. A caller that reaches here with a finalized
// message, a task file, or a path outside `chats/` gets `StoreError("invalid")` and has to go
// through `runBatch` like everything else. There is no force and no option to relax either check:
// the moment this accepts a path it was not designed for, `data/` has a writer nothing records.

import { splitFrontmatter } from "../store/frontmatter.ts";
import { writeText } from "../store/files.ts";
import { StoreError } from "../store/paths.ts";

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
export async function streamingWrite(rel: string, content: string): Promise<void> {
  if (!STREAMING_TARGET.test(rel)) {
    throw new StoreError(
      "invalid",
      `${rel} is not a chat message file; the streaming write path exists only for ` +
        `chats/<id>/messages/<uuid>.md and everything else goes through runBatch`,
    );
  }

  const { data } = splitFrontmatter(content);
  if (data.status !== "streaming") {
    throw new StoreError(
      "invalid",
      `refusing to write ${rel} outside the log: its status is ${JSON.stringify(data.status)}, and ` +
        `only a message still streaming may bypass runBatch (§8)`,
    );
  }

  await writeText(rel, content);
}
