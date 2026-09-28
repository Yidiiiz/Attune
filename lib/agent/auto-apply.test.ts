// §6.3's auto-apply inside a real turn, and the transcript marker read back from the log — the Stage
// B half of §17's "a three-line append to habits.md auto-applies with an Undo toast". The toast is a
// browser matter (`e2e/knowledge.spec.ts`); what is checked here is everything it stands on: the
// write lands after the turn's own batch and only for a kept turn, as `actor: agent`, as a batch of
// its own; the marker resolves by identity through later writes, an undo and a redo; and one undo
// puts habits.md back byte for byte (SHA-256, Decision 42).
//
// The turns run through the scripted provider's proposal directives, so this is also the only
// coverage the Phase 7 prompts get until a key exists (docs/CHECKLIST.md).

import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("auto-apply");
const { git, data: DATA } = checkout;

process.env.ATTUNE_FAKE_PROVIDER = "1";

const { runChatTurn, activeStreams } = await import("./turn.ts");
const { streamingPaths } = await import("../history/in-flight.ts");
const { autoAppliedIn } = await import("../history/auto-applied.ts");
const { undoBatch, redoBatch } = await import("../history/undo.ts");
const { readActions, groupBatches, LOG_PATH } = await import("../history/log.ts");
const chats = await import("../store/chats.ts");
const { uuidv7 } = await import("../chat/uuid.ts");

type TurnEvent = import("./chat.ts").TurnEvent;

const CONV = "c_20260913_a11d";
const HABITS = "knowledge/profile/habits.md";

const sha = async (rel: string): Promise<string> =>
  createHash("sha256").update(await readFile(path.join(DATA, rel))).digest("hex");

async function send(text: string, abortOnDelta = false) {
  const controller = new AbortController();
  const assistantId = uuidv7();
  const events: TurnEvent[] = [];
  for await (const event of runChatTurn({
    conversationId: CONV,
    userMessage: { id: uuidv7(), text },
    assistantMessageId: assistantId,
    mode: "ask",
    signal: controller.signal,
  })) {
    events.push(event);
    if (abortOnDelta && event.type === "delta") controller.abort();
  }
  return { events, assistantId };
}

const applied = (events: TurnEvent[]) => events.flatMap((e) => (e.type === "applied" ? [e.applied] : []));
const cards = (events: TurnEvent[]) =>
  events.flatMap((e) => (e.type === "proposal" && e.proposal.kind === "knowledge" ? e.proposal.writes : []));

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
        createdAt: "2026-09-13T09:00:00-04:00",
        updatedAt: "2026-09-13T09:00:00-04:00",
      }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  expect(activeStreams()).toBe(0);
  expect(streamingPaths()).toBe(0);
});

describe("a completed turn proposing a short habits append", () => {
  it("applies it after the turn's own batch, as the agent, in a batch of its own", async () => {
    const head = git("rev-parse", "HEAD");
    const { events, assistantId } = await send("[[propose-habit]] how do I usually work?");

    const [one] = applied(events);
    expect(one).toMatchObject({ message: assistantId, path: HABITS, lines: 2 });
    expect(cards(events)).toEqual([]); // it applied itself, so there is no card for it
    // After the model's own `done`: the write waits for the turn to be kept.
    expect(events.findIndex((e) => e.type === "applied")).toBeGreaterThan(events.findIndex((e) => e.type === "done"));

    expect(await readFile(path.join(DATA, HABITS), "utf8")).toContain("- Works in 50-minute blocks");
    const all = groupBatches(await readActions());
    const reply = all.findIndex((b) => b.type === "chat.message");
    const write = all.findIndex((b) => b.batch === one.batch);
    expect(write).toBe(reply + 1);
    expect(all[write]).toMatchObject({ actor: "agent", type: "knowledge.write" });
    expect(all[write].entries[0].meta.autoApplied).toEqual({ conversation: CONV, message: assistantId, path: HABITS, lines: 2 });
    // Its own batch, and no commit: every path it writes is under `data/`, which is ignored.
    expect(git("rev-list", "--count", `${head}..HEAD`)).toBe("0");
  });

  it("is marked in the transcript from the log, and one undo restores habits.md and removes the marker", async () => {
    const before = await sha(HABITS);
    const { events, assistantId } = await send("[[propose-habit]] note that");
    const [one] = applied(events);

    expect(await autoAppliedIn(CONV)).toEqual([one]);

    expect(await undoBatch(one.batch)).toMatchObject({ ok: true });
    expect(await sha(HABITS)).toBe(before);
    expect(await autoAppliedIn(CONV)).toEqual([]);
    // The reply is untouched: undoing the memory is not undoing what was said.
    expect((await chats.readConversation(CONV)).messages.some((m) => m.id === assistantId)).toBe(true);
  });

  it("keeps each marker resolving by identity through later writes, an undo and a redo", async () => {
    const first = applied((await send("[[propose-habit]] one")).events)[0];
    await send("an unrelated question"); // a later batch, a later commit
    const second = applied((await send("[[propose-habit]] two")).events)[0];
    expect((await autoAppliedIn(CONV)).map((m) => m.batch)).toEqual([first.batch, second.batch]);

    // The newest can be undone alone; the older one's marker still resolves afterwards.
    expect(await undoBatch(second.batch)).toMatchObject({ ok: true });
    expect(await autoAppliedIn(CONV)).toEqual([first]);
    expect(await redoBatch(second.batch)).toMatchObject({ ok: true });
    expect((await autoAppliedIn(CONV)).map((m) => m.batch)).toEqual([first.batch, second.batch]);

    // The older one now conflicts with the newer write to the same file: refused, never forced.
    const refused = await undoBatch(first.batch);
    expect(refused.ok).toBe(false);
    expect(refused.conflict).toContain(second.batch);
  });
});

describe("what does not auto-apply", () => {
  it("leaves a note as a card beside the one write that applied itself", async () => {
    const { events } = await send("[[propose-habit]] [[propose-note]] both");
    expect(applied(events).map((a) => a.path)).toEqual([HABITS]);
    expect(cards(events)).toMatchObject([{ path: "knowledge/notes/zotero-setup.md", op: "create", mapLink: "knowledge/maps/tools.md" }]);
  });

  it("applies nothing for a stopped turn, and hands the write back as a card", async () => {
    const before = await sha(HABITS);
    const { events } = await send("[[slow]] [[propose-habit]] then stop", true);
    expect(applied(events)).toEqual([]);
    expect(cards(events)).toMatchObject([{ path: HABITS, op: "append" }]);
    expect(await sha(HABITS)).toBe(before);
    expect(await autoAppliedIn(CONV)).toEqual([]);
  });

  it("turns a refused auto-apply into a card, and says why on the server", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await rm(path.join(DATA, HABITS));
    const { events } = await send("[[propose-habit]] no habits file");
    expect(applied(events)).toEqual([]);
    expect(cards(events)).toMatchObject([{ path: HABITS, op: "append" }]);
    expect(groupBatches(await readActions()).some((b) => b.type === "knowledge.write")).toBe(false);
    expect(warn.mock.calls.flat().join(" ")).toMatch(/did not apply itself/);
  });
});

describe("the marker's reader, when the log is not what it should be", () => {
  it("renders nothing and warns when the log cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await send("[[propose-habit]] then break the log");
    await rm(path.join(DATA, LOG_PATH));
    await mkdir(path.join(DATA, LOG_PATH)); // a directory where the file was: the read fails
    expect(await autoAppliedIn(CONV)).toEqual([]);
    expect(warn.mock.calls.flat().join(" ")).toMatch(new RegExp(`could not be read.*${CONV}|${CONV}.*could not be read`));
  });

  it("warns about a torn line that names this conversation's auto-applied write", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await appendFile(path.join(DATA, LOG_PATH), `{"meta":{"autoApplied":{"conversation":"${CONV}"\n`);
    expect(await autoAppliedIn(CONV)).toEqual([]);
    expect(warn.mock.calls.flat().join(" ")).toMatch(/does not parse/);
  });

  it("skips an entry missing a field the marker needs, and warns rather than drawing half of it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const entry = {
      schema: 1, seq: 999, ts: "2026-09-13T09:00:00-04:00", batch: "b_20260913_090000_dead", actor: "agent", scope: "user",
      type: "knowledge.write", summary: "Add to 'habits'", targets: [], before: {}, after: {}, commit: null,
      meta: { autoApplied: { conversation: CONV, path: HABITS, lines: 2 } },
    };
    await appendFile(path.join(DATA, LOG_PATH), `${JSON.stringify(entry)}\n`);
    expect(await autoAppliedIn(CONV)).toEqual([]);
    expect(warn.mock.calls.flat().join(" ")).toMatch(/missing a field/);
  });

  it("is an empty history, not a warning, when there is no log yet", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await rm(path.join(DATA, LOG_PATH), { force: true });
    expect(await autoAppliedIn(CONV)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});
