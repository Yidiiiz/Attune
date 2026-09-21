// Owns: the check that the test suite cleans up after itself — vitest's `globalSetup` (see
// `vitest.config.ts`). It lists the test-made directories in the system temp directory before any
// test file runs, lists them again after the last one finishes, and fails the run if any are new.
// `lib/testing/checkout.ts` is what removes them; this is what proves it did, the way the B1
// review's addendum asked (AGENTS.md).
//
// It counts names, not the whole temp directory: `%TEMP%` is shared with every other process on the
// machine, and a count of everything in it would fail on whatever else happened to write there. The
// names counted are `checkout.ts`'s prefix and `scripts/check-ui.test.ts`'s, which are all the test
// suite makes. A test that makes a temp directory under some other name escapes this check, which is
// why tests go through `createTempDir` rather than calling `mkdtemp` themselves.
//
// **It is also the last line of removal.** Every directory `createTempDir` makes is written to a
// registry this file provides, and teardown removes any registered directory still there — the
// ones whose file never ran its `afterAll`, or ran it and could not remove them. That removal does
// not rescue the run: it fails all the same and says what it removed, because a directory the file
// should have removed and did not is exactly what this check is for. Directories that were already
// there when the run began are never touched, and are not counted against it.
//
// Failure behavior: throws from teardown, naming every new directory and what became of it, which
// fails the run.

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { REGISTRY_KEY, REMOVE, TEMP_PREFIX } from "./checkout.ts";

declare module "vitest" {
  export interface ProvidedContext {
    tempRegistry: string;
  }
}

const PREFIXES = [TEMP_PREFIX, "check-ui-args-"];

/** The names in `dir` a test made, as a set. */
export function testDirectories(dir: string = tmpdir()): Set<string> {
  return new Set(readdirSync(dir).filter((name) => PREFIXES.some((prefix) => name.startsWith(prefix))));
}

/** The names in `after` that were not in `before`, sorted. */
export function newSince(before: Set<string>, after: Set<string>): string[] {
  return [...after].filter((name) => !before.has(name)).sort();
}

export default function setup(project: TestProject): () => void {
  const before = testDirectories();
  // Not under a counted prefix, so the registry is never one of the directories it lists.
  const registry = path.join(tmpdir(), `vitest-temp-registry-${process.pid}.txt`);
  writeFileSync(registry, "");
  project.provide(REGISTRY_KEY, registry);

  return () => {
    const left = newSince(before, testDirectories());
    const registered = new Set(readFileSync(registry, "utf8").split("\n").filter(Boolean).map((dir) => path.basename(dir)));
    rmSync(registry, { force: true });
    if (left.length === 0) return;

    const fates = left.map((name) => {
      if (!registered.has(name)) return `${name} — not made through createTempDir; left in place`;
      const dir = path.join(tmpdir(), name);
      try {
        rmSync(dir, REMOVE);
      } catch (err) {
        return `${name} — its file did not remove it, and neither could teardown: ${(err as Error).message}`;
      }
      return existsSync(dir) ? `${name} — still there after teardown's removal` : `${name} — its file did not remove it; teardown did`;
    });
    throw new Error(
      `the test run left ${left.length} temp director${left.length === 1 ? "y" : "ies"} in ${tmpdir()} ` +
        `(was ${before.size}, then ${before.size + left.length}):\n  ${fates.join("\n  ")}`,
    );
  };
}
