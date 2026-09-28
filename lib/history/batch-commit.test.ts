// What reaches git, against a real checkout.
//
// **`data/` is ignored, so almost nothing does.** A batch whose every write is under `data/` is
// logged, mirrored and undoable and never reaches git at all (`batch.ts`); only a batch declaring
// `repoPaths` — `code.change`, which nothing builds yet — commits, and only those paths. The last
// describe block here is that rule as checks, the batch that spans both included.
//
// **What that leaves of this file's original subject.** §8 says never commit a streaming message,
// and `runBatch` used to stage `data/` whole, so a batch landing mid-turn swept the half-written
// reply into its commit. There is no longer a commit for it to be swept into, which retires that
// defect rather than fixing it — so what is checked here now is the half of `in-flight.ts` that
// still does something: the **ownership** refusal, which stops a batch that does not own a held
// path from writing it at all, and the registry's **lifetime**, where an entry left behind would
// sit in the bookkeeping for the life of the process.

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
const { readActions, nullReason } = await import("./log.ts");
// The module itself, so a check can watch `schedulePush` rather than infer it from a null commit.
const gitModule = await import("./git.ts");
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

describe("a batch that lands while a reply is streaming", () => {
  it("makes no commit for the reply to be swept into, and leaves it on disk", async () => {
    const head = git("rev-parse", "HEAD");
    const rel = await stream();

    const { commit } = await task("pset 4");

    // The original defect needed a commit to happen. Neither the task nor the half-written reply
    // reaches one, and the reply is still there for its own turn to finish.
    expect(commit).toBeNull();
    expect(git("rev-list", "--count", `${head}..HEAD`)).toBe("0");
    expect(git("ls-files", "--", `data/${rel}`)).toBe("");
    expect(await readFile(path.join(DATA, rel), "utf8")).toContain("status: streaming");
  });

  it("still ends the owning turn's hold when its finalizing batch lands", async () => {
    const before = streamingPaths();
    const rel = await stream();
    await task("pset 4");

    const { commit } = await finish(rel, "The change of basis matrix", TURN);

    expect(commit).toBeNull();
    expect(await readFile(path.join(DATA, rel), "utf8")).toContain("The change of basis matrix");
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

  it("lets a batch take an orphan over and clears the entry", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rel = await stream();
    await releaseStreaming([rel]);
    expect(await commitExclusions([], undefined)).toContain(rel);

    // Nobody owns an orphan, so a batch that declares it — the sweep, or deleting the conversation —
    // is repairing it rather than contesting it.
    await finish(rel, "repaired", undefined);
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

    // Changed by hand, outside any batch and outside the turn. Without the check the entry would
    // sit in the registry for the life of the process, and the next turn wanting this path would be
    // refused as contesting a stream that has already ended.
    await writeFile(
      path.join(DATA, rel),
      chats.renderMessage({ ...streaming(path.basename(rel, ".md"), "edited"), status: "complete" }),
    );
    await task("pset 4");

    expect(errors.mock.calls.flat().join("\n")).toContain(`${rel} was held as streaming but no longer is`);
    expect(streamingPaths()).toBe(held - 1);
  });
});

describe("what reaches git, and what does not", () => {
  /** A file at the top of the checkout, outside `data/`, where a `code.change` writes one. */
  const repoFile = (name: string) => path.join(checkout.dir, name);

  /** The one action shape that declares a repository path, which is all `repoPaths` is for. */
  const codeChange = (name: string, text: string) => ({
    type: "code.change" as const,
    summary: `edit ${name}`,
    apply: async () => {
      await writeFile(repoFile(name), text);
      return { targets: [], before: {}, after: {} };
    },
  });

  it("makes no commit and schedules no push for a batch writing only under data/", async () => {
    const push = vi.spyOn(gitModule, "schedulePush").mockImplementation(() => undefined);
    const head = git("rev-parse", "HEAD");

    const { batch, commit } = await task("pset 4");

    expect(commit).toBeNull();
    expect(git("rev-list", "--count", `${head}..HEAD`)).toBe("0");
    // The push is reachable only from a commit that happened, so the leak is closed at its source
    // rather than by there being no remote today.
    expect(push).not.toHaveBeenCalled();

    // And the log says which kind of null this is: never, rather than the pending it would read as
    // with no marker, or the failed it would carry had the batch reached git and found nothing
    // staged. Every null explains itself (Decision 47).
    const entries = (await readActions()).filter((one) => one.batch === batch);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((one) => one.commit === null)).toBe(true);
    expect(entries.every((one) => one.meta.noCommit === true)).toBe(true);
    expect(entries.some((one) => "commitSubject" in one.meta)).toBe(false);
    expect(entries.some((one) => "commitFailed" in one.meta)).toBe(false);
    expect(nullReason(entries[0])).toBe("never");
  });

  it("commits a repository path and schedules the push", async () => {
    const push = vi.spyOn(gitModule, "schedulePush").mockImplementation(() => undefined);
    const head = git("rev-parse", "HEAD");

    const { batch, commit } = await runBatch({
      actor: "user",
      scope: "project",
      summary: "touch a source file",
      commitPrefix: "code",
      repoPaths: ["only-code.txt"],
      actions: [codeChange("only-code.txt", "changed")],
    });

    expect(commit).not.toBeNull();
    expect(git("rev-list", "--count", `${head}..HEAD`)).toBe("1");
    expect(committed()).toEqual(["only-code.txt"]);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toBe(30_000); // settings.sync.pushDebounceMs, from the seed

    const entries = (await readActions()).filter((one) => one.batch === batch);
    expect(entries.every((one) => one.meta.commitSubject === "code: touch a source file")).toBe(true);
    expect(entries.some((one) => "noCommit" in one.meta)).toBe(false);
  });

  it("commits only the repository half of a batch that spans both, and pushes", async () => {
    const push = vi.spyOn(gitModule, "schedulePush").mockImplementation(() => undefined);

    // Nothing in the app builds this today: `repoPaths` has one intended caller, Phase 9's
    // `code.change`, and such a batch always writes the log under `data/` as well as the files it
    // changed — so a mixed batch is unreachable now and unavoidable then. What X makes of it is
    // pinned here rather than left to the predicate. The repository paths are committed and pushed;
    // the data half is logged, undoable and outside git; and the entries carry the hash all the
    // same, because the batch did commit — just not the part that would have leaked.
    const { batch, commit, targets } = await runBatch({
      actor: "user",
      scope: "project",
      summary: "a source file and a task",
      commitPrefix: "code",
      repoPaths: ["both.txt"],
      actions: [codeChange("both.txt", "changed"), createTask({ title: "from the same batch" })],
    });

    expect(commit).not.toBeNull();
    expect(committed()).toEqual(["both.txt"]);
    expect(targets.some((one) => one.startsWith("tasks/"))).toBe(true);
    expect(git("ls-files", "--", "data")).toBe("");
    expect(push).toHaveBeenCalledTimes(1);

    const entries = (await readActions()).filter((one) => one.batch === batch);
    expect(entries).toHaveLength(2);
    expect(entries.every((one) => "commitSubject" in one.meta)).toBe(true);
  });

  it("is silent about the staged set for a batch with no repository path, because none is staged", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await writeFile(path.join(DATA, "knowledge", "profile", "habits.md"), "# Habits — edited by hand");

    await task("pset 4");

    // The comparison's *staged but not declared* arm went with the `data` pathspec that produced
    // it, and this is what replaced it: a hand edit under `data/` used to ride along in the next
    // batch's commit — over-staging, which `in-flight.ts` calls the recoverable direction — and now
    // rides along in nothing at all. The other arm still runs, on repository paths, below.
    expect(warnings).not.toHaveBeenCalled();
    expect(git("status", "--porcelain", "--", "data")).toBe("");
  });

  it("names a repository path declared but written with the bytes it already had", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await writeFile(repoFile("unchanged.txt"), "the same");
    git("add", "-A");
    git("commit", "-q", "-m", "a file to leave alone");

    await runBatch({
      actor: "user",
      scope: "project",
      summary: "declare it and change nothing",
      commitPrefix: "code",
      repoPaths: ["unchanged.txt"],
      actions: [codeChange("unchanged.txt", "the same")],
    });

    expect(warnings.mock.calls.flat().join("\n")).toContain("declared but unchanged: unchanged.txt");
  });
});
