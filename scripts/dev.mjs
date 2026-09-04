// Owns: `npm run dev` — running the Next dev server and guaranteeing the push flush on shutdown.
// This wrapper is the single owner of that flush (PROJECT.md Decision 43). instrumentation.ts does
// not push on beforeExit; one owner, one path. Everything after a signal is synchronous, because
// Node's exit path cannot await anything.
//
// Failure behavior: a failing push prints to the inherited stdio and the process still exits with
// the child's code — a dev server you cannot quit is worse than an unpushed commit, and the next
// commit will push it. No remote, no upstream, or nothing ahead: the push is skipped silently.

import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const NEXT_BIN = fileURLToPath(import.meta.resolve("next/dist/bin/next"));
const PUSH_TIMEOUT_MS = 20_000;

// Before anything else: clear a .git/index.lock this script's own shutdown may have left behind.
// killChildTree below uses `taskkill /T /F`, which cannot be delivered gracefully, so a Ctrl+C
// landing mid-commit outlives the process as a lock file. Doing it here rather than lazily inside
// git.ts keeps it to one check per session, at the one moment no batch can be running.
const { clearStaleIndexLock } = await import("../lib/history/git.ts");
await clearStaleIndexLock();

const child = spawn(process.execPath, [NEXT_BIN, "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  windowsHide: true,
});

let shuttingDown = false;

function killChildTree() {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === "win32") {
      // Windows has no process groups to signal; taskkill /T is how the whole tree goes down.
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    // The console almost always delivered Ctrl+C to the child already. Nothing to do.
  }
}

function gitOut(args) {
  return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
}

function flushPush() {
  try {
    gitOut(["remote", "get-url", "origin"]);
  } catch {
    return; // no remote: sync state is local, push is skipped silently
  }

  let ahead;
  try {
    ahead = Number(gitOut(["rev-list", "--count", "@{u}..HEAD"]));
  } catch {
    return; // no upstream configured for this branch
  }
  if (!Number.isFinite(ahead) || ahead === 0) return;

  console.log(`\ndev: pushing ${ahead} commit${ahead === 1 ? "" : "s"} before exit`);
  try {
    execFileSync("git", ["push"], { stdio: "inherit", timeout: PUSH_TIMEOUT_MS });
  } catch (err) {
    console.error(`dev: push failed (${err.message}). Your commits are safe locally; run 'git push' when you can.`);
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  killChildTree();
  flushPush();
  process.exit(code ?? 0);
}

for (const signal of ["SIGINT", "SIGBREAK", "SIGHUP"]) {
  process.on(signal, () => shutdown(0));
}

child.on("exit", (code, signal) => shutdown(signal ? 0 : (code ?? 0)));
child.on("error", (err) => {
  console.error(`dev: could not start next (${err.message})`);
  process.exit(1);
});
