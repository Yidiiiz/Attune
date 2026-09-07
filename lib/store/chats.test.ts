// The round trip §17 asks for, through a temp directory rather than a mock — the point of the test
// is the bytes on disk, so a fake filesystem would only prove the fake works. `ATTUNE_REPO_DIR` is
// set before `paths.ts` is imported, because `REPO_DIR` resolves once when that module loads
// (Decision 45); nothing here can see the owner's `data/`.
//
// The property that matters most is the boring one: what goes in comes back out byte for byte,
// including a body full of LaTeX. A message is prose, and prose that survives a save only
// approximately is prose someone has to retype.

import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const SANDBOX = await mkdtemp(path.join(tmpdir(), "attune-chats-"));
const DATA = path.join(SANDBOX, "data");

process.env.ATTUNE_REPO_DIR = SANDBOX;

const store = await import("./chats.ts");
const { StoreError } = await import("./paths.ts");
const { readText } = await import("./files.ts");
const { uuidv7 } = await import("../chat/uuid.ts");
const { buildTree, activePath } = await import("../chat/tree.ts");

type Message = import("../chat/types.ts").Message;
type Conversation = import("../chat/types.ts").Conversation;
type Annotation = import("../chat/types.ts").Annotation;

const CONV = "c_20260907_9f1c";
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

function conversation(over: Partial<Conversation> = {}): Conversation {
  return {
    schema: 1,
    id: CONV,
    title: "Change of basis",
    activeLeafId: null,
    pinned: false,
    model: "claude-opus-5",
    context: { file: "knowledge/collections/equations-math221.md", taskIds: ["t_20260903_7fa2"] },
    createdAt: "2026-09-07T16:00:00-04:00",
    updatedAt: "2026-09-07T16:00:00-04:00",
    ...over,
  };
}

function message(id: string, over: Partial<Message> = {}): Message {
  return {
    schema: 1,
    id,
    parentId: null,
    role: "user",
    status: "complete",
    createdAt: "2026-09-07T16:01:12.410-04:00",
    model: null,
    attachments: [],
    refs: [],
    deleted: false,
    error: null,
    text: "why is it transposed?",
    ...over,
  };
}

function annotation(id: string, over: Partial<Annotation> = {}): Annotation {
  return {
    schema: 1,
    id,
    kind: "note",
    targetMessageId: "m1",
    quote: "the change of basis matrix",
    prefix: "about ",
    suffix: " is P",
    charOffset: 42,
    anchorText: null,
    offsetRatio: null,
    includeInContext: false,
    deleted: false,
    createdAt: "2026-09-07T16:05:00-04:00",
    text: "ask about this in office hours",
    ...over,
  };
}

beforeEach(async () => {
  await rm(DATA, { recursive: true, force: true });
  await mkdir(DATA, { recursive: true });
});

describe("conversations", () => {
  it("round-trips a conversation, stamping updatedAt on the way in", async () => {
    await store.writeConversation(conversation());
    const back = await store.readConversation(CONV);

    expect(back.conversation.title).toBe("Change of basis");
    expect(back.conversation.model).toBe("claude-opus-5");
    expect(back.conversation.context).toEqual({
      file: "knowledge/collections/equations-math221.md",
      taskIds: ["t_20260903_7fa2"],
    });
    expect(back.conversation.createdAt).toBe("2026-09-07T16:00:00-04:00");
    expect(back.conversation.updatedAt).not.toBe("2026-09-07T16:00:00-04:00");
    expect(back.messages).toEqual([]);
    expect(back.annotations).toEqual([]);
  });

  it("writes the body empty, because activeLeafId is the entire branch state", async () => {
    await store.writeConversation(conversation({ activeLeafId: "019f3e54-bcd7-7b52-b5c6-c08c663367f5" }));
    const text = await readText(store.conversationPath(CONV));
    expect(text.split("---\n")[2]).toBe("");
    expect(text).toContain("activeLeafId: 019f3e54-bcd7-7b52-b5c6-c08c663367f5");
  });

  it("refuses to read one that is not there", async () => {
    await expect(store.readConversation("c_20260907_dead")).rejects.toBeInstanceOf(StoreError);
  });

  it("lists conversations newest first and survives a broken one", async () => {
    // Written directly, because `writeConversation` stamps `updatedAt` from the clock and the
    // ordering is the thing under test here. The broken third one must cost only itself.
    const write = async (id: string, title: string, updatedAt: string): Promise<void> => {
      await mkdir(path.join(DATA, "chats", id), { recursive: true });
      await writeFile(
        path.join(DATA, "chats", id, "conversation.md"),
        `---\nschema: 1\nid: ${id}\ntitle: ${title}\nmodel: claude-opus-5\n` +
          `createdAt: 2026-09-07T16:00:00-04:00\nupdatedAt: ${updatedAt}\n---\n`,
      );
    };
    await write("c_20260907_0001", "older", "2026-09-07T16:00:00-04:00");
    await write("c_20260907_0002", "newer", "2026-09-07T18:00:00-04:00");
    await mkdir(path.join(DATA, "chats", "c_20260907_0003"), { recursive: true });
    await writeFile(path.join(DATA, "chats", "c_20260907_0003", "conversation.md"), "---\n: : :\n---\n");

    expect((await store.listConversations()).map((c) => c.title)).toEqual(["newer", "older"]);
  });

  it("lists nothing on a fresh install rather than throwing", async () => {
    expect(await store.listConversations()).toEqual([]);
  });

  it("deletes the whole directory", async () => {
    await store.writeConversation(conversation());
    await store.writeMessage(CONV, message(uuidv7()));
    await store.deleteConversation(CONV);
    await expect(store.readConversation(CONV)).rejects.toBeInstanceOf(StoreError);
  });
});

describe("messages", () => {
  it("round-trips a message body byte for byte, LaTeX included", async () => {
    const id = uuidv7();
    const body = "The matrix is\n\n$$P^{-1}AP = D$$\n\nwith $\\lambda_1 = 2$.\n\n- one\n- two\n";
    await store.writeConversation(conversation());
    await store.writeMessage(CONV, message(id, { text: body }));

    const [back] = (await store.readConversation(CONV)).messages;
    expect(sha(back.text)).toBe(sha(body));
  });

  it("keeps every field of the §4.7 example", async () => {
    const id = uuidv7();
    await store.writeConversation(conversation());
    await store.writeMessage(
      CONV,
      message(id, {
        parentId: "019f3e54-bcd7-790e-8728-9143e4799a2c",
        role: "assistant",
        model: "claude-opus-5",
        attachments: ["attachments/ab12cd34-diagram.png"],
        refs: ["t_20260903_7fa2", "knowledge/notes/office-hours-math221.md"],
      }),
    );

    const [back] = (await store.readConversation(CONV)).messages;
    expect(back).toMatchObject({
      id,
      parentId: "019f3e54-bcd7-790e-8728-9143e4799a2c",
      role: "assistant",
      status: "complete",
      model: "claude-opus-5",
      attachments: ["attachments/ab12cd34-diagram.png"],
      refs: ["t_20260903_7fa2", "knowledge/notes/office-hours-math221.md"],
      deleted: false,
      error: null,
    });
  });

  it("returns messages in creation order, which is filename order", async () => {
    await store.writeConversation(conversation());
    const ids = [uuidv7(), uuidv7(), uuidv7()];
    for (const id of [ids[2], ids[0], ids[1]]) await store.writeMessage(CONV, message(id));

    expect((await store.readConversation(CONV)).messages.map((m) => m.id)).toEqual(ids);
  });

  it("skips an unreadable message and keeps the rest, so the tree truncates rather than vanishes", async () => {
    await store.writeConversation(conversation());
    const root = uuidv7();
    const child = uuidv7();
    await store.writeMessage(CONV, message(root));
    await store.writeMessage(CONV, message(child, { parentId: root }));
    await writeFile(path.join(DATA, "chats", CONV, "messages", `${uuidv7()}.md`), "---\n: : :\n---\nbroken\n");

    const { messages } = await store.readConversation(CONV);
    expect(messages.map((m) => m.id)).toEqual([root, child]);
    expect(activePath(buildTree(messages), child).map((m) => m.id)).toEqual([root, child]);
  });

  it("ignores a file whose name is not one of our ids", async () => {
    await store.writeConversation(conversation());
    await store.writeMessage(CONV, message(uuidv7()));
    await writeFile(path.join(DATA, "chats", CONV, "messages", "notes.md"), "---\nid: x\n---\n");

    expect((await store.readConversation(CONV)).messages).toHaveLength(1);
  });

  it("loads a sparse hand-written file rather than losing it", async () => {
    await store.writeConversation(conversation());
    const id = uuidv7();
    await mkdir(path.join(DATA, "chats", CONV, "messages"), { recursive: true });
    await writeFile(
      path.join(DATA, "chats", CONV, "messages", `${id}.md`),
      `---\nid: ${id}\nrole: user\ncreatedAt: 2026-09-07T16:00:00-04:00\n---\ntyped by hand\n`,
    );

    const [back] = (await store.readConversation(CONV)).messages;
    expect(back).toMatchObject({ id, role: "user", status: "complete", deleted: false, refs: [] });
    expect(back.text).toBe("typed by hand\n");
  });

  it("deletes one message without touching the others", async () => {
    await store.writeConversation(conversation());
    const kept = uuidv7();
    const gone = uuidv7();
    await store.writeMessage(CONV, message(kept));
    await store.writeMessage(CONV, message(gone));
    await store.deleteMessage(CONV, gone);

    expect((await store.readConversation(CONV)).messages.map((m) => m.id)).toEqual([kept]);
  });
});

describe("annotations", () => {
  it("round-trips an annotation, anchor in the frontmatter and text in the body", async () => {
    const id = uuidv7();
    await store.writeConversation(conversation());
    await store.writeAnnotation(CONV, annotation(id));

    const [back] = (await store.readConversation(CONV)).annotations;
    expect(back).toMatchObject({
      id,
      kind: "note",
      targetMessageId: "m1",
      quote: "the change of basis matrix",
      prefix: "about ",
      suffix: " is P",
      charOffset: 42,
      includeInContext: false,
      deleted: false,
    });
    expect(back.text).toBe("ask about this in office hours");
  });

  it("round-trips a comment's positional anchor", async () => {
    const id = uuidv7();
    await store.writeConversation(conversation());
    await store.writeAnnotation(
      CONV,
      annotation(id, {
        kind: "comment",
        quote: null,
        prefix: null,
        suffix: null,
        charOffset: null,
        anchorText: "Because the columns are",
        offsetRatio: 0.25,
      }),
    );

    const [back] = (await store.readConversation(CONV)).annotations;
    expect(back).toMatchObject({ kind: "comment", anchorText: "Because the columns are", offsetRatio: 0.25 });
  });

  it("writes each annotation to its own file, so two saves cannot clobber each other", async () => {
    await store.writeConversation(conversation());
    const a = uuidv7();
    const b = uuidv7();
    await Promise.all([
      store.writeAnnotation(CONV, annotation(a, { text: "first" })),
      store.writeAnnotation(CONV, annotation(b, { text: "second" })),
    ]);

    const back = (await store.readConversation(CONV)).annotations;
    expect(back.map((one) => one.text).sort()).toEqual(["first", "second"]);
  });
});

describe("newConversationId", () => {
  it("mints the §4.7 shape and does not collide with a directory that exists", async () => {
    const id = await store.newConversationId();
    expect(id).toMatch(/^c_\d{8}_[0-9a-f]{4}$/);
    await store.writeConversation(conversation({ id }));
    expect(await store.newConversationId()).not.toBe(id);
  });
});
