// Owns: every git command this app runs — one commit per batch, a debounced push, and the state the
// sync indicator reads (PROJECT.md §8). Git is shelled out to; there is no library (§2).
//
// Failure behavior: failures never block a write. The batch is already on disk and already logged
// before git is asked to do anything, so an offline machine, a missing remote, or a rejected push
// downgrades the sync state and nothing else. A non-fast-forward stops pushing entirely and asks for
// `git pull --rebase` by hand; automatic conflict resolution on a repository of personal data is a
// worse outcome than a stalled indicator. Every command runs contained to `REPO_DIR`'s own
// repository, and commit, push and checkout assert it first (`repository.ts`); a `RepositoryError`
// from that check is the one failure `runBatch` does not always downgrade.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { REPO_DIR } from "../store/paths.ts";
import { assertOwnRepository, gitOptions } from "./repository.ts";

export { RepositoryError, assertOwnRepository } from "./repository.ts";

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
  const { stdout } = await run("git", args, { ...gitOptions(), maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim();
}

async function gitOk(args: string[]): Promise<string | null> {
  try {
    return await git(args);
  } catch {
    return null;
  }
}

const INDEX_LOCK = path.join(REPO_DIR, ".git", "index.lock");

/**
 * Whether a `git` process is running on this machine. `null` means the question could not be
 * answered — an unexpected `tasklist`/`pgrep` failure — and every caller treats that as yes:
 * deleting a lock a live git is holding corrupts the index, which is far worse than the stale lock
 * this check exists to clear.
 */
async function gitProcessRunning(): Promise<boolean | null> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await run("tasklist", ["/FI", "IMAGENAME eq git.exe", "/NH"]);
      return /git\.exe/i.test(stdout);
    }
    const { stdout } = await run("pgrep", ["-x", "git"]);
    return stdout.trim().length > 0;
  } catch (err) {
    // pgrep exits 1 when nothing matched. That is an answer, not a failure.
    if (process.platform !== "win32" && (err as { code?: number }).code === 1) return false;
    return null;
  }
}

export type IndexLockState = "absent" | "removed" | "held" | "unknown";

/**
 * Clear a `.git/index.lock` left behind by a git that was killed mid-operation, and say so once.
 *
 * This repository's own dev wrapper is the usual cause: `scripts/dev.mjs` takes the server tree down
 * with `taskkill /T /F` on Ctrl+C, which cannot be delivered gracefully on Windows, and if that lands
 * during a batch's commit the lock outlives the process. Git's next message — "Another git process
 * seems to be running... remove the file manually to continue" — reads like repository corruption to
 * anyone who did not just press Ctrl+C. Called once at startup, never on the write path: a lock
 * appearing mid-session belongs to something real.
 */
export async function clearStaleIndexLock(): Promise<IndexLockState> {
  if (!existsSync(INDEX_LOCK)) return "absent";

  const running = await gitProcessRunning();
  if (running !== false) {
    console.error(
      `git: ${INDEX_LOCK} exists and git ${running === null ? "may be" : "is"} running; leaving it alone`,
    );
    return running === null ? "unknown" : "held";
  }

  try {
    await unlink(INDEX_LOCK);
    console.error(`git: removed a stale ${INDEX_LOCK} left behind by an interrupted git`);
    return "removed";
  } catch (err) {
    console.error(`git: could not remove ${INDEX_LOCK} (${(err as Error).message})`);
    return "unknown";
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
 * `exclude` carves files back out of `paths`; it exists for the message files a turn is still
 * streaming into (`lib/history/in-flight.ts`). When `declared` is given, the staged set is compared
 * against it before the commit and any difference is reported. Returns the short hash, or null when
 * there was nothing to commit.
 */
export async function commitPaths(
  message: string,
  paths: string[],
  exclude: string[] = [],
  declared?: string[],
): Promise<string | null> {
  await assertOwnRepository();
  // `literal`, so a path is only ever itself and never a pattern.
  const spec = [...paths, ...exclude.map((rel) => `:(exclude,literal)${rel}`)];
  await gitOk(["add", "-A", "--", ...spec]);
  if (declared !== undefined) await compareStaged(spec, declared);
  try {
    await git(["commit", "-m", message, "--", ...spec]);
  } catch (err) {
    const text = `${(err as Error).message}`;
    if (/nothing to commit|no changes added|nothing added/i.test(text)) return null;
    throw err;
  }
  return await git(["rev-parse", "--short", "HEAD"]);
}

/**
 * Report where what is about to be committed and what the batch said it wrote disagree. Never
 * blocks: this is a measurement, collected so a later decision about staging only declared targets
 * rests on evidence (`lib/history/in-flight.ts` says why that is not done now). *Staged but not
 * declared* is a write nothing owns up to, or an edit made by hand — exactly what staging only the
 * declared set would leave behind. *Declared but not staged* is a target written with the bytes it
 * already had, which the dirty-check convention says should not happen.
 */
async function compareStaged(spec: string[], declared: string[]): Promise<void> {
  const out = await gitOk(["diff", "--cached", "--name-only", "--no-renames", "-z", "--", ...spec]);
  if (out === null) return;
  const staged = new Set(out.split("\0").filter((one) => one.length > 0));
  const expected = new Set(declared);
  const extra = [...staged].filter((one) => !expected.has(one));
  const missing = [...expected].filter((one) => !staged.has(one));
  if (extra.length === 0 && missing.length === 0) return;
  console.warn(
    "history: the commit and the batch's declared targets differ —" +
      (extra.length > 0 ? ` staged but not declared: ${extra.join(", ")};` : "") +
      (missing.length > 0 ? ` declared but unchanged: ${missing.join(", ")}` : ""),
  );
}

export interface HeadCommit {
  hash: string;
  subject: string;
}

/**
 * HEAD's short hash and subject line. The subject is what makes the deferred backfill safe: a hash
 * belongs to a pending batch only if HEAD is still the commit that batch made. A failed commit, or
 * one made by hand between batches, changes the subject rather than going unnoticed (Decision 47).
 */
export async function headCommit(): Promise<HeadCommit | null> {
  const out = await gitOk(["log", "-1", "--format=%h%n%s"]);
  if (out === null) return null;

  const cut = out.indexOf("\n");
  if (cut < 0) return null;
  const hash = out.slice(0, cut).trim();
  const subject = out.slice(cut + 1).trim();
  return hash.length > 0 ? { hash, subject } : null;
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
    await assertOwnRepository();
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

/**
 * Every path git tracks in this checkout, repository-relative with forward slashes — what "Whole
 * repo" in the Files panel may list and open (the Phase 8 approval). An untracked `.env.local` is not
 * in it, and `lib/security/credential-paths.ts` refuses it separately in case it ever is.
 */
export async function trackedFiles(): Promise<string[]> {
  await assertOwnRepository();
  return (await git(["ls-files", "-z"])).split("\0").filter(Boolean);
}

/** The contents of `path` at `commit`. Used to reconstruct a `{ git: true }` snapshot. */
export async function show(commit: string, path: string): Promise<string | null> {
  return gitOk(["show", `${commit}:${path}`]);
}

/**
 * Put `paths` back as they were at `revision`, uncommitted. The paths are repository-relative, as git
 * reads them from `REPO_DIR`: a data file is `data/<rel>`. Undo asks for a commit's parent, redo for
 * the commit itself (`applySnapshot`).
 */
export async function restorePaths(revision: string, paths: string[]): Promise<void> {
  await assertOwnRepository();
  await git(["checkout", revision, "--", ...paths]);
}

/** Porcelain status limited to `paths`. Empty means clean. */
export async function statusPorcelain(paths: string[]): Promise<string> {
  return (await gitOk(["status", "--porcelain", "--", ...paths])) ?? "";
}
