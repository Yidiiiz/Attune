// The §15 chat items, at the library level, against a real git checkout and the scripted provider —
// so the path under test is the one the app runs: `providerFor` picks the script because
// `ATTUNE_FAKE_PROVIDER` is set, and everything after that is production code. The browser half of
// the same list is `e2e/chat.spec.ts`.
//
// Each case ends by asserting `activeStreams()` is zero. That is the Phase 6a condition 8 check on
// the server side: §16.8 lists leaking stream buffers among the things not to reproduce, and it is
// the one item on that list with no visible symptom. `streamingPaths()` beside it is the same check
// for the in-flight registry, whose leak would be just as quiet: a path excluded from every commit.

import { beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("turn");
const { git } = checkout;

process.env.ATTUNE_FAKE_PROVIDER = "1";

const { runChatTurn, activeStreams } = await import("./turn.ts");
const { titleFrom } = await import("./finalize.ts");
const { streamingPaths } = await import("../history/in-flight.ts");
const chats = await import("../store/chats.ts");
const { readActions, groupBatches } = await import("../history/log.ts");
const { uuidv7 } = await import("../chat/uuid.ts");
const { buildTree, activePath } = await import("../chat/tree.ts");

type TurnEvent = import("./chat.ts").TurnEvent;

const CONV = "c_20260907_9f1c";

/** Drain a turn, collecting what it emitted. */
async function drain(
  input: Parameters<typeof runChatTurn>[0],
  onDelta?: (controller: AbortController) => void,
  controller?: AbortController,
): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const event of runChatTurn(input)) {
    events.push(event);
    if (event.type === "delta" && onDelta && controller) onDelta(controller);
  }
  return events;
}

const send = async (text: string, over: Partial<Parameters<typeof runChatTurn>[0]> = {}) => {
  const controller = new AbortController();
  const userId = uuidv7();
  const assistantId = uuidv7();
  const events = await drain({
    conversationId: CONV,
    userMessage: { id: userId, text },
    assistantMessageId: assistantId,
    mode: "ask",
    signal: controller.signal,
    ...over,
  });
  return { events, userId, assistantId };
};

const batches = async () => groupBatches(await readActions());

beforeEach(async () => {
  await checkout.reset({
    setup: () =>
      chats.writeConversation({
        schema: 1,
        id: CONV,
        title: "",
        activeLeafId: null,
        pinned: false,
        model: "claude-opus-5",
        context: { file: null, taskIds: [] },
        createdAt: "2026-09-07T16:00:00-04:00",
        updatedAt: "2026-09-07T16:00:00-04:00",
      }),
  });
});

describe("a send that succeeds", () => {
  it("finalizes both messages, moves the leaf, and names the conversation", async () => {
    const { events, userId, assistantId } = await send("why is the matrix transposed?");

    expect(events.filter((e) => e.type === "delta").length).toBeGreaterThan(1);
    expect(events.at(-1)).toMatchObject({ type: "done" });

    const { conversation, messages } = await chats.readConversation(CONV);
    expect(messages).toHaveLength(2);
    expect(messages.find((m) => m.id === userId)).toMatchObject({ status: "complete", role: "user" });
    expect(messages.find((m) => m.id === assistantId)).toMatchObject({
      status: "complete",
      role: "assistant",
      model: "claude-opus-5",
      error: null,
    });
    expect(conversation.activeLeafId).toBe(assistantId);
    expect(conversation.title).toBe("why is the matrix transposed?");
    expect(activeStreams()).toBe(0);
    expect(streamingPaths()).toBe(0);
  });

  it("commits the exchange as one batch, which one undo would remove whole", async () => {
    await send("first question");
    const chatBatches = (await batches()).filter((batch) => batch.type === "chat.message");
    expect(chatBatches).toHaveLength(1);
    expect(chatBatches[0].entries).toHaveLength(3); // two messages and the leaf move
  });

  it("produces one commit per finalized exchange across three branches", async () => {
    // Counted from where this case started: the sandbox's history carries the other cases' commits.
    const from = git("rev-parse", "HEAD");
    const first = await send("branch one");
    const second = await send("branch two", { parentId: null });
    const third = await send("branch three", { parentId: null });

    const log = git("log", "--oneline", `${from}..HEAD`, "--", `data/chats/${CONV}`).split("\n");
    expect(log.filter((line) => line.includes("chat:"))).toHaveLength(3);

    const { messages } = await chats.readConversation(CONV);
    const tree = buildTree(messages);
    expect(tree.children.get(null)).toHaveLength(3);
    expect(activePath(tree, third.assistantId).map((m) => m.id)).toEqual([
      third.userId,
      third.assistantId,
    ]);
    expect(first.assistantId).not.toBe(second.assistantId);
  });

  it("stores the refs a reply mentions", async () => {
    await send("look at [the note](knowledge/notes/a.md)");
    const { messages } = await chats.readConversation(CONV);
    // The scripted reply echoes the prompt, so the link comes back in the assistant text too.
    expect(messages[1].refs).toContain("knowledge/notes/a.md");
  });
});

describe("a send the provider rejects before any delta", () => {
  it("leaves no message file, no log entry and no commit", async () => {
    const before = (await batches()).length;
    const { events } = await send("[[auth]] anything");

    expect(events.at(-1)).toMatchObject({ type: "error", code: "auth" });
    expect((await chats.readConversation(CONV)).messages).toEqual([]);
    expect((await batches()).length).toBe(before);
    expect(activeStreams()).toBe(0);
    expect(streamingPaths()).toBe(0);
  });

  it("does the same for an unreachable provider", async () => {
    const { events } = await send("[[fail]] anything");
    expect(events.at(-1)).toMatchObject({ type: "error", code: "provider" });
    expect((await chats.readConversation(CONV)).messages).toEqual([]);
    expect(activeStreams()).toBe(0);
    expect(streamingPaths()).toBe(0);
  });
});

describe("a failure after deltas", () => {
  it("marks the message failed, keeps the partial text, and commits", async () => {
    const { assistantId } = await send("[[fail-late]] tell me about it");

    const { messages } = await chats.readConversation(CONV);
    const assistant = messages.find((m) => m.id === assistantId);
    expect(assistant?.status).toBe("failed");
    expect(assistant?.error).toContain("fail mid-answer");
    expect(assistant?.text.length).toBeGreaterThan(0);
    expect((await batches()).some((batch) => batch.type === "chat.message")).toBe(true);
    expect(activeStreams()).toBe(0);
    expect(streamingPaths()).toBe(0);
  });

  it("is never recorded as complete, which is the §15 item", async () => {
    const { assistantId } = await send("[[fail-late]] again");
    const { messages } = await chats.readConversation(CONV);
    expect(messages.find((m) => m.id === assistantId)?.status).not.toBe("complete");
  });
});

describe("stopping", () => {
  it("marks the message failed with `stopped` and keeps what arrived", async () => {
    const controller = new AbortController();
    const assistantId = uuidv7();
    await drain(
      {
        conversationId: CONV,
        userMessage: { id: uuidv7(), text: "[[slow]] keep going" },
        assistantMessageId: assistantId,
        mode: "ask",
        signal: controller.signal,
      },
      (ctl) => ctl.abort(),
      controller,
    );

    const assistant = (await chats.readConversation(CONV)).messages.find((m) => m.id === assistantId);
    expect(assistant?.status).toBe("failed");
    expect(assistant?.error).toBe("stopped");
    expect(assistant?.text.length).toBeGreaterThan(0);
    expect(activeStreams()).toBe(0);
    expect(streamingPaths()).toBe(0);
  });
});

describe("regenerating", () => {
  it("appends an assistant sibling with no new prompt in front of it", async () => {
    const { userId, assistantId } = await send("why?");
    const second = uuidv7();
    await drain({
      conversationId: CONV,
      assistantMessageId: second,
      parentId: userId,
      mode: "ask",
      signal: new AbortController().signal,
    });

    const { conversation, messages } = await chats.readConversation(CONV);
    const tree = buildTree(messages);
    expect(tree.children.get(userId)).toEqual([assistantId, second]);
    expect(conversation.activeLeafId).toBe(second);
    expect(activeStreams()).toBe(0);
    expect(streamingPaths()).toBe(0);
  });
});

describe("a credential in the prompt", () => {
  it("is refused, and nothing at all is written", async () => {
    const before = (await batches()).length;
    // Spelled the way `lib/security/secrets.test.ts` spells one: assembled at runtime, so the
    // source file this checks the refusal with is not itself a file the hook would refuse.
    const shaped = "sk" + "-ant-" + "a".repeat(40);
    const { events } = await send(`here is my key ${shaped}`);

    expect(events.at(-1)).toMatchObject({ type: "error", code: "secret_rejected" });
    expect((await chats.readConversation(CONV)).messages).toEqual([]);
    expect((await batches()).length).toBe(before);
    expect(activeStreams()).toBe(0);
    expect(streamingPaths()).toBe(0);
  });
});

describe("tool rounds", () => {
  it("runs a read-only tool and then answers", async () => {
    const { events } = await send("[[tool]] what is on today?", { mode: "tasks" });
    expect(events.some((e) => e.type === "tool" && e.name === "list_tasks")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "done" });
    expect(activeStreams()).toBe(0);
    expect(streamingPaths()).toBe(0);
  });
});

describe("titleFrom", () => {
  it("shortens a first message and says so", () => {
    expect(titleFrom("pset 4 due friday")).toBe("pset 4 due friday");
    expect(titleFrom("one two three four five six seven eight")).toBe("one two three four five six seven…");
    expect(titleFrom("**bold** _thoughts_")).toBe("bold thoughts");
  });

  it("names the fallback rather than leaving a conversation blank", () => {
    expect(titleFrom("")).toBe("Untitled conversation");
    expect(titleFrom("```\ncode only\n```")).toBe("Untitled conversation");
  });
});
