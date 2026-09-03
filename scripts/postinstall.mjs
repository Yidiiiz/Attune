// Owns: pointing git at the repo's tracked hook directory, on every npm install.
// Failure behavior: any failure is swallowed with a one-line notice. A missing git,
// a tarball with no checkout, or a read-only config must never break `npm install`;
// the cost is that the pre-commit secret scan is absent until git works again.

import { execFileSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
}

try {
  git(["rev-parse", "--git-dir"]);
} catch {
  process.exit(0); // not a checkout (tarball install, vendored copy) — nothing to configure
}

const HOOKS_PATH = ".githooks";

try {
  let current = "";
  try {
    current = git(["config", "core.hooksPath"]);
  } catch {
    current = ""; // unset
  }
  if (current === HOOKS_PATH) process.exit(0); // dirty check: never write a value already set
  git(["config", "core.hooksPath", HOOKS_PATH]);
  console.log(`postinstall: git core.hooksPath set to ${HOOKS_PATH}`);
} catch (err) {
  console.warn(`postinstall: could not set core.hooksPath (${err.message}); commits will not be scanned for secrets`);
}
