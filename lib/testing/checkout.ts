// Owns: the throwaway checkout a test that commits runs against — a temp directory with **its own**
// git repository, pointed at by `ATTUNE_REPO_DIR` (Decision 45). One helper, so the next test file
// cannot build a sandbox without `git init`: `lib/history/chat-actions.test.ts` did, git's discovery
// climbed out of the temp directory, and 232 of its undo commits landed in a repository in the
// home folder. `runBatch` now refuses that outside production (`lib/history/repository.ts`); this
// is the other half — the repository is created with the directory, so there is no step to forget.
//
// Call it at the top of a test file, **before** importing any app module: `paths.ts` reads
// `ATTUNE_REPO_DIR` once, when it loads.
//
// Failure behavior: throws if the directory it made is not the top of its own repository, which is
// the check that would have caught the original bug on the first run.

import { execFileSync } from "node:child_process";
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

export async function createCheckout(name: string): Promise<Checkout> {
  const dir = await mkdtemp(path.join(tmpdir(), `attune-${name}-`));
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
