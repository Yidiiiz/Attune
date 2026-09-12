// Covers the one property of `renameAtomic` that cannot be checked from inside it: that everything
// else in the project actually calls it. PROJECT.md Decision 71 says "every atomic write in the
// project goes through it", and until this file existed that sentence was prose — `settings.ts` had
// two renames of its own and `env.ts` a third, all written after the Decision and all past it. A
// function cannot see who declined to call it, so the check has to read the repository instead.
//
// Every forbidden form here is assembled from fragments at runtime, for the same reason
// `scripts/check-secrets.test.ts` builds its fake keys that way: this file is inside the scan it
// performs, and a scanner that trips on its own pattern list teaches everyone to ignore it.
//
// Failure behavior: reports every occurrence, not the first, with the remedy and the reason on the
// same message — a check whose output does not say what to do instead gets suppressed.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/** The one file allowed to hold the import, and only inside the function below. */
const HOME = "lib/store/files.ts";
const FUNCTION = "rena" + "meAtomic";

const R = "rena" + "me";
/** A binding list that brings the call in under any name: `{ rename }`, `{ rename as fsRename }`. */
const BINDING = new RegExp(String.raw`\b${R}(?:Sync)?\b`);
/** `import { … } from "node:fs"` and its `require` equivalent, for fs under any of its four names. */
const FS_SOURCE = String.raw`["'](?:node:)?fs(?:\/promises)?["']`;
const IMPORTED = new RegExp(String.raw`\{([^}]*)\}\s*(?:from|=\s*require\()\s*${FS_SOURCE}`, "g");
/** `fs.rename(`, `fs.promises.rename(`, `anyNamespace.renameSync(` — not `.renameAtomic(`. */
const MEMBER_CALL = new RegExp(String.raw`\.\s*${R}(?:Sync)?\s*\(`, "g");

const SOURCE = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);

/**
 * Every source file the repository tracks. `git ls-files` rather than a directory walk because the
 * ignored things here are not a fixed list — `.e2e-sandbox/` is a whole second checkout of this
 * repo, `test-results/` comes and goes — and because a directory added later is then covered
 * without anyone remembering to add it. Forgetting is the failure mode being closed.
 */
function sourceFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
  return out
    .split("\0")
    .filter((rel) => rel !== "" && SOURCE.has(path.extname(rel)));
}

/** Where `renameAtomic`'s body starts and ends, by its declaration and its closing brace. */
function implementation(source: string): { start: number; end: number } {
  const start = source.indexOf(`export async function ${FUNCTION}`);
  const close = source.indexOf("\n}\n", start);
  expect(start, `${HOME} no longer exports ${FUNCTION}`).toBeGreaterThan(-1);
  expect(close, `${FUNCTION} has no closing brace at column 0`).toBeGreaterThan(start);
  return { start, end: close + 3 };
}

const WHY = [
  `Every atomic write in this project goes through ${FUNCTION} in ${HOME} (PROJECT.md`,
  "Decision 71). It retries the transient Windows EPERM that a scanner or an indexer causes by",
  "holding a file for a few milliseconds; a write that skips it loses what it was writing, which",
  "Phase 6b saw once in about thirty browser runs and read as flakiness.",
  "",
  "The case this check exists for is the corrupt-settings quarantine rename in lib/store/settings.ts.",
  "That one runs *only* when settings.json is already unparseable, so losing it leaves the app with",
  "no settings and no broken copy to look at — the cost is the evidence of a problem you already",
  "have. Three writers drifted past this rule while it was only prose; the fourth should not be able",
  `to, which is why this is a test and not a sentence.`,
  "",
  `Import { ${FUNCTION} } from the store's files module and call that instead. It takes absolute`,
  "paths and resolves nothing, so a write outside the data tree — .env.local — can use it too.",
].join("\n");

describe(`${FUNCTION} is the only rename in the project`, () => {
  const files = sourceFiles();

  it("finds the repository to scan", () => {
    // A scan that silently matched nothing would pass forever, which is the one way this check can
    // fail at its job without failing.
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain(HOME);
  });

  it("has no direct filesystem rename anywhere outside it", () => {
    const found: string[] = [];

    for (const rel of files) {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      const exempt = rel === HOME ? implementation(source) : null;
      const at = (index: number): string =>
        `${rel}:${source.slice(0, index).split("\n").length}`;

      for (const match of source.matchAll(IMPORTED)) {
        // The home file is allowed the import; the next test is what holds it to one call site.
        if (rel === HOME) continue;
        if (BINDING.test(match[1])) found.push(`${at(match.index)} — imports it from node:fs`);
      }
      for (const match of source.matchAll(MEMBER_CALL)) {
        if (exempt !== null && match.index >= exempt.start && match.index < exempt.end) continue;
        found.push(`${at(match.index)} — calls it on an fs namespace`);
      }
    }

    // The offenders are in the message, in full — the diff below it only says how many.
    expect(found.length, `\n${found.join("\n")}\n\n${WHY}\n`).toBe(0);
  });

  it("is where the one permitted call lives, and nowhere else in its own file", () => {
    const source = readFileSync(path.join(ROOT, HOME), "utf8");
    const { start, end } = implementation(source);

    // The local name is read from the import rather than assumed, so renaming the alias does not
    // quietly turn this assertion into one that checks nothing.
    const imported = [...source.matchAll(IMPORTED)].map((match) => match[1]).join(",");
    const bound = new RegExp(String.raw`\b${R}(?:Sync)?\b(?:\s+as\s+(\w+))?`).exec(imported);
    expect(bound, `${HOME} no longer imports a rename from node:fs`).not.toBeNull();
    const local = bound?.[1] ?? R;

    const calls = [...source.matchAll(new RegExp(String.raw`\b${local}\s*\(`, "g"))].map((m) => m.index);
    expect(calls.length, `${HOME} never calls ${local}`).toBeGreaterThan(0);
    for (const index of calls) {
      const line = source.slice(0, index).split("\n").length;
      expect(index, `${HOME}:${line} calls ${local} outside ${FUNCTION}\n\n${WHY}\n`)
        .toBeGreaterThanOrEqual(start);
      expect(index, `${HOME}:${line} calls ${local} outside ${FUNCTION}\n\n${WHY}\n`).toBeLessThan(end);
    }
  });
});
