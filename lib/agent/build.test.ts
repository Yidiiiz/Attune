// Owns: Build's real commit/revert/undo contract in an isolated checkout, without inference.
// Failure behavior: every case resets its own repository and the shared pending-session registry.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("build");
const { runBuild, commitBuild, revertBuild, buildState } = await import("./build.ts");
const { writeCode, readCode } = await import("../store/code.ts");
const { buildToolRefusal } = await import("./build-policy.ts");
const { undoBatch, redoBatch } = await import("../history/undo.ts");
const { runBatch } = await import("../history/batch.ts");
const { codeChange } = await import("../history/code-actions.ts");
const { captureCode } = await import("../store/code.ts");
const { readActions } = await import("../history/log.ts");
type Input = import("./build-sdk.ts").BuildQuery;
type Event = import("./build.ts").BuildEvent;
const signal = (): AbortSignal => new AbortController().signal;
const file = (rel: string): string => path.join(checkout.dir, rel);
const KEY = "sk" + "-ant-" + "Q".repeat(32);

async function collect(events: AsyncIterable<Event>): Promise<Event[]> {
  const found: Event[] = []; for await (const event of events) found.push(event); return found;
}
function state(events: Event[]) {
  const last = events.filter((event) => event.type === "state").at(-1);
  if (!last || last.type !== "state") throw new Error(JSON.stringify(events));
  return last.state;
}
async function* fake(input: Input) {
  if (input.plan) { yield "Change feature and add another file."; return; }
  input.written.add("feature.ts"); input.written.add("added.ts");
  await writeCode("feature.ts", Buffer.from("export const feature = 2;\n"));
  await writeCode("added.ts", Buffer.from("export const added = true;\n"));
  yield "Applied the requested change.";
}

beforeEach(async () => {
  const runtime = (globalThis as unknown as { attuneBuildRuntime: { active: string | null; sessions: Map<string, unknown> } }).attuneBuildRuntime;
  runtime.active = null; runtime.sessions.clear();
  await checkout.reset({ setup: async () => {
    for (const rel of ["added.ts", "unrelated.txt", "new-secret.txt", "other.txt"]) await writeCode(rel, null);
    await writeCode("feature.ts", Buffer.from("export const feature = 1;\n"));
  } });
});

describe("Build gates", () => {
  it("protects both names of a staged rename", async () => {
    checkout.git("mv", "feature.ts", "renamed.ts");
    try {
      const { dirtyCode } = await import("../history/build-git.ts");
      expect(await dirtyCode()).toEqual(new Set(["feature.ts", "renamed.ts"]));
    } finally { checkout.git("reset", "--hard", "HEAD"); }
  });
  it("plans without edits, applies only after approval, commits once and undoes/redoes both existing and new files", async () => {
    const plan = state(await collect(runBuild({ prompt: "Improve feature", approval: "plan", signal: signal() }, fake)));
    expect(plan.phase).toBe("plan");
    expect(readFileSync(file("feature.ts"), "utf8")).toContain("= 1");
    expect((await collect(runBuild({ id: plan.id, signal: signal() }, fake))).at(-1)).toMatchObject({ type: "error" });
    expect(buildState(plan.id).phase).toBe("plan");
    const applied = state(await collect(runBuild({ id: plan.id, approved: true, signal: signal() }, fake)));
    expect(applied.phase).toBe("diff");
    expect(applied.diff).toContain("export const feature = 2");
    expect(applied.diff).toContain("export const added = true");
    const committed = await commitBuild(plan.id);
    expect(committed.commit).toBeTruthy();
    expect(await commitBuild(plan.id)).toEqual(committed);
    expect(checkout.git("ls-files", "data")).toBe("");
    expect((await readActions()).filter((entry) => entry.type === "code.change")).toHaveLength(1);
    expect(await undoBatch(committed.batch!)).toMatchObject({ ok: true });
    expect(readFileSync(file("feature.ts"), "utf8")).toContain("= 1");
    expect(existsSync(file("added.ts"))).toBe(false);
    expect(await redoBatch(committed.batch!)).toMatchObject({ ok: true });
    expect(readFileSync(file("feature.ts"), "utf8")).toContain("= 2");
    expect(existsSync(file("added.ts"))).toBe(true);
  });

  it("reverts only the captured changed set and preserves pre-existing edits", async () => {
    writeFileSync(file("unrelated.txt"), "user draft");
    const plan = state(await collect(runBuild({ prompt: "Improve feature", signal: signal() }, fake)));
    const changed = state(await collect(runBuild({ id: plan.id, approved: true, signal: signal() }, fake)));
    expect(changed.paths).toEqual(["added.ts", "feature.ts"]);
    await revertBuild(plan.id);
    expect(readFileSync(file("unrelated.txt"), "utf8")).toBe("user draft");
    expect(readFileSync(file("feature.ts"), "utf8")).toContain("= 1");
    expect(existsSync(file("added.ts"))).toBe(false);
    expect(checkout.git("status", "--porcelain", "--", "feature.ts", "added.ts")).toBe("");
  });

  it("Auto commits and leaves the same ordinary History Undo", async () => {
    const result = state(await collect(runBuild({ prompt: "Auto feature", approval: "auto", signal: signal() }, fake)));
    expect(result.phase).toBe("committed");
    expect(result.batch).toBeTruthy();
    expect(await undoBatch(result.batch!)).toMatchObject({ ok: true });
  });

  it("claims Revert before awaiting I/O so a simultaneous Commit cannot run", async () => {
    const plan = state(await collect(runBuild({ prompt: "Improve feature", signal: signal() }, fake)));
    await collect(runBuild({ id: plan.id, approved: true, signal: signal() }, fake));
    const reverting = revertBuild(plan.id);
    await expect(commitBuild(plan.id)).rejects.toMatchObject({ code: "invalid" });
    await reverting;
    expect((await readActions()).filter((entry) => entry.type === "code.change")).toHaveLength(0);
    expect(readFileSync(file("feature.ts"), "utf8")).toContain("= 1");
  });

  it("refuses stale commit and revert rather than overwriting a later edit", async () => {
    const plan = state(await collect(runBuild({ prompt: "Improve feature", signal: signal() }, fake)));
    await collect(runBuild({ id: plan.id, approved: true, signal: signal() }, fake));
    writeFileSync(file("feature.ts"), "later user edit\n");
    await expect(commitBuild(plan.id)).rejects.toMatchObject({ code: "conflict" });
    await expect(revertBuild(plan.id)).rejects.toMatchObject({ code: "conflict" });
    expect(readFileSync(file("feature.ts"), "utf8")).toBe("later user edit\n");
  });

  it("a second request cannot corrupt a running session", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    async function* paused(input: Input) { await gate; yield* fake(input); }
    const plan = state(await collect(runBuild({ prompt: "Improve feature", signal: signal() }, fake)));
    const running = collect(runBuild({ id: plan.id, approved: true, signal: signal() }, paused));
    const duplicate = await collect(runBuild({ id: plan.id, approved: true, signal: signal() }, fake));
    expect(duplicate.at(-1)).toMatchObject({ type: "error" });
    expect(buildState(plan.id).phase).toBe("applying");
    release(); await running;
    expect(buildState(plan.id).phase).toBe("diff");
  });

  it("cancels an unapplied plan after HEAD changes without touching the newer work", async () => {
    const plan = state(await collect(runBuild({ prompt: "Improve feature", signal: signal() }, fake)));
    writeFileSync(file("other.txt"), "new committed work");
    checkout.git("add", "other.txt"); checkout.git("commit", "-qm", "other work");
    const events = await collect(runBuild({ id: plan.id, approved: true, signal: signal() }, fake));
    expect(events.at(-1)).toMatchObject({ type: "error", code: "conflict" });
    expect((await revertBuild(plan.id)).phase).toBe("reverted");
    expect(readFileSync(file("other.txt"), "utf8")).toBe("new committed work");
  });
});

describe("Build refusals", () => {
  it("the mandatory hook denies personal paths, credentials, shell/worker tools, planning writes and dirty-file edits", async () => {
    for (const tool of ["Bash", "Agent", "Task", "Unknown"]) expect(await buildToolRefusal(tool, {}, false, new Set())).toBeTruthy();
    for (const rel of ["data/tasks/x.md", "data./tasks/x.md", "data:stream", ".env.local", "../outside", ".git/config", ".agent/state.sqlite3"]) {
      expect(await buildToolRefusal("Write", { file_path: rel }, false, new Set())).toBeTruthy();
    }
    expect(await buildToolRefusal("Write", { file_path: "feature.ts" }, true, new Set())).toBeTruthy();
    expect(await buildToolRefusal("Edit", { file_path: "feature.ts" }, false, new Set(["feature.ts"]))).toBeTruthy();
    expect(await buildToolRefusal("Edit", { file_path: "feature.ts" }, false, new Set())).toBeNull();
    expect(await buildToolRefusal("Grep", { pattern: ".*" }, false, new Set())).toBeTruthy();
    expect(await buildToolRefusal("Grep", { path: ".", pattern: ".*" }, false, new Set())).toBeTruthy();
  });

  it("generated secrets revert without a log line or commit", async () => {
    const head = checkout.git("rev-parse", "HEAD"), logged = (await readActions()).length;
    async function* secret(input: Input) {
      input.written.add("feature.ts"); await writeCode("feature.ts", Buffer.from(KEY)); yield "done";
    }
    const events = await collect(runBuild({ prompt: "Improve feature", approval: "auto", signal: signal() }, secret));
    expect(events.at(-1)).toMatchObject({ type: "error", code: "secret_rejected" });
    expect(JSON.stringify(events)).not.toContain(KEY);
    expect(readFileSync(file("feature.ts"), "utf8")).toContain("= 1");
    expect(checkout.git("rev-parse", "HEAD")).toBe(head);
    expect((await readActions()).length).toBe(logged);
  });

  it("runBatch independently scans repository bytes and rolls them back even without the SDK preflight", async () => {
    const before = await captureCode(["feature.ts", "new-secret.txt"]);
    await writeCode("feature.ts", Buffer.from(KEY)); await writeCode("new-secret.txt", Buffer.from(KEY));
    const after = await captureCode(["feature.ts", "new-secret.txt"]);
    await expect(runBatch({ actor: "agent", scope: "project", summary: "Code change", commitPrefix: "code",
      repoPaths: [...before.keys()], actions: [codeChange(before, after, [...before.keys()], "Code change")] })).rejects.toMatchObject({ code: "secret_rejected" });
    expect(readFileSync(file("feature.ts"), "utf8")).toContain("= 1");
    expect(await readCode("new-secret.txt")).toBeNull();
    expect(await readActions()).toHaveLength(0);
  });

  it("failed SDK edits are retained for review and cannot commit", async () => {
    async function* failure(input: Input) { yield* fake(input); throw new Error("provider failed"); }
    const events = await collect(runBuild({ prompt: "Improve feature", approval: "auto", signal: signal() }, failure));
    const pending = state(events);
    expect(pending.phase).toBe("diff");
    expect(pending.error).toContain("provider failed");
    const { readConversation } = await import("../store/chats.ts");
    expect((await readConversation(pending.conversationId!)).messages.find((message) => message.role === "assistant")).toMatchObject({ status: "failed" });
    await expect(commitBuild(pending.id)).rejects.toMatchObject({ code: "invalid" });
    expect(existsSync(file("added.ts"))).toBe(true);
    await revertBuild(pending.id);
    expect(existsSync(file("added.ts"))).toBe(false);
  });
});
