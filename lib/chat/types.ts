// Owns: the three record shapes a conversation is made of — PROJECT.md §16.1's `Message` and
// `Conversation`, and §16.4's `Annotation` — as zod schemas with the TypeScript types inferred from
// them, so there is exactly one definition of each rather than an interface and a validator that
// drift apart.
//
// It sits in `lib/chat/` rather than in the store because both sides need it and only one of them
// can touch a filesystem (Decision 30). `lib/store/chats.ts` imports these to parse files; the
// client imports the types to render them. A client that imported the store instead would be
// pulling `node:fs` into a browser bundle to learn what a message looks like.
//
// Frontmatter keys are these field names exactly, camelCase, with no mapping layer (Decision 40) —
// with one deliberate exception per record: `text` on a message and `text` on an annotation are the
// file's *body*, not a frontmatter key, because a message is prose with a header and storing prose
// inside YAML would quote and re-wrap it.
//
// Failure behavior: nothing here does I/O. A schema that rejects a file is the store's problem to
// report; these are defaults and shapes, and every optional field has a default so a hand-edited
// file missing a key still loads rather than costing someone a message.

import { z } from "zod";

export type MessageId = string;

/** §16.1. `text` is the file body; everything else is frontmatter. */
export const MessageSchema = z.looseObject({
  schema: z.number().int().default(1),
  id: z.string(),
  parentId: z.string().nullable().default(null),
  role: z.enum(["user", "assistant"]),
  status: z.enum(["streaming", "complete", "failed"]).default("complete"),
  createdAt: z.string(),
  model: z.string().nullable().default(null),
  /** Paths relative to the conversation directory (§4.7). */
  attachments: z.array(z.string()).default([]),
  /** Task ids and `data/` paths found in the text at finalize (§16.9). */
  refs: z.array(z.string()).default([]),
  deleted: z.boolean().default(false),
  /** Set only when `status` is `failed`; `"stopped"` when the user stopped the stream (§16.3). */
  error: z.string().nullable().default(null),
});

export type MessageFields = z.infer<typeof MessageSchema>;

export interface Message extends MessageFields {
  /** The message body, verbatim markdown. */
  text: string;
}

/** §4.7. The body of `conversation.md` is empty; all of it is frontmatter. */
export const ConversationSchema = z.looseObject({
  schema: z.number().int().default(1),
  id: z.string(),
  // An empty title is written as a bare `title:` key, which YAML reads back as null — so the two
  // spellings of "no title yet" both have to land on the empty string, or a conversation that has
  // not been named yet fails to load the moment it is read back. Found by the first send.
  title: z.string().nullish().transform((value) => value ?? ""),
  /** The entire branch state (§16.1). Last-write-wins; there are no concurrent writers (§16.0). */
  activeLeafId: z.string().nullable().default(null),
  pinned: z.boolean().default(false),
  model: z.string(),
  /** What this conversation is about (§16.9): a document, some tasks, or neither. */
  context: z
    .looseObject({
      file: z.string().nullable().default(null),
      taskIds: z.array(z.string()).default([]),
    })
    .default({ file: null, taskIds: [] }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Conversation = z.infer<typeof ConversationSchema>;

/**
 * The conversation file *is* the listing entry: messages are separate files, so nothing has to be
 * read or counted to show a conversation in the Chats panel. Named separately because §5 names it,
 * and because a later phase may want a count here without every caller of `readConversation`
 * inheriting it.
 */
export type ConversationMeta = Conversation;

/** §16.4. `text` is the file body; the anchor is frontmatter. */
export const AnnotationSchema = z.looseObject({
  schema: z.number().int().default(1),
  id: z.string(),
  kind: z.enum(["note", "comment"]),
  targetMessageId: z.string(),
  // A note anchors to a quotation: the text itself, its neighbours, and where it was.
  quote: z.string().nullable().default(null),
  prefix: z.string().nullable().default(null),
  suffix: z.string().nullable().default(null),
  charOffset: z.number().nullable().default(null),
  // A comment anchors to a position: the text under the pointer, and a fraction of the box.
  anchorText: z.string().nullable().default(null),
  offsetRatio: z.number().nullable().default(null),
  /** Private marginalia unless this is true (§16.0 rule 5). */
  includeInContext: z.boolean().default(false),
  deleted: z.boolean().default(false),
  createdAt: z.string(),
});

export type AnnotationFields = z.infer<typeof AnnotationSchema>;

export interface Annotation extends AnnotationFields {
  /** The annotation's own text. */
  text: string;
}

/**
 * §6.3's record of a knowledge write that applied itself during a turn, as the transcript shows it
 * under the reply that made it. Not a file: it is read from the action log by
 * `lib/history/auto-applied.ts`, and lives here so a component can know its shape without importing
 * `lib/history/` (§3).
 */
export interface AutoApplied {
  batch: string;
  /** The assistant message the write belongs to. */
  message: string;
  path: string;
  lines: number;
  summary: string;
}
