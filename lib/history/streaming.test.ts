// The guard is the whole module, so the guard is the whole test. `streamingWrite` is the one write
// path in this app that reaches `data/` without a log entry or a commit (§8), and every case below
// is a way that hole could widen: a path outside `chats/`, a message that is no longer streaming, a
// name that is not a message id, an attempt to reach the action log itself.
//
// Runs against a temp checkout through `ATTUNE_REPO_DIR`, set before `paths.ts` loads.

import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const SANDBOX = await mkdtemp(path.join(tmpdir(), "attune-streaming-"));
const DATA = path.join(SANDBOX, "data");

process.env.ATTUNE_REPO_DIR = SANDBOX;

const { streamingWrite } = await import("./streaming.ts");
const { StoreError } = await import("../store/paths.ts");
const { renderMessage } = await import("../store/chats.ts");
const { uuidv7 } = await import("../chat/uuid.ts");

type Message = import("../chat/types.ts").Message;

const ID = uuidv7();
const REL = `chats/c_20260907_9f1c/messages/${ID}.md`;

function message(over: Partial<Message> = {}): Message {
  return {
    schema: 1,
    id: ID,
    parentId: null,
    role: "assistant",
    status: "streaming",
    createdAt: "2026-09-07T16:01:12.410-04:00",
    model: "claude-opus-5",
    attachments: [],
    refs: [],
    deleted: false,
    error: null,
    text: "The change of ba",
    ...over,
  };
}

const refuses = async (rel: string, content: string): Promise<string> => {
  try {
    await streamingWrite(rel, content, "a-turn");
  } catch (err) {
    expect(err).toBeInstanceOf(StoreError);
    return (err as InstanceType<typeof StoreError>).message;
  }
  throw new Error(`streamingWrite accepted ${rel}, which it must not`);
};

beforeEach(async () => {
  await rm(DATA, { recursive: true, force: true });
  await mkdir(DATA, { recursive: true });
});

describe("streamingWrite", () => {
  it("writes a streaming message, and writes it whole", async () => {
    const content = renderMessage(message());
    await streamingWrite(REL, content, "a-turn");
    expect(await readFile(path.join(DATA, REL), "utf8")).toBe(content);
  });

  it("keeps writing as the text grows, which is the case it exists for", async () => {
    await streamingWrite(REL, renderMessage(message()), "a-turn");
    await streamingWrite(REL, renderMessage(message({ text: "The change of basis matrix" })), "a-turn");
    expect(await readFile(path.join(DATA, REL), "utf8")).toContain("The change of basis matrix");
  });

  it("refuses a message that has finished, because that one belongs in a batch", async () => {
    const message_ = renderMessage(message({ status: "complete", text: "done" }));
    expect(await refuses(REL, message_)).toContain("only a message still streaming");
  });

  it("refuses a failed message for the same reason", async () => {
    const failed = renderMessage(message({ status: "failed", error: "stopped" }));
    expect(await refuses(REL, failed)).toContain("only a message still streaming");
  });

  it("refuses content with no status at all", async () => {
    expect(await refuses(REL, "---\nid: x\n---\nbody\n")).toContain("only a message still streaming");
  });

  it("refuses any path that is not a chat message", async () => {
    const content = renderMessage(message());
    for (const rel of [
      "tasks/2026-09-10-pset-4.md",
      "history/actions.jsonl",
      "knowledge/profile/habits.md",
      `chats/c_20260907_9f1c/conversation.md`,
      `chats/c_20260907_9f1c/annotations/${ID}.md`,
      `chats/c_20260907_9f1c/messages/${ID}.txt`,
      `chats/c_20260907_9f1c/messages/notes.md`,
      `chats/../tasks/${ID}.md`,
    ]) {
      expect(await refuses(rel, content)).toContain("streaming write path exists only for");
    }
  });

  it("refuses a second turn writing a file another turn is streaming into", async () => {
    const rel = `chats/c_20260907_9f1c/messages/${uuidv7()}.md`;
    await streamingWrite(rel, renderMessage(message()), "turn-a");
    try {
      await streamingWrite(rel, renderMessage(message()), "turn-b");
      throw new Error("a second turn was allowed to write a held file");
    } catch (err) {
      expect(err).toBeInstanceOf(StoreError);
      expect((err as Error).message).toContain("already being streamed by turn turn-a");
    }
  });

  it("writes nothing when it refuses", async () => {
    await refuses("tasks/2026-09-10-pset-4.md", renderMessage(message()));
    await expect(readFile(path.join(DATA, "tasks", "2026-09-10-pset-4.md"), "utf8")).rejects.toThrow();
  });
});
