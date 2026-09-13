// The builders through `runBatch`, against a temp checkout — because what is worth checking is not
// that they write a file but that their snapshots describe the write well enough to undo it. Every
// case here ends by undoing and asserting the tree is back where it started.
//
// The builders' own batches are `commit: false`: git is exercised by the Phase 2 checks and by
// Stage B's routes, and is not what these are about. That is also why the log is read directly
// rather than through the history UI. **Undo is not `commit: false`**, and that is why this file
// has a repository of its own: it once ran without one, git's discovery climbed out of the temp
// directory, and every undo here committed into a repository in the home folder. The shared
// checkout (`lib/testing/checkout.ts`) is what makes that impossible to repeat by omission.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("chat-actions");
const DATA = checkout.data;

const actions = await import("./chat-actions.ts");
const { runBatch } = await import("./batch.ts");
const { undoBatch } = await import("./undo.ts");
const { readActions } = await import("./log.ts");
const chats = await import("../store/chats.ts");
const { uuidv7 } = await import("../chat/uuid.ts");
const { StoreError } = await import("../store/paths.ts");

type Conversation = import("../chat/types.ts").Conversation;
type Message = import("../chat/types.ts").Message;

const CONV = "c_20260907_9f1c";

const conversation = (over: Partial<Conversation> = {}): Conversation => ({
  schema: 1,
  id: CONV,
  title: "Change of basis",
  activeLeafId: null,
  pinned: false,
  model: "claude-opus-5",
  context: { file: null, taskIds: [] },
  createdAt: "2026-09-07T16:00:00-04:00",
  updatedAt: "2026-09-07T16:00:00-04:00",
  ...over,
});

const message = (id: string, over: Partial<Message> = {}): Message => ({
  schema: 1,
  id,
  parentId: null,
  role: "user",
  status: "complete",
  createdAt: "2026-09-07T16:01:00-04:00",
  model: null,
  attachments: [],
  refs: [],
  deleted: false,
  error: null,
  text: "why is it transposed?",
  ...over,
});

const run = (summary: string, ...specs: Parameters<typeof runBatch>[0]["actions"]) =>
  runBatch({ actor: "user", scope: "user", summary, commitPrefix: "chat", commit: false, actions: specs });

/** Start a conversation with one exchange in it, and hand back the two message ids. */
async function seeded(): Promise<{ user: string; assistant: string }> {
  const user = uuidv7();
  const assistant = uuidv7();
  await run("Start a conversation", actions.createConversation(conversation()));
  await run(
    "Reply",
    actions.saveMessage(CONV, message(user)),
    actions.saveMessage(CONV, message(assistant, { parentId: user, role: "assistant", text: "Because." })),
  );
  await run("Move the leaf", actions.updateConversation(CONV, { activeLeafId: assistant }));
  return { user, assistant };
}

beforeEach(async () => {
  await checkout.reset({ from: "empty" });
});

describe("createConversation", () => {
  it("writes conversation.md and undoes to nothing", async () => {
    const { batch } = await run("Start a conversation", actions.createConversation(conversation()));
    expect((await chats.readConversation(CONV)).conversation.title).toBe("Change of basis");

    await undoBatch(batch);
    await expect(chats.readConversation(CONV)).rejects.toBeInstanceOf(StoreError);
  });

  it("names the conversation in its summary, which becomes the commit subject", async () => {
    await run("Start a conversation", actions.createConversation(conversation()));
    const entry = (await readActions()).at(-1);
    expect(entry?.type).toBe("chat.create");
    expect(entry?.summary).toBe("Start 'Change of basis'");
  });
});

describe("saveMessage", () => {
  it("puts both halves of a turn in one batch, and one undo removes both", async () => {
    const { user, assistant } = await seeded();
    expect((await chats.readConversation(CONV)).messages).toHaveLength(2);

    const turn = (await readActions()).filter((entry) => entry.type === "chat.message");
    expect(turn).toHaveLength(2);
    expect(turn[0].batch).toBe(turn[1].batch);

    await undoBatch(turn[0].batch);
    const { messages } = await chats.readConversation(CONV);
    expect(messages).toHaveLength(0);
    expect([user, assistant]).toHaveLength(2); // both ids were minted; neither file survives
  });

  it("restores the previous text when a message is rewritten", async () => {
    const { assistant } = await seeded();
    const { batch } = await run(
      "Rewrite",
      actions.saveMessage(CONV, message(assistant, { parentId: null, role: "assistant", text: "Rewritten." })),
    );

    const rel = path.join(DATA, chats.messagePath(CONV, assistant));
    expect(await readFile(rel, "utf8")).toContain("Rewritten.");
    await undoBatch(batch);
    expect(await readFile(rel, "utf8")).toContain("Because.");
  });
});

describe("updateConversation", () => {
  it("moves the leaf as an ordinary logged action, and undo moves it back", async () => {
    const { assistant } = await seeded();
    expect((await chats.readConversation(CONV)).conversation.activeLeafId).toBe(assistant);

    const move = (await readActions()).filter((entry) => entry.type === "chat.update").at(-1);
    expect(move).toBeDefined();
    await undoBatch(String(move?.batch));
    expect((await chats.readConversation(CONV)).conversation.activeLeafId).toBeNull();
  });
});

describe("removeMessage", () => {
  it("refuses a message that has replies under it, and writes nothing", async () => {
    const { user } = await seeded();
    await expect(run("Delete", actions.removeMessage(CONV, user))).rejects.toBeInstanceOf(StoreError);
    expect((await chats.readConversation(CONV)).messages).toHaveLength(2);
  });

  it("soft-deletes a complete leaf, keeping the body, and moves the leaf to its parent", async () => {
    const { user, assistant } = await seeded();
    const { batch } = await run("Delete", actions.removeMessage(CONV, assistant));

    const { conversation: back, messages } = await chats.readConversation(CONV);
    const deleted = messages.find((m) => m.id === assistant);
    expect(deleted?.deleted).toBe(true);
    expect(deleted?.text).toContain("Because.");
    expect(back.activeLeafId).toBe(user);

    await undoBatch(batch);
    const after = await chats.readConversation(CONV);
    expect(after.messages.find((m) => m.id === assistant)?.deleted).toBe(false);
    expect(after.conversation.activeLeafId).toBe(assistant);
  });

  it("hard-deletes a failed leaf, because it never held content worth keeping", async () => {
    const { user } = await seeded();
    const failed = uuidv7();
    await run(
      "Failed reply",
      actions.saveMessage(
        CONV,
        message(failed, { parentId: user, role: "assistant", status: "failed", error: "stopped", text: "" }),
      ),
    );

    const { batch } = await run("Discard", actions.removeMessage(CONV, failed));
    expect((await chats.readConversation(CONV)).messages.some((m) => m.id === failed)).toBe(false);

    await undoBatch(batch);
    expect((await chats.readConversation(CONV)).messages.some((m) => m.id === failed)).toBe(true);
  });
});

describe("removeConversation", () => {
  it("takes every file in one batch and undo puts them all back", async () => {
    const { assistant } = await seeded();
    const note = uuidv7();
    await run(
      "Annotate",
      actions.saveAnnotation(CONV, {
        schema: 1,
        id: note,
        kind: "note",
        targetMessageId: assistant,
        quote: "Because.",
        prefix: null,
        suffix: null,
        charOffset: 0,
        anchorText: null,
        offsetRatio: null,
        includeInContext: false,
        deleted: false,
        createdAt: "2026-09-07T16:05:00-04:00",
        text: "ask in office hours",
      }),
    );

    const { batch, targets } = await run("Delete the conversation", actions.removeConversation(CONV));
    expect(targets).toHaveLength(4); // conversation.md, two messages, one annotation
    await expect(chats.readConversation(CONV)).rejects.toBeInstanceOf(StoreError);

    await undoBatch(batch);
    const back = await chats.readConversation(CONV);
    expect(back.messages).toHaveLength(2);
    expect(back.annotations).toHaveLength(1);
    expect(back.annotations[0].text).toBe("ask in office hours");
  });
});

describe("saveAnnotation", () => {
  it("round-trips a soft delete, which is how an annotation is removed", async () => {
    const { assistant } = await seeded();
    const note = uuidv7();
    const base = {
      schema: 1,
      id: note,
      kind: "note" as const,
      targetMessageId: assistant,
      quote: "Because.",
      prefix: null,
      suffix: null,
      charOffset: 0,
      anchorText: null,
      offsetRatio: null,
      includeInContext: false,
      createdAt: "2026-09-07T16:05:00-04:00",
      text: "ask in office hours",
    };

    await run("Annotate", actions.saveAnnotation(CONV, { ...base, deleted: false }));
    const { batch } = await run("Remove", actions.saveAnnotation(CONV, { ...base, deleted: true }));
    expect((await chats.readConversation(CONV)).annotations[0].deleted).toBe(true);

    await undoBatch(batch);
    expect((await chats.readConversation(CONV)).annotations[0].deleted).toBe(false);
  });
});
