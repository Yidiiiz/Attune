// Owns: Build's two approval gates, pending diff and Auto path (§13.4).
// Failure behavior: retain partial edits for review, refuse stale diffs and never
// commit on a failed/stopped SDK turn. Revert touches only the captured changed set.
import { randomUUID } from "node:crypto";
import { captureCode, changedCode, assertCode, restoreCode } from "../store/code.ts";
import type { CodeCapture } from "../store/code.ts";
import { StoreError } from "../store/paths.ts";
import { findSecret, scrubSecrets } from "../security/secrets.ts";
import { codeChange } from "../history/code-actions.ts";
import { runBatch } from "../history/batch.ts";
import { buildDiff, buildGit, dirtyCode, projectFiles } from "../history/build-git.ts";
import { queryBuild } from "./build-sdk.ts";
import type { BuildQuery } from "./build-sdk.ts";
import { recordBuild } from "./build-transcript.ts";

type Phase = "planning" | "plan" | "applying" | "diff" | "committing" | "committed" | "reverting" | "reverted" | "failed";
interface Session {
  id: string; prompt: string; approval: "plan" | "auto"; phase: Phase;
  before: CodeCapture; after: CodeCapture; dirty: Set<string>; written: Set<string>;
  head: string; plan: string; diff: string; paths: string[]; conversationId?: string;
  error?: string; batch?: string; commit?: string | null;
}
interface Runtime { active: string | null; sessions: Map<string, Session> }
const global = globalThis as typeof globalThis & { attuneBuildRuntime?: Runtime };
const runtime = global.attuneBuildRuntime ??= { active: null, sessions: new Map() };

export type BuildEvent = { type: "text"; text: string } | { type: "state"; state: BuildState } | { type: "error"; message: string; code: string };
export interface BuildState {
  id: string; phase: Phase; plan: string; diff: string; paths: string[];
  conversationId?: string; error?: string; batch?: string; commit?: string | null;
}
export function buildState(id: string): BuildState {
  const { phase, plan, diff, paths, conversationId, error, batch, commit } = session(id);
  return { id, phase, plan, diff, paths, conversationId, error, batch, commit };
}
function session(id: string): Session {
  const found = runtime.sessions.get(id);
  if (!found) throw new StoreError("not_found", "Build session is unavailable. Inspect git diff for partial edits before starting again.");
  return found;
}
async function sameHead(one: Session): Promise<void> {
  if ((await buildGit("rev-parse", "HEAD")).trim() !== one.head) throw new StoreError("conflict", "Repository HEAD changed during this build; review it before continuing");
}
async function capture(one: Session): Promise<void> {
  one.after = await captureCode([...new Set([...one.before.keys(), ...await projectFiles()])]);
  one.paths = changedCode(one.before, one.after);
  one.diff = one.paths.length ? await buildDiff(one.paths, new Set(one.before.keys())) : "";
}

export async function commitBuild(id: string): Promise<BuildState> {
  const one = session(id);
  if (one.phase === "committed") return buildState(id);
  if (one.phase !== "diff" || one.error || one.paths.length === 0) throw new StoreError("invalid", "Only a completed build with a nonempty reviewed diff can commit");
  one.phase = "committing";
  try {
    await sameHead(one);
    const result = await runBatch({ actor: "agent", scope: "project", summary: one.prompt.split("\n")[0].slice(0, 100),
      commitPrefix: "code", repoPaths: one.paths, meta: { plan: one.plan, conversationId: one.conversationId },
      actions: [codeChange(one.before, one.after, one.paths, "Apply reviewed build")] });
    if (!result.commit) throw new StoreError("invalid", "Commit failed; the diff remains available for review or revert");
    one.batch = result.batch; one.commit = result.commit; one.phase = "committed";
    runtime.active = null;
    return buildState(id);
  } catch (err) { one.phase = "diff"; throw err; }
}

export async function revertBuild(id: string): Promise<BuildState> {
  const one = session(id);
  if (one.phase === "reverted") return buildState(id);
  if (!["plan", "diff", "failed"].includes(one.phase)) throw new StoreError("invalid", "Stop the running build before reverting; committed changes use History Undo");
  const previous = one.phase;
  one.phase = "reverting";
  try {
    if (one.paths.length === 0) {
      one.phase = "reverted"; runtime.active = null; return buildState(id);
    }
    try {
      await assertCode(one.before, one.paths);
      one.phase = "reverted"; runtime.active = null; return buildState(id);
    } catch { /* A real change remains; validate its captured state before restoring it. */ }
    if (one.paths.some((rel) => !one.written.has(rel))) throw new StoreError("conflict", "The diff includes changes this build did not make; inspect them manually before reverting");
    await sameHead(one);
    await assertCode(one.after, one.paths);
    await restoreCode(one.before, one.paths);
    one.phase = "reverted"; runtime.active = null;
    return buildState(id);
  } catch (err) { one.phase = previous; throw err; }
}

export interface BuildInput { prompt?: string; approval?: "plan" | "auto"; conversationId?: string; id?: string; approved?: boolean; signal: AbortSignal }
type QueryBuild = (input: BuildQuery) => AsyncIterable<string>;

export async function* runBuild(input: BuildInput, query: QueryBuild = queryBuild): AsyncGenerator<BuildEvent> {
  let one: Session | undefined;
  let ownsRun = false;
  let answer = "";
  try {
    if (input.id) {
      one = session(input.id);
      if (!input.approved || one.phase !== "plan") throw new StoreError("invalid", "Approve the displayed plan before applying it");
      one.phase = "applying";
      ownsRun = true;
      try {
        await sameHead(one);
        const current = await captureCode([...new Set([...one.before.keys(), ...await projectFiles()])]);
        if (changedCode(one.before, current).length) throw new StoreError("conflict", "Project files changed since planning; keep those edits and start a new plan");
      } catch (err) { one.phase = "plan"; ownsRun = false; throw err; }
    } else {
      if (runtime.active) throw new StoreError("conflict", "Review or revert the pending Build before starting another");
      if (!input.prompt?.trim()) throw new StoreError("invalid", "Describe the project change first");
      if (findSecret(input.prompt)) throw new StoreError("secret_rejected", "The build prompt looks like it contains a credential; remove it before sending");
      const id = randomUUID(); runtime.active = id;
      try {
        const before = await captureCode(await projectFiles());
        one = { id, prompt: input.prompt, approval: input.approval ?? "plan", phase: input.approval === "auto" ? "applying" : "planning",
          before, after: before, dirty: await dirtyCode(), written: new Set(), head: (await buildGit("rev-parse", "HEAD")).trim(),
          plan: "", diff: "", paths: [], conversationId: input.conversationId };
        runtime.sessions.set(id, one);
        ownsRun = true;
        for (const [old, value] of runtime.sessions) if (runtime.sessions.size > 8 && ["committed", "reverted", "failed"].includes(value.phase) && old !== id) runtime.sessions.delete(old);
      } catch (err) { runtime.active = null; throw err; }
    }
    yield { type: "state", state: buildState(one.id) };
    const planning = one.phase === "planning";
    for await (const text of query({ prompt: planning || one.approval === "auto" ? one.prompt : `Apply this approved plan exactly:\n${one.plan}`, plan: planning,
      dirty: one.dirty, written: one.written, signal: input.signal })) {
      answer += text;
      yield { type: "text", text };
    }
    if (input.signal.aborted) throw new StoreError("invalid", "Build stopped; partial edits need review or revert");
    await capture(one);
    const current = one;
    if (one.paths.some((rel) => current.dirty.has(rel) || !current.written.has(rel))) throw new StoreError("conflict", "Changes outside the approved tool writes were detected; preserve and inspect them");
    if (planning && one.paths.length) throw new StoreError("invalid", "Planning changed project files; inspect and revert the partial build");
    if (planning) {
      if (!answer.trim()) throw new StoreError("invalid", "Build returned no plan");
      one.plan = answer; one.phase = "plan";
      one.conversationId = await recordBuild(one.prompt, answer, one.conversationId);
    } else {
      if (one.paths.length === 0) throw new StoreError("invalid", answer || "Build did not change any files");
      for (const rel of one.paths) {
        const bytes = one.after.get(rel);
        const hit = bytes && !bytes.includes(0) ? findSecret(bytes.toString("utf8")) : null;
        if (hit) {
          await restoreCode(one.before, one.paths);
          one.after = one.before; one.paths = []; one.diff = "";
          throw new StoreError("secret_rejected", `${rel} looks like it contains a credential (${hit}); the build was reverted`);
        }
      }
      one.phase = "diff";
      one.conversationId = await recordBuild(one.approval === "auto" ? one.prompt : "Apply approved build", `${answer}\n\n\`\`\`diff\n${one.diff}\n\`\`\``, one.conversationId);
      if (one.approval === "auto") await commitBuild(one.id);
    }
    yield { type: "state", state: buildState(one.id) };
  } catch (err) {
    const message = scrubSecrets((err as Error).message);
    if (one && ownsRun && one.phase !== "committed") {
      if (["planning", "applying"].includes(one.phase)) await capture(one).catch(() => {});
      one.error = message; one.phase = one.paths.length ? "diff" : "failed";
      if (answer && !(err instanceof StoreError && err.code === "secret_rejected")) {
        try { one.conversationId = await recordBuild(one.prompt, answer, one.conversationId, message); }
        catch { console.warn("Build failure transcript could not be saved; partial text remains in the client"); }
      }
      if (one.paths.length === 0) runtime.active = null;
      yield { type: "state", state: buildState(one.id) };
    }
    yield { type: "error", message, code: err instanceof StoreError ? err.code : "provider" };
  }
}
