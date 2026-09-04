// Owns: refusing to let anything that looks like a credential reach a commit.
// Run by .githooks/pre-commit on staged content, and by `npm run check-secrets -- --all`
// over every tracked file (PROJECT.md §11.5).
//
// Failure behavior: fails loud and closed. A hit exits 1 naming file and line; a git command that
// will not run also exits 1, because a scanner that silently passes is worse than no scanner.
// Binary and unreadable files are skipped by design, not by accident — they are reported as skipped.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The patterns live in lib/security/secrets.ts so this hook and the history log share one
// definition of a credential (PROJECT.md §11.5). Node strips the types on import (Decision 44).
import { SECRET_PATTERNS as PATTERNS } from "../lib/security/secrets.ts";

const all = process.argv.includes("--all");

function git(args) {
  return execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });
}

let files;
try {
  const out = all
    ? git(["ls-files", "-z"])
    : git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]);
  files = out.toString("utf8").split("\0").filter(Boolean);
} catch (err) {
  console.error(`check-secrets: could not list files (${err.message})`);
  process.exit(1);
}

let hits = 0;
let scanned = 0;

for (const file of files) {
  let buf;
  try {
    // --all reads tracked files as they are on disk; the hook reads *staged* content, so a file
    // edited after `git add` cannot slip a secret past the commit it is not part of.
    buf = all ? readFileSync(file) : git(["show", `:${file}`]);
  } catch {
    continue; // deleted, unmerged, or nothing staged for this path
  }

  if (buf.includes(0)) continue; // binary
  scanned += 1;

  const lines = buf.toString("utf8").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    for (const { name, re } of PATTERNS) {
      if (re.test(lines[i])) {
        console.error(`${file}:${i + 1}: possible ${name}`);
        hits += 1;
        break; // one report per line is enough to stop the commit
      }
    }
  }
}

if (hits > 0) {
  console.error(`\ncheck-secrets: ${hits} possible secret${hits === 1 ? "" : "s"} found. Commit refused.`);
  console.error("check-secrets: secrets belong in .env.local, which is gitignored.");
  process.exit(1);
}

console.log(`check-secrets: ${scanned} file${scanned === 1 ? "" : "s"} clean`);
