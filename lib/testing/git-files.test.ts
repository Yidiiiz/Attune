import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GIT_FILES } from "./git-files.ts";

// The list in `git-files.ts` is what `vitest.config.ts` runs in one fork, and a list is only as good
// as the thing that keeps it complete. A test file added later that builds a checkout and is not
// named there runs in the parallel project and brings the contention back — one file at a time, so
// the symptom is the suite getting flaky again rather than anything failing here.
//
// The name it looks for is assembled at runtime rather than written out, for the reason AGENTS.md
// amendment `r` gives: a scan whose needle is spelled literally in the file doing the scanning finds
// itself first, and the fix is the needle, never a skip list for the address.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NEEDLE = ["create", "Checkout"].join("");

/** Every tracked `*.test.ts` file, as forward-slash paths relative to the repository root. */
function trackedTests(): string[] {
  return execFileSync("git", ["ls-files", "*.test.ts"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

/** The ones whose text calls the helper that builds a git checkout. */
function buildsACheckout(): string[] {
  return trackedTests()
    .filter((rel) => readFileSync(path.join(ROOT, rel), "utf8").includes(NEEDLE))
    .sort();
}

describe("the serial project's file list", () => {
  it("names every test file that builds a git checkout, and only those", () => {
    // If this fails with a file on the left, add it to GIT_FILES; with one on the right, it no
    // longer needs its own fork and can come out.
    expect(buildsACheckout()).toEqual([...GIT_FILES].sort());
  });

  it("finds files at all, so an empty scan cannot pass it", () => {
    // The scan reads tracked files, so an untracked one is invisible to it — the blind spot
    // amendment `r` names. What this rules out is the other failure: a scan that matches nothing
    // and agrees with an empty list.
    expect(trackedTests().length).toBeGreaterThan(GIT_FILES.length);
    expect(GIT_FILES.length).toBeGreaterThan(0);
  });

  it("lists each file once, and none of them is this file", () => {
    expect(new Set(GIT_FILES).size).toBe(GIT_FILES.length);
    expect(GIT_FILES).not.toContain("lib/testing/git-files.test.ts");
  });
});
