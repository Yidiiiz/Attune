// Owns: every git command this app runs — one commit per batch, a debounced push, and the state the
// sync indicator reads (PROJECT.md §8). Git is shelled out to; there is no library (§2).
//
// Failure behavior: failures never block a write. The batch is already on disk and already logged
// before git is asked to do anything, so an offline machine, a missing remote, or a rejected push
// downgrades the sync state and nothing else. A non-fast-forward stops pushing entirely and asks for
// `git pull --rebase` by hand; automatic conflict resolution on a repository of personal data is a
// worse outcome than a stalled indicator.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { REPO_DIR } from "../store/paths.ts";

const run = promisify(execFile);

export type SyncState = "synced" | "pending" | "offline" | "error" | "conflict" | "local";

export interface SyncStatus {
  state: SyncState;
  ahead: number;
  lastError?: string;
}

let lastError: string | null = null;
let lastErrorState: SyncState | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

async function git(args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: REPO_DIR, maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim();
}

async function gitOk(args: string[]): Promise<string | null> {
  try {
    return await git(args);
  } catch {
    return null;
  }
}

export async function hasRemote(): Promise<boolean> {
  return (await gitOk(["remote", "get-url", "origin"])) !== null;
}

/** Commits this branch has that its upstream does not. `null` when there is no upstream. */
export async function ahead(): Promise<number | null> {
  const out = await gitOk(["rev-list", "--count", "@{u}..HEAD"]);
  if (out === null) return null;
  const count = Number(out);
  return Number.isFinite(count) ? count : null;
}

/**
 * Stage and commit exactly `paths` — nothing else in the tree. Unrelated edits sitting in the index
 * (a source file being worked on while the dev server runs) must never ride along with a task.
 * Returns the short hash, or null when there was nothing to commit.
 */
export async function commitPaths(message: string, paths: string[]): Promise<string | null> {
  await gitOk(["add", "-A", "--", ...paths]);
  try {
    await git(["commit", "-m", message, "--", ...paths]);
  } catch (err) {
    const text = `${(err as Error).message}`;
    if (/nothing to commit|no changes added|nothing added/i.test(text)) return null;
    throw err;
  }
  return await git(["rev-parse", "--short", "HEAD"]);
}

function classify(message: string): { state: SyncState; text: string } {
  if (/could not resolve host|network is unreachable|failed to connect|timed out/i.test(message)) {
    return { state: "offline", text: "Offline. The commit is safe locally and will push next time." };
  }
  if (/non-fast-forward|fetch first|rejected/i.test(message)) {
    return {
      state: "conflict",
      text: `Remote has changes. Run: git pull --rebase && git push in ${REPO_DIR}`,
    };
  }
  return { state: "error", text: message.split("\n").slice(0, 3).join(" ").trim() };
}

/** Push now. Silent and successful when there is no remote, no upstream, or nothing ahead. */
export async function flush(): Promise<SyncStatus> {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }

  if (!(await hasRemote())) return { state: "local", ahead: 0 };
  if (lastErrorState === "conflict") return status();

  const count = await ahead();
  if (count === null) return { state: "local", ahead: 0 };
  if (count === 0) {
    lastError = null;
    lastErrorState = null;
    return { state: "synced", ahead: 0 };
  }

  try {
    await git(["push"]);
    lastError = null;
    lastErrorState = null;
  } catch (err) {
    const { state, text } = classify(`${(err as Error).message}`);
    lastError = text;
    lastErrorState = state;
  }
  return status();
}

/** Push `debounceMs` after the last commit (§8). A later commit restarts the wait. */
export function schedulePush(debounceMs: number): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void flush();
  }, Math.max(0, debounceMs));
  if (typeof pushTimer.unref === "function") pushTimer.unref(); // never hold the process open
}

export async function status(): Promise<SyncStatus> {
  if (!(await hasRemote())) return { state: "local", ahead: 0 };

  const count = await ahead();
  if (count === null) return { state: "local", ahead: 0 };
  if (lastErrorState) return { state: lastErrorState, ahead: count, lastError: lastError ?? undefined };
  return { state: count === 0 ? "synced" : "pending", ahead: count };
}

/** The contents of `path` at `commit`. Used to reconstruct a `{ git: true }` snapshot. */
export async function show(commit: string, path: string): Promise<string | null> {
  return gitOk(["show", `${commit}:${path}`]);
}

/** Undo a commit's effect on `paths` only, leaving the result in the working tree uncommitted. */
export async function revertPaths(commit: string, paths: string[]): Promise<void> {
  await git(["checkout", `${commit}^`, "--", ...paths]);
}

/** Porcelain status limited to `paths`. Empty means clean. */
export async function statusPorcelain(paths: string[]): Promise<string> {
  return (await gitOk(["status", "--porcelain", "--", ...paths])) ?? "";
}
