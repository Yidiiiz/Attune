// What a batch's commit contains, against a real checkout. §8 says never commit a streaming
// message, and `runBatch` stages `data/` whole — so a batch that commits while a reply is still
// arriving would sweep the half-written message file into its commit, and git would then hold a
// `status: streaming` file that nothing in the log describes. That is the case the first test
// reproduces, and it stays in the suite because the only thing standing between the two is the
// in-flight registry in `lib/history/in-flight.ts`.
//
// The exception to that exclusion is keyed to **ownership**: only the batch that finalizes a turn
// may commit that turn's files. A batch that merely declares a held path is refused, which is the
// original defect's second route closed.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("batch-commit");
const { git, data: DATA } = checkout;

const { streamingWrite } = await import("./streaming.ts");
const { runBatch } = await import("./batch.ts");
const { createTask } = await import("./actions.ts");
const { saveMessage } = await import("./chat-actions.ts");
const { commitExclusions, releaseStreaming, streamingPaths } = await import("./in-flight.ts");
const { readActions } = await import("./log.ts");
const chats = await import("../store/chats.ts");
const { StoreError } = await import("../store/paths.ts");
const { uuidv7 } = await import("../chat/uuid.ts");

type Message = import("../chat/types.ts").Message;

const CONV = "c_20260912_5e1a";
const TURN = "the-owning-turn";

const committed = (): string[] => git("show", "--name-only", "--format=", "HEAD").split("\n");

const streaming = (id: string, text: string): Message => ({
  schema: 1,
  id,
  parentId: null,
  role: "assistant",
  status: "streaming",
  createdAt: "2026-09-12T16:01:00-04:00",
  model: "claude-opus-5",
  attachments: [],
  refs: [],
  deleted: false,
  error: null,
  text,
});

/** Write a streaming reply the way a turn does, owned by `turn`, and hand back its path. */
async function stream(text = "The change of ba", turn = TURN): Promise<string> {
  const id = uuidv7();
  const rel = chats.messagePath(CONV, id);
  await streamingWrite(rel, chats.renderMessage(streaming(id, text)), turn);
  return rel;
}

/** A batch writing the finished message, as `finalizeTurn` does — naming a turn, or not. */
const finish = (rel: string, text: string, turn: string | undefined) =>
  runBatch({
    actor: "user",
    scope: "user",
    summary: "Reply in 'Streaming'",
    commitPrefix: "chat",
    ...(turn === undefined ? {} : { turn }),
    actions: [saveMessage(CONV, { ...streaming(path.basename(rel, ".md"), text), status: "complete" })],
  });

const task = (title: string) =>
  runBatch({
    actor: "user",
    scope: "user",
    summary: `add ${title}`,
    commitPrefix: "task",
    actions: [createTask({ title })],
  });

beforeEach(async () => {
  await checkout.reset({
    setup: () =>
      chats.writeConversation({
        schema: 1,
        id: CONV,
        title: "Streaming",
        activeLeafId: null,
        pinned: false,
        model: "claude-opus-5",
        context: { file: null, taskIds: [] },
        createdAt: "2026-09-12T16:00:00-04:00",
        updatedAt: "2026-09-12T16:00:00-04:00",
      }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a batch committed while a reply is streaming", () => {
  it("leaves the streaming message out of its commit", async () => {
    const rel = await stream();

    await task("pset 4");

    // The task is in the commit; the half-written reply is not, and is still on disk, untracked.
    expect(committed().some((one) => one.startsWith("data/tasks/"))).toBe(true);
    expect(committed()).not.toContain(`data/${rel}`);
    expect(git("ls-files", "--", `data/${rel}`)).toBe("");
    expect(git("status", "--porcelain", "--", `data/${rel}`)).toBe(`?? data/${rel}`);
  });

  it("still lets the owning turn's finalizing batch commit it, and that batch ends the hold", async () => {
    const before = streamingPaths();
    const rel = await stream();
    await task("pset 4");

    await finish(rel, "The change of basis matrix", TURN);
    expect(committed()).toContain(`data/${rel}`);
    expect(git("status", "--porcelain", "--", "data")).toBe("");
    expect(streamingPaths()).toBe(before);
  });

  it("refuses a batch that declares a held path it does not own, and says so", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rel = await stream("The change of ba");
    const logged = (await readActions()).length;
    const head = git("rev-parse", "HEAD");

    // Keyed to declaration, this would have been allowed — and would have committed the half-written
    // reply. Keyed to ownership, it is refused whole, before anything is logged.
    await expect(finish(rel, "someone else's text", undefined)).rejects.toBeInstanceOf(StoreError);
    await expect(finish(rel, "someone else's text", "another-turn")).rejects.toThrow("still arriving");

    expect(warnings.mock.calls.flat().join("\n")).toContain(`declared a streaming file it does not own — ${rel}`);
    expect((await readActions()).length).toBe(logged);
    expect(git("rev-parse", "HEAD")).toBe(head);
    // Rolled back to what the turn had written, which is still the turn's to finish.
    expect(await readFile(path.join(DATA, rel), "utf8")).toContain("The change of ba");
    expect(await readFile(path.join(DATA, rel), "utf8")).toContain("status: streaming");
  });
});

describe("the in-flight registry's lifetime", () => {
  it("is emptied by a release once the file has stopped streaming", async () => {
    const before = streamingPaths();
    const rel = await stream();
    expect(streamingPaths()).toBe(before + 1);

    // Stopped streaming by some route other than the owning batch — here, rewritten as failed.
    const failed = { ...streaming(path.basename(rel, ".md"), "x"), status: "failed" as const };
    await writeFile(path.join(DATA, rel), chats.renderMessage(failed));
    await releaseStreaming([rel]);
    expect(streamingPaths()).toBe(before);
  });

  it("keeps a file still streaming when its turn ends as an orphan, and says so", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rel = await stream();

    // A turn that ended without finalizing or discarding: releasing the path outright would let
    // the next batch commit a partial reply.
    await releaseStreaming([rel]);
    expect(errors.mock.calls.flat().join("\n")).toContain(`${rel} still says streaming after its turn ended`);

    await task("pset 4");
    expect(committed()).not.toContain(`data/${rel}`);
  });

  it("lets a batch take an orphan over, commits it, and clears the entry", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rel = await stream();
    await releaseStreaming([rel]);
    expect(await commitExclusions([], undefined)).toContain(rel);

    // Nobody owns an orphan, so a batch that declares it — the sweep, or deleting the conversation —
    // is repairing it rather than contesting it.
    await finish(rel, "repaired", undefined);
    expect(committed()).toContain(`data/${rel}`);
    // By path rather than by count: an earlier case's orphan, whose file the reset removed, is
    // dropped by the same batch, and that is correct too.
    expect(await commitExclusions([], undefined)).not.toContain(rel);
    expect(errors.mock.calls.flat().join("\n")).toContain(`${rel} was left streaming by a turn that ended`);
  });

  it("drops an entry whose file stopped streaming with nothing releasing it, and says so", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined); // the hand edit is undeclared, on purpose
    const rel = await stream();
    const held = streamingPaths();

    // Changed by hand, outside any batch and outside the turn. Without the check the path would be
    // excluded from every later commit, and this edit would never be committed.
    await writeFile(
      path.join(DATA, rel),
      chats.renderMessage({ ...streaming(path.basename(rel, ".md"), "edited"), status: "complete" }),
    );
    await task("pset 4");

    expect(errors.mock.calls.flat().join("\n")).toContain(`${rel} was held as streaming but no longer is`);
    expect(streamingPaths()).toBe(held - 1);
    expect(committed()).toContain(`data/${rel}`);
  });
});

describe("the staged set against the declared targets (outside production)", () => {
  it("is silent when they match", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await task("pset 4");
    expect(warnings).not.toHaveBeenCalled();
  });

  it("names a file staged that no action declared", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await writeFile(path.join(DATA, "knowledge", "profile", "habits.md"), "# Habits\n\nedited by hand\n");
    await task("pset 4");

    const said = warnings.mock.calls.flat().join("\n");
    expect(said).toContain("staged but not declared: data/knowledge/profile/habits.md");
    // Over-staging is the recoverable direction, so the file is committed rather than left behind.
    expect(committed()).toContain("data/knowledge/profile/habits.md");
  });

  it("names a target declared but written with the bytes it already had", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await runBatch({
      actor: "user",
      scope: "user",
      summary: "rewrite habits unchanged",
      commitPrefix: "knowledge",
      actions: [
        {
          type: "knowledge.write",
          summary: "Rewrite habits",
          apply: async (store) => {
            const rel = "knowledge/profile/habits.md";
            const snap = await store.snapshotContent(rel);
            return { targets: [rel], before: { [rel]: snap }, after: { [rel]: snap } };
          },
        },
      ],
    });
    expect(warnings.mock.calls.flat().join("\n")).toContain("declared but unchanged: data/knowledge/profile/habits.md");
  });
});
