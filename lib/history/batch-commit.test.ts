// What a batch's commit contains, against a real checkout. §8 says never commit a streaming
// message, and `runBatch` stages `data/` whole — so a batch that commits while a reply is still
// arriving would sweep the half-written message file into its commit, and git would then hold a
// `status: streaming` file that nothing in the log describes. That is the case the first test
// reproduces, and it stays in the suite because the only thing standing between the two is the
// in-flight registry in `lib/history/in-flight.ts`.

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
const { releaseStreaming, streamingPaths } = await import("./in-flight.ts");
const chats = await import("../store/chats.ts");
const { uuidv7 } = await import("../chat/uuid.ts");

type Message = import("../chat/types.ts").Message;

const CONV = "c_20260912_5e1a";

const committed = (): string[] => git("show", "--name-only", "--format=", "HEAD").split("\n");

/** Write a streaming reply the way a turn does, and hand back its path. */
async function stream(text = "The change of ba"): Promise<string> {
  const id = uuidv7();
  const rel = chats.messagePath(CONV, id);
  await streamingWrite(rel, chats.renderMessage(streaming(id, text)));
  return rel;
}

const finalize = (rel: string, text: string) => {
  const id = path.basename(rel, ".md");
  return runBatch({
    actor: "user",
    scope: "user",
    summary: "Reply in 'Streaming'",
    commitPrefix: "chat",
    actions: [saveMessage(CONV, { ...streaming(id, text), status: "complete" })],
  });
};

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

const task = (title: string) => runBatch({
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

  it("still lets the batch that finalizes the message commit it", async () => {
    const rel = await stream();
    await task("pset 4");

    // The exclusion is the held paths *minus the batch's own targets*, or finalizing would leave
    // the finished reply out of the one commit that is supposed to hold it.
    await finalize(rel, "The change of basis matrix");
    expect(committed()).toContain(`data/${rel}`);
    expect(git("status", "--porcelain", "--", "data")).toBe("");
  });
});

describe("the in-flight registry's lifetime", () => {
  it("is emptied by a release once the file has stopped streaming", async () => {
    const before = streamingPaths();
    const rel = await stream();
    expect(streamingPaths()).toBe(before + 1);

    await finalize(rel, "done");
    await releaseStreaming([rel]);
    expect(streamingPaths()).toBe(before);
  });

  it("keeps a file that is still streaming when its turn ends, and says so", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rel = await stream();

    // A turn that ended without finalizing or discarding: the file is an orphan (Decision 64), and
    // releasing it would let the next batch commit a partial reply.
    await releaseStreaming([rel]);
    expect(errors.mock.calls.flat().join("\n")).toContain(`${rel} still says streaming after its turn ended`);

    await task("pset 4");
    expect(committed()).not.toContain(`data/${rel}`);
  });

  it("drops an entry nothing released once its file stops streaming, and says so", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined); // the hand edit is undeclared, on purpose
    const rel = await stream();
    await finalize(rel, "done"); // …and nobody calls releaseStreaming
    const held = streamingPaths();

    // Now the path is stale. Without the check it would be excluded from every later commit, so an
    // edit to that file would never be committed and nothing would say why.
    await writeFile(path.join(DATA, rel), (await readFile(path.join(DATA, rel), "utf8")).replace("done", "edited"));
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
