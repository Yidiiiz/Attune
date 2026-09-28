// Owns: the throwaway checkout the browser checks run against. Wiped and re-seeded before every
// run, so a check never inherits state from the last one and never sees the owner's `data/`.
//
// It is a real git repository, and `data/` is ignored in it exactly as in the real one. The app
// commits nothing under `data/` (`lib/history/batch.ts`), so a sandbox that tracked it would let
// every check about committing pass against a world the app does not run in. `e2e/branching.spec.ts`
// is where that is read back: the §15 item is now one *batch* per finalized turn and no commit, and
// both halves of it are claims about files this sandbox holds.
//
// Failure behavior: throws, which fails the run before a single check has misled anyone. A harness
// that quietly ran against a directory it could not prepare would report passes that mean nothing.

import { execFileSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SANDBOX = path.join(REPO, ".e2e-sandbox");

export default async function globalSetup(): Promise<void> {
  await rm(SANDBOX, { recursive: true, force: true });
  await mkdir(SANDBOX, { recursive: true });
  await cp(path.join(REPO, "seed"), path.join(SANDBOX, "data"), { recursive: true });

  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: SANDBOX, stdio: "ignore" });
  };
  await writeFile(path.join(SANDBOX, ".gitignore"), "data/\n");
  git("init", "-q");
  git("config", "user.email", "checks@example.invalid");
  git("config", "user.name", "browser checks");
  // No hooks: the pre-commit scan is checked by its own test, and a hook path pointing back at the
  // real repository would make this sandbox depend on it.
  git("config", "core.hooksPath", ".githooks-none");
  git("add", "-A");
  git("commit", "-q", "-m", "seed", "--allow-empty");
}
