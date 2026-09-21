// Owns: the throwaway checkout a test that commits runs against — a temp directory with **its own**
// git repository, pointed at by `ATTUNE_REPO_DIR` (Decision 45). One helper, so the next test file
// cannot build a sandbox without `git init`: `lib/history/chat-actions.test.ts` did, git's discovery
// climbed out of the temp directory, and 232 of its undo commits landed in a repository in the
// home folder. `runBatch` now refuses that outside production (`lib/history/repository.ts`); this
// is the other half — the repository is created with the directory, so there is no step to forget.
//
// **Every directory it makes is removed when its test file finishes, pass or fail.** Creating one
// registers an `afterAll` on the calling file that deletes it and writes it to the run's registry,
// so there is no step to forget there either. Until Phase 8 B2 nothing removed them, and 430 had
// piled up in `%TEMP%` (AGENTS.md, the B1 review's addendum). `createTempDir` is the same
// registration for a test that needs a scratch directory and not a repository, so those go through
// here too. `lib/testing/leftovers.ts` is the check that this holds: the suite fails if it ends with
// more of these directories than it began with.
//
// Call it at the top of a test file, **before** importing any app module: `paths.ts` reads
// `ATTUNE_REPO_DIR` once, when it loads.
//
// Failure behavior: throws if the directory it made is not the top of its own repository, which is
// the check that would have caught the original bug on the first run. A directory that cannot be
// removed fails its file's `afterAll` after retries, and the run's teardown removes it and fails the
// run, rather than leaving it behind in silence.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface Checkout {
  /** The checkout: `ATTUNE_REPO_DIR`. */
  dir: string;
  /** `dir/data`. */
  data: string;
  /** Run git in the checkout, contained to it exactly as the app's own git is. Returns stdout. */
  git: (...args: string[]) => string;
  /**
   * Put `data/` back — to a copy of `seed/`, or empty — run `setup`, and commit the lot, so each
   * case starts from a clean tree that is also clean in git.
   */
  reset: (options?: { from?: "seed" | "empty"; setup?: () => Promise<void> }) => Promise<void>;
}

/** The prefix every directory made here carries, and what `leftovers.ts` counts. */
export const TEMP_PREFIX = "attune-";

/** The key `leftovers.ts` provides the run's registry file under. */
export const REGISTRY_KEY = "tempRegistry";

/** Retries for Windows, where a git process a timed-out test left running holds the directory. */
export const REMOVE = { recursive: true, force: true, maxRetries: 30, retryDelay: 200 } as const;

/**
 * A fresh directory under the system temp directory, removed when the calling test file finishes
 * — after its own `afterAll` hooks, since vitest runs those in reverse order and this one is
 * registered first, at the top of the file.
 *
 * It is also written to the run's registry (`lib/testing/leftovers.ts`), because `afterAll` does
 * not cover every failure. A file that throws while it loads — after this ran, before its first
 * test — is never collected, so none of its hooks run; and under load a test that times out leaves
 * its git process running in the directory, and the removal here can fail with EPERM (both found in
 * Phase 8 B2, the first by planting a throw, the second on a machine under load).
 * The run's teardown removes what is still registered and fails the run naming it.
 */
export async function createTempDir(name: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `${TEMP_PREFIX}${name}-`));
  // Imported here rather than at the top: vitest refuses to load outside its runner, and
  // `scripts/check-lib-imports.mjs` loads every module under `lib/` in plain Node.
  const { afterAll, inject } = await import("vitest");
  const registry = inject(REGISTRY_KEY);
  if (typeof registry !== "string") {
    await rm(dir, REMOVE);
    throw new Error("createTempDir: no temp registry; run the tests through vitest.config.ts");
  }
  appendFileSync(registry, `${dir}\n`);
  // Linear backoff over 30 tries is about 90 seconds at worst, inside this hook's two minutes.
  afterAll(() => rm(dir, REMOVE), 120_000);
  return dir;
}

export async function createCheckout(name: string): Promise<Checkout> {
  const dir = await createTempDir(name);
  const data = path.join(dir, "data");
  process.env.ATTUNE_REPO_DIR = dir;

  // After the variable is set, so `paths.ts` resolves this checkout and not the repository itself.
  const { assertOwnRepository, gitOptions } = await import("../history/repository.ts");

  const git = (...args: string[]): string =>
    execFileSync("git", args, { ...gitOptions(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

  git("init", "-q");
  git("config", "user.email", "check@example.invalid");
  git("config", "user.name", "check");
  // A global signing setup would otherwise make every commit in a test depend on a key agent.
  git("config", "commit.gpgsign", "false");
  // The project's own rule (Decision 42), so a sandbox stores bytes the way the real repository does.
  await writeFile(path.join(dir, ".gitattributes"), "* text=auto eol=lf\n");
  git("add", "-A");
  git("commit", "-q", "-m", "checkout");
  await assertOwnRepository();

  const reset: Checkout["reset"] = async ({ from = "seed", setup } = {}) => {
    await rm(data, { recursive: true, force: true });
    if (from === "seed") await cp(path.join(ROOT, "seed"), data, { recursive: true });
    else await mkdir(data, { recursive: true });
    await setup?.();
    git("add", "-A");
    git("commit", "-q", "-m", "reset", "--allow-empty");
  };

  return { dir, data, git, reset };
}
