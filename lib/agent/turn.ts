// Owns: PROJECT.md §13.2's `runChatTurn` — one turn of a real conversation, from the optimistic
// message files to the single batch that finalizes them. `lib/agent/chat.ts` owns the model half
// (`streamModelTurn`); this file owns everything about that loop touching disk.
//
// The order is §16.3's, and each step is there for a stated reason:
//
//   1. Write both message files, **neither committed**, so a crash mid-turn leaves what was said.
//   2. Stream. Deltas reach the assistant file at most every 500 ms and on every tool round (§8),
//      through `history.streamingWrite`, which is the one write in this app that skips the log.
//   3. End in exactly one place. `finalizeTurn` decides `complete` or `failed` from how the loop
//      exited and writes both messages, the leaf move and the title as **one** `chat.message`
//      batch — so one undo removes a whole exchange and one commit covers it (§16.3, §15).
//   4. Only then, and only for a turn that completed, §6.3's one auto-applied knowledge write, as a
//      batch of its own (`auto-apply.ts`), so undoing the memory never undoes the reply.
//
// **A message on disk that is not in the log is always `status: streaming`.** That is the invariant
// the `streamingWrite` guard enforces, and it is why the user's message is written `streaming` too
// and only becomes `complete` in the finalizing batch. §16.3 describes writing it `complete`
// immediately; the final state on disk is identical either way, and this ordering means a process
// killed mid-turn leaves two files that both say plainly that the turn never finished, rather than
// one that claims to be complete while nothing recorded it.
//
// Failure behavior: a refusal **before any delta** deletes both files and reports — nothing was
// said, so nothing is kept, and the client puts the text back in the composer (§13.5). A failure
// **after** deltas keeps the partial text, marks the message `failed` with its reason, and commits:
// a stopped or broken reply is still something that happened. A stop is that same path with
// `error: "stopped"`. `finalizeTurn` is the only place any of this is decided, which is what §16.3
// means by one finality contract.

import { streamingWrite } from "../history/streaming.ts";
import { releaseStreaming } from "../history/in-flight.ts";
import { activePath, buildTree } from "../chat/tree.ts";
import { messagePath, readConversation, renderMessage } from "../store/chats.ts";
import { readSettings } from "../store/settings.ts";
import { StoreError } from "../store/paths.ts";
import { nowIso } from "../schedule/dates.ts";
import { assembleContext } from "./context.ts";
import { streamModelTurn } from "./chat.ts";
import type { TurnEvent } from "./chat.ts";
import { attachmentsFor } from "./attachments.ts";
import { discard, finalizeTurn } from "./finalize.ts";
import type { Started } from "./finalize.ts";
import { autoApply } from "./auto-apply.ts";
import type { ProposedWrite } from "./memory.ts";
import type { Effort, ProviderMessage } from "./registry.ts";
import type { Annotation, Message } from "../chat/types.ts";

export type { TurnEvent } from "./chat.ts";

/** §8: streaming text reaches disk at most this often, plus once per tool round. */
const FLUSH_MS = 500;

/**
 * The accumulating text of every turn currently running, exactly as §16.3 describes it, and
 * **cleared on every terminal path** — the `finally` below is the only exit. §16.8 lists leaking
 * these among the things not to reproduce, and it is the one item on that list that leaves no
 * visible trace when it happens, so it is observable instead: `activeStreams()` is what a check
 * reads after a send, a failure, a stop and a navigate-away.
 */
const buffers = new Map<string, string>();

export const activeStreams = (): number => buffers.size;

export interface ChatTurnInput {
  conversationId: string;
  /** Absent when regenerating: an assistant sibling with no new prompt in front of it (§16.2). */
  userMessage?: { id: string; text: string; attachments?: string[] };
  assistantMessageId: string;
  /**
   * Where to hang the new message. Undefined means the conversation's current leaf, which is an
   * ordinary send; an explicit value is an edit, a regenerate, or a branch from here.
   */
  parentId?: string | null;
  mode: "ask" | "tasks";
  model?: string;
  effort?: Effort;
  signal: AbortSignal;
}

const now = async (): Promise<string> => nowIso((await readSettings()).timezone);

function draftMessage(
  id: string,
  parentId: string | null,
  role: Message["role"],
  createdAt: string,
  over: Partial<Message> = {},
): Message {
  return {
    schema: 1,
    id,
    parentId,
    role,
    status: "streaming",
    createdAt,
    model: null,
    attachments: [],
    refs: [],
    deleted: false,
    error: null,
    text: "",
    ...over,
  };
}

/**
 * The conversation so far, as the provider wants it. Annotations the user marked
 * `includeInContext` ride along as a trailing note on the turn they anchor to (§13.2); the rest
 * are private marginalia and never leave the app (§16.0 rule 5).
 */
export function toProviderMessages(path: Message[], annotations: Annotation[]): ProviderMessage[] {
  const shared = annotations.filter((one) => one.includeInContext && !one.deleted);

  return path
    .filter((message) => message.text.trim().length > 0)
    .map((message) => {
      const notes = shared
        .filter((one) => one.targetMessageId === message.id)
        .map((one) => `\n\n[note from the user on this message: ${one.text.trim()}]`)
        .join("");
      return {
        role: message.role,
        content: [{ type: "text" as const, text: message.text + notes }],
      };
    });
}

/** Step 1: both files on disk, uncommitted, and the prompt the provider will be given. */
async function start(input: ChatTurnInput): Promise<Started> {
  const { conversation, messages, annotations } = await readConversation(input.conversationId);

  // Amendment `o`. Before the first file is written, because a model that cannot read the
  // attachment refuses the send and §16.3 wants that refusal to leave nothing behind.
  const files = await attachmentsFor(input.model ?? conversation.model, input.userMessage?.attachments ?? []);

  const createdAt = await now();
  const parentId = input.parentId === undefined ? conversation.activeLeafId : input.parentId;

  const user =
    input.userMessage === undefined
      ? null
      : draftMessage(input.userMessage.id, parentId, "user", createdAt, {
          text: input.userMessage.text,
          attachments: input.userMessage.attachments ?? [],
        });

  const assistant = draftMessage(
    input.assistantMessageId,
    user === null ? parentId : user.id,
    "assistant",
    createdAt,
    { model: input.model ?? conversation.model },
  );

  if (user !== null) await write(input, user);
  await write(input, assistant);

  const tree = buildTree(user === null ? messages : [...messages, user]);
  const path = activePath(tree, user === null ? parentId : user.id);
  const prompt = toProviderMessages(path, annotations);

  // The files ride on the last user turn, which is the one they were attached to. They are not
  // built inside `toProviderMessages` because that function shapes the whole conversation and is
  // pure and synchronous; reading bytes is not part of shaping it.
  const last = prompt[prompt.length - 1];
  if (files.length > 0 && last !== undefined && last.role === "user") {
    last.content = [...last.content, ...files];
  }

  return { conversation, user, assistant, messages: prompt };
}

/** A streaming write owned by this turn, which is named by its assistant message (in-flight.ts). */
const write = (input: ChatTurnInput, message: Message): Promise<void> =>
  streamingWrite(
    messagePath(input.conversationId, message.id),
    renderMessage(message),
    input.assistantMessageId,
  );

export async function* runChatTurn(input: ChatTurnInput): AsyncIterable<TurnEvent> {
  // Known from the input before `start` writes either file, so a throw anywhere — `start` and
  // `assembleContext` included, which run before the loop's own `try` — still releases them.
  const held = [input.userMessage?.id, input.assistantMessageId]
    .filter((id): id is string => id !== undefined)
    .map((id) => messagePath(input.conversationId, id));
  try {
    yield* turn(input);
  } finally {
    // Every exit, including an abort and a throw: a path left held is excluded from every later
    // commit (lib/history/in-flight.ts).
    await releaseStreaming(held);
  }
}

async function* turn(input: ChatTurnInput): AsyncIterable<TurnEvent> {
  const started = await start(input);
  const { system } = await assembleContext({
    mode: input.mode,
    ...(started.conversation.context.file === null ? {} : { openFile: started.conversation.context.file }),
    ...(started.conversation.context.taskIds.length === 0
      ? {}
      : { taskIds: started.conversation.context.taskIds }),
  });

  buffers.set(input.assistantMessageId, "");
  let flushedAt = Date.now();
  let failure: { message: string; code: string } | null = null;
  // Knowledge proposals wait for the end: which one may apply itself is decided only once the turn
  // is known to have been kept (§6.3), and a card for a write that then applied itself would be a
  // card for something already done.
  const writes: ProposedWrite[] = [];

  const flush = async (force: boolean): Promise<void> => {
    const text = buffers.get(input.assistantMessageId) ?? "";
    if (!force && Date.now() - flushedAt < FLUSH_MS) return;
    flushedAt = Date.now();
    await write(input, { ...started.assistant, text });
  };

  try {
    for await (const event of streamModelTurn({
      mode: input.mode,
      model: input.model ?? started.conversation.model,
      ...(input.effort === undefined ? {} : { effort: input.effort }),
      system,
      messages: started.messages,
      signal: input.signal,
    })) {
      if (event.type === "delta") {
        buffers.set(input.assistantMessageId, (buffers.get(input.assistantMessageId) ?? "") + event.text);
        await flush(false);
      } else if (event.type === "tool") {
        await flush(true); // §8: a tool round is always a flush point
      } else if (event.type === "error") {
        failure = { message: event.message, code: event.code };
      } else if (event.type === "proposal" && event.proposal.kind === "knowledge") {
        writes.push(...event.proposal.writes);
        continue;
      }
      yield event;
    }

    const text = buffers.get(input.assistantMessageId) ?? "";

    // §16.3: rejected before any delta → the files never existed as far as anything is concerned.
    if (failure !== null && text.length === 0) {
      await discard(input, started);
      return;
    }

    // §16.3: a stop is a failure whose reason is exactly `stopped`, which is what the UI reads to
    // offer Retry rather than reporting an error nobody caused.
    await finalizeTurn(
      input,
      started,
      text,
      failure === null ? null : { message: failure.code === "aborted" ? "stopped" : failure.message },
    );

    // §6.3, after the turn's own batch and only for a turn that completed. Never throws: a refused
    // auto-apply comes back as a card among the rest.
    const { applied, rest } =
      failure === null
        ? await autoApply(input.conversationId, input.assistantMessageId, writes)
        : { applied: null, rest: writes };
    if (applied !== null) yield { type: "applied", applied };
    if (rest.length > 0) yield { type: "proposal", proposal: { kind: "knowledge", writes: rest } };
  } catch (err) {
    // A throw from the store or from `runBatch` — a refused credential is the one that happens
    // (§7.1 step 3). The files are already rolled back by `runBatch`; anything still on disk here
    // was never logged, so it goes too, and the caller shows the reason next to the typed text.
    await discard(input, started).catch(() => undefined);
    // The code travels so §13.5 can route it: a refused credential is `secret_rejected` and belongs
    // inline beside the text that is still in the box, not in a toast (Decision 50).
    const code = err instanceof StoreError ? err.code : "error";
    yield { type: "error", message: (err as Error).message, code };
  } finally {
    buffers.delete(input.assistantMessageId);
  }
}
