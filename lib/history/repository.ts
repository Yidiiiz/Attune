// Owns: which repository git may act on — exactly `REPO_DIR`'s own, never one found above it. Every
// git command this app runs takes its options from `gitOptions()`, and everything that commits,
// pushes or checks out calls `assertOwnRepository()` first.
//
// Why both. Git looks for a repository by climbing from its working directory, so a `REPO_DIR` with
// no `.git` of its own does not fail — it silently becomes a subdirectory of whatever repository
// sits above it. That is how a test sandbox under the temp directory put 232 commits into a
// repository in the home folder: the sandbox had no `git init`, and the home folder had one. The
// ceiling is **prevention** — git is told never to climb past `REPO_DIR`, and the variables that
// point it somewhere else outright (a git hook sets several) are removed. The assertion is the
// **invariant**: `git rev-parse --show-toplevel` must name `REPO_DIR`, checked immediately before
// the operation, and the git directory git is actually using must be the one `REPO_DIR/.git`
// names. Both, because the first alone is not enough: with `GIT_DIR` pointing elsewhere, git takes
// the working directory as the top of the work tree, so `--show-toplevel` names `REPO_DIR` while
// the commit lands in the other repository. Checked together they hold however discovery was
// influenced — a variable this list does not know, a `.git` file, a future change in git.
//
// Failure behavior: `assertOwnRepository` throws `RepositoryError` and runs nothing. What a caller
// does with that is its own call — `runBatch` treats it as a failed commit in production and as a
// thrown error everywhere else, because a missing repository in a test is a harness bug that must
// not pass quietly for two months.

import { execFile, execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { REPO_DIR } from "../store/paths.ts";

const run = promisify(execFile);

/** Each of these points git at a repository other than the one discovery would find. */
const REDIRECTS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_NAMESPACE",
];

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

/** Symlinks, junctions and `subst` drives resolved, because git compares against resolved paths. */
function real(dir: string): string {
  try {
    return realpathSync.native(dir);
  } catch {
    return path.resolve(dir);
  }
}

/**
 * `GIT_CEILING_DIRECTORIES` with `parent` in front of whatever was already set. Pure, so both
 * platforms' rules are testable from either: the list is `;`-separated on Windows and
 * `:`-separated elsewhere, each entry absolute with no trailing separator — except a filesystem
 * root, which has nothing left to trim. `parent` must already be symlink-resolved: git resolves the
 * working directory before comparing, so an unresolved ceiling would simply never match. Ours goes
 * first because an empty entry in an existing value tells git to stop resolving the entries after it.
 */
export function ceilingValue(parent: string, existing: string | undefined, platform: string): string {
  const win = platform === "win32";
  const root = (win ? path.win32 : path.posix).parse(parent).root;
  let entry = parent.length > root.length ? parent.replace(/[\\/]+$/, "") : parent;
  if (win) entry = entry.replaceAll("\\", "/");
  return existing ? `${entry}${win ? ";" : ":"}${existing}` : entry;
}

/** The options every git command in this app runs with. Recomputed per call; it is cheap. */
export function gitOptions(): { cwd: string; env: NodeJS.ProcessEnv } {
  const env = { ...process.env };
  for (const key of REDIRECTS) delete env[key];
  env.GIT_CEILING_DIRECTORIES = ceilingValue(
    path.dirname(real(REPO_DIR)),
    process.env.GIT_CEILING_DIRECTORIES,
    process.platform,
  );
  return { cwd: REPO_DIR, env };
}

const samePath = (a: string, b: string): boolean => {
  const fold = process.platform === "win32" || process.platform === "darwin";
  const norm = (dir: string): string => {
    const resolved = path.resolve(real(dir));
    return fold ? resolved.toLowerCase() : resolved;
  };
  return norm(a) === norm(b);
};

/**
 * The git directory `REPO_DIR` itself names: `.git` when it is a directory, or where a `.git` file
 * (a worktree, a submodule) points. Null when there is neither, which means no repository of its own.
 */
function ownGitDir(): string | null {
  const dotGit = path.join(REPO_DIR, ".git");
  try {
    if (statSync(dotGit).isDirectory()) return dotGit;
    const named = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"));
    return named === null ? null : path.resolve(REPO_DIR, named[1].trim());
  } catch {
    return null;
  }
}

/**
 * The verdict on what git reported, run from `REPO_DIR`: its work-tree top and the git directory it
 * is using, or nulls when it found no repository at all. Pure over its inputs, so the case the
 * environment is scrubbed of — `GIT_DIR` — can still be checked against real git output.
 */
export function checkRepository(toplevel: string | null, gitDir: string | null): void {
  const expected = ownGitDir();
  if (toplevel === null || gitDir === null || expected === null) {
    throw new RepositoryError(
      `${REPO_DIR} is not a git repository, so there is nothing to commit into. Run git init there, ` +
        "or point ATTUNE_REPO_DIR at a checkout",
    );
  }
  if (!samePath(toplevel, REPO_DIR) || !samePath(gitDir, expected)) {
    throw new RepositoryError(
      `git resolved the repository at ${gitDir} (work tree ${toplevel}), not ${REPO_DIR}'s own; ` +
        "refusing to commit, push or check out into a repository this app does not own",
    );
  }
}

const REV_PARSE = ["rev-parse", "--show-toplevel", "--absolute-git-dir"];

function parse(out: string): [string | null, string | null] {
  const [toplevel, gitDir] = out.trim().split(/\r?\n/);
  return [toplevel || null, gitDir || null];
}

/** Throws unless git, run from `REPO_DIR` with this app's options, is using `REPO_DIR`'s repository. */
export async function assertOwnRepository(): Promise<void> {
  let found: [string | null, string | null];
  try {
    found = parse((await run("git", REV_PARSE, gitOptions())).stdout);
  } catch {
    found = [null, null];
  }
  checkRepository(...found);
}

/** The same, for `scripts/dev.mjs`'s shutdown push, which cannot await (Node's exit path). */
export function assertOwnRepositorySync(): void {
  let found: [string | null, string | null];
  try {
    found = parse(
      execFileSync("git", REV_PARSE, { ...gitOptions(), stdio: ["ignore", "pipe", "ignore"] }).toString(),
    );
  } catch {
    found = [null, null];
  }
  checkRepository(...found);
}
