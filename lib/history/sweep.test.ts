// Decision 64's sweep, against a real checkout. The cases that matter are the two it must NOT
// touch: a message the log knows about, and anything at all when the log cannot be read. A repair
// pass that cannot tell an orphan from a live stream has to do nothing rather than guess, because
// the thing it would "fix" is a reply someone is reading as it arrives.
//
// The orphan itself is made the way a crash makes one: written through `streamingWrite`, which is
// the only path that puts a `streaming` file on disk without a log entry, by a turn that then ends
// without finalizing. A real crash takes the whole process and its in-flight registry with it; in
// one process the nearest thing is the turn releasing its hold on a file that is still streaming,
// which is exactly what makes the registry call it an orphan.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("sweep");
const DATA = checkout.data;

const { streamingWrite, sweepInterruptedMessages } = await import("./streaming.ts");
const { heldByLiveTurn, releaseStreaming, streamingPaths } = await import("./in-flight.ts");
const { INTERRUPTED } = await import("./chat-actions.ts");
const { runBatch } = await import("./batch.ts");
const { saveMessage } = await import("./chat-actions.ts");
const { undoBatch } = await import("./undo.ts");
const { readActions, groupBatches } = await import("./log.ts");
const chats = await import("../store/chats.ts");
const { uuidv7 } = await import("../chat/uuid.ts");

type Message = import("../chat/types.ts").Message;

const CONV = "c_20260907_9f1c";

const message = (id: string, over: Partial<Message> = {}): Message => ({
  schema: 1,
  id,
  parentId: null,
  role: "user",
  status: "streaming",
  createdAt: "2026-09-07T16:01:00-04:00",
  model: null,
  attachments: [],
  refs: [],
  deleted: false,
  error: null,
  text: "why is it transposed?",
  ...over,
});

/** Exactly what a crash leaves: written through the bypass, so nothing recorded it. */
async function abandon(one: Message): Promise<string> {
  const rel = chats.messagePath(CONV, one.id);
  await streamingWrite(rel, chats.renderMessage(one), `crashed-${one.id}`);
  await releaseStreaming([rel]); // the turn is over; the file is not
  return one.id;
}

const read = async (id: string): Promise<Message | undefined> =>
  (await chats.readConversation(CONV)).messages.find((one) => one.id === id);

beforeEach(async () => {
  await checkout.reset({
    setup: () =>
      chats.writeConversation({
        schema: 1,
        id: CONV,
        title: "Change of basis",
        activeLeafId: null,
        pinned: false,
        model: "claude-opus-5",
        context: { file: null, taskIds: [] },
        createdAt: "2026-09-07T16:00:00-04:00",
        updatedAt: "2026-09-07T16:00:00-04:00",
      }),
  });
});

describe("sweepInterruptedMessages", () => {
  it("repairs an abandoned turn to the state §16.3 would have left", async () => {
    const prompt = await abandon(message(uuidv7()));
    const reply = await abandon(
      message(uuidv7(), { parentId: prompt, role: "assistant", text: "The matrix is", model: "claude-opus-5" }),
    );

    expect(await sweepInterruptedMessages()).toEqual({ repaired: 2 });

    // The prompt was written whole in one go, so it is complete; the reply was not.
    expect(await read(prompt)).toMatchObject({ status: "complete", error: null });
    expect(await read(reply)).toMatchObject({ status: "failed", error: INTERRUPTED });
    // And the partial text is kept, which is what makes Retry worth offering.
    expect((await read(reply))?.text).toContain("The matrix is");
  });

  it("records the repair, so nothing is left outside the log", async () => {
    await abandon(message(uuidv7()));
    await sweepInterruptedMessages();

    const batch = (await groupBatches(await readActions())).at(-1);
    expect(batch?.type).toBe("chat.update");
    expect(batch?.summary).toContain("interrupted run");
    expect(checkout.git("status", "--porcelain", "--", "data")).toBe("");
  });

  it("is undoable, like any other batch", async () => {
    const reply = await abandon(message(uuidv7(), { role: "assistant", text: "half" }));
    await sweepInterruptedMessages();
    expect((await read(reply))?.status).toBe("failed");

    const batch = (await groupBatches(await readActions())).at(-1);
    await undoBatch(String(batch?.batch));
    expect((await read(reply))?.status).toBe("streaming");
  });

  it("leaves a message the log knows about alone, whatever its status says", async () => {
    // A finalized message that was somehow written back as `streaming` is not this sweep's
    // business: the log has it, so something recorded it, and guessing would be worse.
    const id = uuidv7();
    await runBatch({
      actor: "user",
      scope: "user",
      summary: "a recorded message",
      commitPrefix: "chat",
      actions: [saveMessage(CONV, message(id, { status: "complete" }))],
    });
    await streamingWrite(chats.messagePath(CONV, id), chats.renderMessage(message(id)), "a-live-turn");

    expect(await sweepInterruptedMessages()).toEqual({ repaired: 0 });
    expect((await read(id))?.status).toBe("streaming");
  });

  it("does nothing at all when there is nothing to do", async () => {
    const before = (await readActions()).length;
    expect(await sweepInterruptedMessages()).toEqual({ repaired: 0 });
    expect((await readActions()).length).toBe(before);
  });

  it("does nothing when the log cannot be read, rather than sweeping everything", async () => {
    const id = await abandon(message(uuidv7()));
    // A log that is present and unparsable is the dangerous case: every message would look
    // orphaned, and repairing a live stream is worse than leaving a dead one.
    await writeFile(path.join(DATA, "history", "actions.jsonl"), "{not json\n");

    expect(await sweepInterruptedMessages()).toEqual({ repaired: 0 });
    expect((await read(id))?.status).toBe("streaming");
  });

  it("skips a message file it cannot parse and repairs the rest", async () => {
    const good = await abandon(message(uuidv7()));
    await mkdir(path.join(DATA, "chats", CONV, "messages"), { recursive: true });
    await writeFile(path.join(DATA, "chats", CONV, "messages", `${uuidv7()}.md`), "---\n: : :\n---\n");

    expect(await sweepInterruptedMessages()).toEqual({ repaired: 1 });
    expect((await read(good))?.status).toBe("complete");
  });

  it("ignores a conversation with no messages directory", async () => {
    await mkdir(path.join(DATA, "chats", "c_20260907_0002"), { recursive: true });
    expect(await sweepInterruptedMessages()).toEqual({ repaired: 0 });
  });

  it("leaves alone a file a live turn in this process still holds", async () => {
    // Nothing recorded it and it says streaming — the exact shape of an orphan — but a turn owns it,
    // so it is a reply still arriving. The registry is what tells the two apart.
    const id = uuidv7();
    await streamingWrite(chats.messagePath(CONV, id), chats.renderMessage(message(id)), "a-live-turn");
    expect(heldByLiveTurn(chats.messagePath(CONV, id))).toBe(true);

    expect(await sweepInterruptedMessages()).toEqual({ repaired: 0 });
    expect((await read(id))?.status).toBe("streaming");
  });

  it("clears the in-flight entries of the orphans it repairs", async () => {
    const id = await abandon(message(uuidv7()));
    const rel = chats.messagePath(CONV, id);
    const held = streamingPaths();
    const head = checkout.git("rev-parse", "HEAD");

    await sweepInterruptedMessages();

    // An entry left in the registry would sit in the exclusion bookkeeping for the life of the
    // process. It is no longer held out of a commit, because there is none: the repair is a `data/`
    // write like any other, logged and undoable and outside git (`batch.ts`).
    expect(streamingPaths()).toBe(held - 1);
    expect((await read(id))?.status).not.toBe("streaming");
    expect(checkout.git("rev-list", "--count", `${head}..HEAD`)).toBe("0");
    expect(checkout.git("ls-files", "--", `data/${rel}`)).toBe("");
  });
});
