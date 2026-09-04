// Covers the one property of the scanner that matters beyond catching a secret: that it reports a
// location and never the text it matched. Its output goes to a terminal, a CI log, and — when the
// hook refuses a commit — into git's error message, which `markCommitFailed` writes to `data/`.
// A scanner that echoed the line it found would put the secret in all three (PROJECT.md §11.5).

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-secrets.mjs");
const SECRET = "AKIA" + "TESTONLYFAKEKEY1";

const repos: string[] = [];

function stagedRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "attune-secrets-"));
  repos.push(dir);
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  execFileSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}

function run(cwd: string): { code: number; output: string } {
  const result = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" });
  return { code: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  // Left behind deliberately on Windows if a handle lingers; a stale temp dir is not worth a failure.
  for (const dir of repos.splice(0)) {
    try {
      execFileSync("cmd", ["/c", "rmdir", "/s", "/q", dir], { stdio: "ignore" });
    } catch {
      /* ignore */
    }
  }
});

describe("check-secrets", () => {
  it("refuses the commit and names the file and line", () => {
    const { code, output } = run(stagedRepo({ "notes/leak.md": `intro\nkey ${SECRET}\ntail\n` }));
    expect(code).toBe(1);
    expect(output).toContain("notes/leak.md:2: possible aws access key id");
    expect(output).toContain("Commit refused");
  });

  it("never echoes the text it matched", () => {
    const { output } = run(stagedRepo({ "notes/leak.md": `key ${SECRET}\n` }));
    expect(output).not.toContain(SECRET);
    // Not even a fragment: a truncated key is still a key with its shape intact.
    expect(output).not.toContain(SECRET.slice(0, 8));
  });

  it("passes a repository with nothing key-shaped in it", () => {
    const { code, output } = run(stagedRepo({ "notes/fine.md": "an ordinary note\n" }));
    expect(code).toBe(0);
    expect(output).toContain("clean");
  });
});
