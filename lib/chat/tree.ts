// Owns: PROJECT.md §16.2 — the derivation of structure from a flat list of messages, and the five
// queries every branching surface asks. Ported from `HANDOFF-CHAT.md` Part D with the three
// substitutions §16.2 names: the root sentinel uuid becomes `null`, the global integer `index`
// becomes `(createdAt, id)`, and `isNote` becomes `deleted`.
//
// The point of the whole file is that **nothing here is stored**. `parentId` on the child is the
// only structural fact on disk, and one leaf pointer is the only branch state; children, paths,
// siblings and pairs are all recomputed. That is what makes a new branch an added file rather than
// a two-file diff with a lost-update race (§16.1), and it is why these functions have to be cheap
// enough to call on every render.
//
// Failure behavior: corrupt structure truncates, never hangs and never throws. A cycle in the
// parent links is caught by a `seen` set; a parent that is not in the map ends the walk; an id
// nobody knows about answers with an empty list or with itself. A conversation whose files are
// half-written is worth showing partially — the alternative is a blank screen for one bad file.

import type { Message, MessageId } from "./types.ts";

export interface Tree {
  /** Every message, deleted ones included: an annotation on a deleted message still reports. */
  nodes: Map<MessageId, Message>;
  /** Parent id (or `null` for roots) → child ids, ordered, deleted excluded. */
  children: Map<MessageId | null, MessageId[]>;
}

/**
 * Sibling order, and the only ordering rule in the file: creation time, then id. There is no
 * integer index to keep in step (§16.1), and a UUIDv7 tie-break is itself time-ordered, so two
 * messages minted in the same millisecond still order stably rather than by map insertion.
 */
function compare(a: Message, b: Message): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildTree(messages: Message[]): Tree {
  const nodes = new Map<MessageId, Message>();
  for (const message of messages) nodes.set(message.id, message);

  const children = new Map<MessageId | null, MessageId[]>();
  const sorted = [...messages].sort(compare);
  for (const message of sorted) {
    if (message.deleted) continue;
    // A parent id nobody has a file for is not a root — it is an orphan, and putting it under
    // `null` would promote a fragment of a lost branch to the top of the conversation.
    if (message.parentId !== null && !nodes.has(message.parentId)) continue;
    const siblings = children.get(message.parentId);
    if (siblings === undefined) children.set(message.parentId, [message.id]);
    else siblings.push(message.id);
  }

  return { nodes, children };
}

/**
 * The active root-to-leaf path, walked up from the leaf and reversed. Deleted messages are excluded
 * (§16.2), and they cannot leave a hole: deletion refuses any message with children, so a deleted
 * node is always a leaf and dropping it never disconnects anything behind it.
 */
export function activePath(tree: Tree, leafId: MessageId | null): Message[] {
  const path: Message[] = [];
  const seen = new Set<MessageId>();
  let id = leafId;

  while (id !== null && !seen.has(id)) {
    seen.add(id);
    const node = tree.nodes.get(id);
    if (node === undefined) break; // truncates on a missing parent rather than inventing one
    if (!node.deleted) path.push(node);
    id = node.parentId;
  }

  return path.reverse();
}

/** The children of this message's parent — the branch alternatives at that point in the path. */
export function siblingsOf(tree: Tree, id: MessageId): Message[] {
  const node = tree.nodes.get(id);
  if (node === undefined) return [];
  const ids = tree.children.get(node.parentId) ?? [id];
  return ids
    .map((sibling) => tree.nodes.get(sibling))
    .filter((sibling): sibling is Message => sibling !== undefined);
}

/**
 * The leaf to activate when switching to this branch: follow the newest child at each step.
 *
 * That is a policy choice rather than a law, and the handoff says so — "the leaf that was last
 * active under this subtree" is the other defensible answer and would need per-subtree memory to
 * store. Newest-child needs nothing stored, which is the same reason the rest of this file exists.
 */
export function latestLeafUnder(tree: Tree, id: MessageId): MessageId {
  let current = id;
  const seen = new Set<MessageId>([id]);

  for (;;) {
    const ids = tree.children.get(current) ?? [];
    const next = ids[ids.length - 1];
    if (next === undefined || seen.has(next)) return current;
    seen.add(next);
    current = next;
  }
}

/** §16.5: a prompt and, when it has one, the reply that answered it. */
export interface Pair {
  prompt: Message;
  response: Message | null;
}

/**
 * The sidebar's list, recomputed from the path on every render and never stored (§16.5). A user
 * message followed by an assistant message is one row; anything else stands alone, which is what
 * makes a streaming reply and a failed one both render without a special case.
 */
export function buildPairs(path: Message[]): Pair[] {
  const pairs: Pair[] = [];

  for (let i = 0; i < path.length; i += 1) {
    const node = path[i];
    const next = path[i + 1];
    if (node.role === "user" && next !== undefined && next.role === "assistant") {
      pairs.push({ prompt: node, response: next });
      i += 1;
    } else {
      pairs.push({ prompt: node, response: null });
    }
  }

  return pairs;
}
