// Owns: the ActionSpec builders for everything under `data/chats/` — the fourth builder domain
// beside tasks, files and settings in `actions.ts`. It is a separate file rather than more of that
// one because the Phase 5 review named the seam there: those builders are a flat list of
// independent closures that splits by domain, and this is a domain (AGENTS.md, Conventions).
//
// What the snapshots record, and why. A message file is whole text, so every message action
// snapshots `content` — there is no smaller honest description of a paragraph, and undo has to put
// the bytes back exactly. `conversation.md` is snapshotted whole for the same reason even when only
// `activeLeafId` moved: it is a few hundred bytes, `updatedAt` moves with every write anyway, and a
// `fields` snapshot that forgot to list it would restore old values under a timestamp claiming
// nothing had happened. Attachments are `{ git: true }`, because they are binary (§7.1).
//
// A streaming message never reaches here at all: it is written by `lib/history/streaming.ts` and
// logged once, at finalize, as the complete message (§8).
//
// Failure behavior: a builder that cannot find its conversation or its message throws before
// writing anything, which `runBatch` turns into a rolled-back batch and an error the caller shows.
// The one case that deliberately refuses rather than repairs is deleting a message with children
// (§16.2): a soft delete would hide a message its descendants still hang from, and a hard one
// would orphan them.

import { StoreError } from "../store/paths.ts";
import { buildTree } from "../chat/tree.ts";
import type { ActionSpec, Store } from "./batch.ts";
import type { TreeNode } from "../store/files.ts";
import type { Snapshot, Snapshots } from "./log.ts";
import type { Annotation, Conversation, Message } from "../chat/types.ts";

const single = (rel: string, snap: Snapshot): Snapshots => ({ [rel]: snap });

/** A conversation's own record, without paying for its messages. */
async function readMeta(store: Store, convId: string): Promise<Conversation> {
  return store.chats.parseConversation(await store.files.readText(store.chats.conversationPath(convId)));
}

/** What a conversation is called in a summary, falling back to its id before a title exists. */
const name = (conversation: Conversation): string =>
  conversation.title.trim().length > 0 ? conversation.title.trim() : conversation.id;

export function createConversation(conversation: Conversation): ActionSpec {
  return {
    type: "chat.create",
    summary: `Start '${name(conversation)}'`,
    apply: async (store: Store) => {
      const rel = store.chats.conversationPath(conversation.id);
      await store.chats.writeConversation(conversation);
      return {
        targets: [rel],
        before: single(rel, null),
        after: single(rel, await store.snapshotContent(rel)),
      };
    },
  };
}

/**
 * Write one finalized message. Both halves of a turn are two of these in one batch, which is what
 * §16.3 means by committing the pair together, and what makes one undo remove a whole exchange.
 */
export function saveMessage(convId: string, message: Message, summary?: string): ActionSpec {
  return {
    type: "chat.message",
    summary: summary ?? (message.role === "user" ? "Send a message" : "Record a reply"),
    apply: async (store: Store) => {
      const rel = store.chats.messagePath(convId, message.id);
      const before = await store.snapshotContent(rel);
      await store.chats.writeMessage(convId, message);
      return {
        targets: [rel],
        before: single(rel, before),
        after: single(rel, await store.snapshotContent(rel)),
      };
    },
  };
}

export interface ConversationChanges {
  title?: string;
  pinned?: boolean;
  activeLeafId?: string | null;
  model?: string;
  context?: Conversation["context"];
}

/**
 * Change fields on `conversation.md`. Moving the leaf is one of these (Decision 11): it is an
 * ordinary logged, committed action, because "everything is reversible" beats commit quiet — and
 * §7.5 hides `chat.update` from the history list by default so the noise costs nothing on screen.
 */
export function updateConversation(
  convId: string,
  changes: ConversationChanges,
  summary?: string,
): ActionSpec {
  return {
    type: "chat.update",
    summary: summary ?? `Update '${convId}'`,
    apply: async (store: Store) => {
      const conversation = await readMeta(store, convId);
      const rel = store.chats.conversationPath(convId);
      const before = await store.snapshotContent(rel);
      await store.chats.writeConversation({ ...conversation, ...changes });
      return {
        targets: [rel],
        before: single(rel, before),
        after: single(rel, await store.snapshotContent(rel)),
      };
    },
  };
}

/**
 * Delete one message, per §16.2's three cases. A message with children is refused; a childless
 * failed message is removed outright, because it never held content worth keeping (Decision 8);
 * anything else is marked `deleted` with its body intact.
 *
 * If it was the active leaf the leaf moves to its parent in the same action, so the conversation is
 * never left pointing at a message the path no longer includes — and so one undo puts both back.
 */
export function removeMessage(convId: string, id: string): ActionSpec {
  return {
    type: "chat.update",
    summary: `Delete a message`,
    apply: async (store: Store) => {
      const { conversation, messages } = await store.chats.readConversation(convId);
      const message = messages.find((candidate) => candidate.id === id);
      if (message === undefined) throw new StoreError("not_found", `no message ${id}`);

      const tree = buildTree(messages);
      if ((tree.children.get(id) ?? []).length > 0) {
        throw new StoreError(
          "invalid",
          "this message has replies under it; delete those first or branch away from it instead",
        );
      }

      const hard = message.status === "failed";
      const rel = store.chats.messagePath(convId, id);
      const convRel = store.chats.conversationPath(convId);
      const before: Snapshots = { [rel]: await store.snapshotContent(rel) };
      const after: Snapshots = {};
      const targets = [rel];

      if (hard) await store.chats.deleteMessage(convId, id);
      else await store.chats.writeMessage(convId, { ...message, deleted: true });
      after[rel] = hard ? null : await store.snapshotContent(rel);

      if (conversation.activeLeafId === id) {
        targets.push(convRel);
        before[convRel] = await store.snapshotContent(convRel);
        await store.chats.writeConversation({ ...conversation, activeLeafId: message.parentId });
        after[convRel] = await store.snapshotContent(convRel);
      }

      return { targets, before, after };
    },
  };
}

/** Every file in a directory tree, flattened. Only the paths matter; their order does not. */
function flatten(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type === "file") out.push(node.path);
    else out.push(...flatten(node.children ?? []));
  }
  return out;
}

/**
 * Delete a whole conversation — its record, its messages, its annotations and its attachments — as
 * one batch (Decision 8). Text files are snapshotted inline so undo restores them without git;
 * attachments are `{ git: true }`, which is what "recoverable through git" means for bytes.
 */
export function removeConversation(convId: string, summary?: string): ActionSpec {
  return {
    type: "chat.delete",
    summary: summary ?? "Delete a conversation",
    apply: async (store: Store) => {
      const dir = store.chats.conversationDir(convId);
      const attachments = store.chats.attachmentsDir(convId);
      const targets = flatten(await store.files.listTree(dir));

      const before: Snapshots = {};
      const after: Snapshots = {};
      for (const rel of targets) {
        before[rel] = rel.startsWith(`${attachments}/`) ? { git: true } : await store.snapshotContent(rel);
        after[rel] = null;
      }

      await store.chats.deleteConversation(convId);
      return { targets, before, after };
    },
  };
}

/** Whole-file write per annotation, never a shared array — §16.4's rule against clobbering. */
export function saveAnnotation(convId: string, annotation: Annotation, summary?: string): ActionSpec {
  return {
    type: "annotation.write",
    summary: summary ?? (annotation.deleted ? "Remove an annotation" : "Write an annotation"),
    apply: async (store: Store) => {
      const rel = store.chats.annotationPath(convId, annotation.id);
      const before = await store.snapshotContent(rel);
      await store.chats.writeAnnotation(convId, annotation);
      return {
        targets: [rel],
        before: single(rel, before),
        after: single(rel, await store.snapshotContent(rel)),
      };
    },
  };
}

/** A conversation's title, for a caller that wants it in a batch summary. */
export async function conversationName(store: Store, convId: string): Promise<string> {
  return name(await readMeta(store, convId));
}
