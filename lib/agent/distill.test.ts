// "Distill to knowledge" at the library level, through the scripted provider: a conversation becomes
// a session summary *proposal*, nothing is written until it is applied, and the applied summary's
// frontmatter is the conversation's, not the proposal's (§4.6). The menu item and the tray are
// `e2e/knowledge.spec.ts`.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("distill");
const { data: DATA } = checkout;

process.env.ATTUNE_FAKE_PROVIDER = "1";

const { distillConversation } = await import("./distill.ts");
const { runChatTurn } = await import("./turn.ts");
const { runBatch } = await import("../history/batch.ts");
const { writeKnowledge } = await import("../history/knowledge-actions.ts");
const { readActions } = await import("../history/log.ts");
const { StoreError } = await import("../store/paths.ts");
const chats = await import("../store/chats.ts");
const { uuidv7 } = await import("../chat/uuid.ts");

const CONV = "c_20260913_d157";
const SESSION = `knowledge/sessions/${CONV}.md`;
const signal = new AbortController().signal;

async function say(text: string): Promise<void> {
  for await (const _ of runChatTurn({
    conversationId: CONV,
    userMessage: { id: uuidv7(), text },
    assistantMessageId: uuidv7(),
    mode: "ask",
    signal,
  })) void _;
}

const apply = (write: Parameters<typeof writeKnowledge>[0]) =>
  runBatch({ actor: "agent", scope: "user", summary: "distill", commitPrefix: "knowledge", actions: [writeKnowledge(write, `chat:${CONV}`)] });

beforeEach(async () => {
  await checkout.reset({
    setup: () =>
      chats.writeConversation({
        schema: 1,
        id: CONV,
        title: "Eigenvalues",
        activeLeafId: null,
        pinned: false,
        model: "claude-opus-5",
        context: { file: null, taskIds: [] },
        createdAt: "2026-09-13T09:00:00-04:00",
        updatedAt: "2026-09-13T09:00:00-04:00",
      }),
  });
});

describe("distillConversation", () => {
  it("proposes a new session summary and writes nothing", async () => {
    await say("what is an eigenvalue?");
    const logged = (await readActions()).length;

    const proposal = await distillConversation(CONV, { signal });
    expect(proposal.kind).toBe("knowledge");
    expect(proposal.writes).toHaveLength(1);
    expect(proposal.writes[0]).toMatchObject({ path: SESSION, op: "create", mapLink: null });
    // The scripted provider answers the distill request itself, not the conversation's last prompt.
    expect(proposal.writes[0].content).toContain("Write the session summary");
    expect((await readActions()).length).toBe(logged);
  });

  it("is applied with the conversation's own frontmatter, and a second distill replaces it", async () => {
    await say("what is an eigenvalue?");
    const first = await distillConversation(CONV, { signal });
    await apply(first.writes[0]);

    const text = await readFile(path.join(DATA, SESSION), "utf8");
    expect(text).toContain(`id: ${CONV}`);
    expect(text).toContain("title: Eigenvalues");
    expect(text).toContain("messageCount: 2");

    const second = await distillConversation(CONV, { signal });
    expect(second.writes[0]).toMatchObject({ path: SESSION, op: "replace" });
  });

  it("refuses an empty conversation before any model call", async () => {
    await expect(distillConversation(CONV, { signal })).rejects.toBeInstanceOf(StoreError);
  });
});
