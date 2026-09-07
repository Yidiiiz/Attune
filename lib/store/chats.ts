// Owns: `data/chats/` — PROJECT.md §4.7's layout on disk, and the seven functions §5 names. One
// directory per conversation, one file per message, one file per annotation, and no index of any
// kind (Decision 9): a directory scan of a few hundred small files is milliseconds, and an index
// would be a second source of truth that has to be kept in step with an append-only tree.
//
// Message files are named by their UUIDv7, so a directory listing is already in creation order and
// the store never has to sort by reading. Everything mutable about branch state is one field,
// `activeLeafId`, in `conversation.md` — which is why that file is the only one here that is
// rewritten often, and why it holds nothing else that churns (§16.1).
//
// Nothing in this file logs, commits, or knows about history. Writes reach it through `runBatch`
// (§1 rule 6); the one exception is `lib/history/streaming.ts`, §8's sanctioned bypass for a
// message that is still streaming, which renders its bytes with `renderMessage` from here.
//
// Failure behavior: one unreadable message file costs that message, never the conversation. A file
// whose frontmatter will not parse is skipped and its path is logged; the tree then truncates at
// that point exactly as §16.2 says it does for a missing parent, so a half-written conversation
// still opens and still shows everything reachable. A missing conversation is `not_found`, because
// a caller asking for one by id has already been told it exists.

import { randomBytes } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { StoreError, resolveData } from "./paths.ts";
import { joinFrontmatter, splitFrontmatter } from "./frontmatter.ts";
import { deleteFile, exists, readText, writeText } from "./files.ts";
import { readSettings } from "./settings.ts";
import { nowIso, todayIn } from "../schedule/dates.ts";
import { isUuid } from "../chat/uuid.ts";
import { AnnotationSchema, ConversationSchema, MessageSchema } from "../chat/types.ts";
import type { Annotation, Conversation, ConversationMeta, Message } from "../chat/types.ts";

export const CHATS_DIR = "chats";

export const conversationDir = (convId: string): string => `${CHATS_DIR}/${convId}`;
export const conversationPath = (convId: string): string => `${conversationDir(convId)}/conversation.md`;
export const messagesDir = (convId: string): string => `${conversationDir(convId)}/messages`;
export const messagePath = (convId: string, id: string): string => `${messagesDir(convId)}/${id}.md`;
export const annotationsDir = (convId: string): string => `${conversationDir(convId)}/annotations`;
export const annotationPath = (convId: string, id: string): string => `${annotationsDir(convId)}/${id}.md`;
export const attachmentsDir = (convId: string): string => `${conversationDir(convId)}/attachments`;

/** The order each record's frontmatter is written in, matching the examples in §4.7 and §16.4. */
const CONVERSATION_ORDER = [
  "schema", "id", "title", "activeLeafId", "pinned", "model", "context", "createdAt", "updatedAt",
] as const;
const MESSAGE_ORDER = [
  "schema", "id", "parentId", "role", "status", "createdAt", "model", "attachments", "refs",
  "deleted", "error",
] as const;
const ANNOTATION_ORDER = [
  "schema", "id", "kind", "targetMessageId", "quote", "prefix", "suffix", "charOffset",
  "anchorText", "offsetRatio", "includeInContext", "deleted", "createdAt",
] as const;

/** Hand-edited files say `error:` or `error: ""`; both mean "not set", as everywhere else (§4.1). */
function normalize(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const [key, value] of Object.entries(out)) {
    if (value === "" || value === undefined) out[key] = null;
  }
  return out;
}

/** Fields first, in order, then anything unknown, so a hand-added key survives a round trip. */
function render(order: readonly string[], fields: Record<string, unknown>, body: string): string {
  const record: Record<string, unknown> = {};
  for (const key of order) record[key] = fields[key];
  for (const [key, value] of Object.entries(fields)) {
    if (!(key in record)) record[key] = value;
  }
  return joinFrontmatter(record, body);
}

/** The exact bytes a message file holds. Exported because `streamingWrite` renders one too (§8). */
export function renderMessage(message: Message): string {
  const { text, ...fields } = message;
  return render(MESSAGE_ORDER, fields, text);
}

export function parseMessage(text: string): Message {
  const { data, body } = splitFrontmatter(text);
  return { ...MessageSchema.parse(normalize(data)), text: body };
}

export function parseAnnotation(text: string): Annotation {
  const { data, body } = splitFrontmatter(text);
  return { ...AnnotationSchema.parse(normalize(data)), text: body };
}

export function parseConversation(text: string): Conversation {
  const { data } = splitFrontmatter(text);
  return ConversationSchema.parse(normalize(data));
}

/** `c_<YYYYMMDD>_<4 hex>` (§4.7), regenerated on collision with a directory that already exists. */
export async function newConversationId(): Promise<string> {
  const stamp = todayIn((await readSettings()).timezone).replace(/-/g, "");
  for (;;) {
    const id = `c_${stamp}_${randomBytes(2).toString("hex")}`;
    if (!(await exists(conversationDir(id)))) return id;
  }
}

/** Every directory name under `chats/`, which is every conversation id. */
async function conversationIds(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(resolveData(CHATS_DIR));
  } catch {
    return []; // a fresh install has no conversations, which is not an error
  }
  return entries.filter((name) => name.startsWith("c_")).sort();
}

/**
 * Every conversation's own file, newest first. The Chats panel groups these by date (§10.2), so the
 * order here is the one it starts from; nothing reads a message to build the list.
 */
export async function listConversations(): Promise<ConversationMeta[]> {
  const out: ConversationMeta[] = [];

  for (const id of await conversationIds()) {
    const rel = conversationPath(id);
    try {
      out.push(parseConversation(await readText(rel)));
    } catch (err) {
      console.error(`chats: skipping ${rel} (${(err as Error).message})`);
    }
  }

  return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/** Every `.md` file whose name is one of our ids, parsed, unreadable ones skipped and logged. */
async function readAll<T>(dir: string, parse: (text: string) => T): Promise<T[]> {
  let entries: string[];
  try {
    entries = await readdir(resolveData(dir));
  } catch {
    return [];
  }

  const out: T[] = [];
  for (const name of entries.sort()) {
    if (!name.endsWith(".md") || !isUuid(path.basename(name, ".md"))) continue;
    const rel = `${dir}/${name}`;
    try {
      out.push(parse(await readText(rel)));
    } catch (err) {
      console.error(`chats: skipping ${rel} (${(err as Error).message})`);
    }
  }
  return out;
}

export async function readConversation(
  id: string,
): Promise<{ conversation: Conversation; messages: Message[]; annotations: Annotation[] }> {
  const rel = conversationPath(id);
  if (!(await exists(rel))) throw new StoreError("not_found", `no conversation ${id}`);

  return {
    conversation: parseConversation(await readText(rel)),
    messages: await readAll(messagesDir(id), parseMessage),
    annotations: await readAll(annotationsDir(id), parseAnnotation),
  };
}

/**
 * Create or replace `conversation.md`. `updatedAt` is stamped here, the one field a caller never
 * sets — and the reason a leaf move is a real write rather than a no-op the dirty check swallows.
 */
export async function writeConversation(conversation: Conversation): Promise<void> {
  const timezone = (await readSettings()).timezone;
  const now = nowIso(timezone);
  const fields = ConversationSchema.parse({
    ...conversation,
    createdAt: conversation.createdAt || now,
    updatedAt: now,
  });
  await writeText(conversationPath(fields.id), render(CONVERSATION_ORDER, fields, ""));
}

export async function deleteConversation(id: string): Promise<void> {
  await deleteFile(conversationDir(id));
}

/** Whole-file write, atomic through `files.writeText` — never a read-modify-write of a shared array. */
export async function writeMessage(convId: string, message: Message): Promise<void> {
  const fields = MessageSchema.parse(message);
  await writeText(messagePath(convId, fields.id), renderMessage({ ...fields, text: message.text }));
}

export async function deleteMessage(convId: string, id: string): Promise<void> {
  await deleteFile(messagePath(convId, id));
}

export async function writeAnnotation(convId: string, annotation: Annotation): Promise<void> {
  const { text, ...rest } = annotation;
  const fields = AnnotationSchema.parse(rest);
  await writeText(annotationPath(convId, fields.id), render(ANNOTATION_ORDER, fields, text));
}
