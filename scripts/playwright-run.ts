// Owns: how `npm run check:ui` hands its arguments to Playwright, and the gating/known-flake split
// that decides its exit code. `check-ui.mjs` runs its guards and then calls `runChecks`; everything
// here is importable without side effects so `check-ui.test.ts` can drive it with a fake CLI.
//
// **No shell, on any platform** (the Phase 8 approval, Step 0). Until Phase 8 this spawned `npx` with
// `shell: true` on Windows, because `npx` is a `.cmd` there and cannot be spawned without one. The
// shell then re-parsed every argument: `-g "Stop leaves"` arrived as `-g Stop leaves`, so `leaves`
// became a file filter, and a `|` or `&` in a pattern ran whatever followed it as a command. Node
// warns about exactly this (DEP0190). The fix is to not need the shell at all: Playwright's CLI is a
// plain JavaScript file, resolved from `@playwright/test`'s own `exports`, and `process.execPath`
// runs it. Each argument is then one argv entry, byte for byte, with nothing between the caller and
// Playwright that interprets it.
//
// Failure behavior: a CLI that cannot be resolved throws, which `check-ui.mjs` reaches only after its
// own install check has passed — so it means a broken install, and says so loudly rather than
// running nothing. Playwright's own output passes through untouched.

import { spawnSync } from "node:child_process";
import type { SpawnSyncOptions, SpawnSyncReturns } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** The CLI file `npx playwright` would have run, found the way Node would find it. */
export function playwrightCli(): string {
  return require.resolve("@playwright/test/cli");
}

/** One Playwright invocation: `node <cli> ...argv`, never through a shell. */
export function playwright(
  argv: string[],
  options: SpawnSyncOptions = {},
  cli: string = playwrightCli(),
): SpawnSyncReturns<string | Buffer> {
  return spawnSync(process.execPath, [cli, ...argv], { ...options, shell: false });
}

/**
 * Run the gating checks, then the known flakes apart (Decision 83), and return the exit status —
 * which only the gating checks decide.
 *
 * `playwright.config.ts` puts every check tagged `@known-flake` in a project of its own. The rest run
 * first and alone decide the result, so a run whose only failure is a filed flake reads as the clean
 * run it is; the flakes then run under their own heading, still reported with their real outcome.
 * Each project is counted with `--list` first so that a filter matching only one of them does not
 * make the other say "No tests found".
 */
export function runChecks(
  args: string[],
  { cli = playwrightCli(), log = console.log }: { cli?: string; log?: (line: string) => void } = {},
): number {
  const count = (project: string): number => {
    const listed = playwright(["test", "--list", `--project=${project}`, ...args], { encoding: "utf8" }, cli);
    const match = /Total: (\d+) tests?/.exec(String(listed.stdout ?? ""));
    return match ? Number(match[1]) : 0;
  };
  const run = (project: string): number =>
    playwright(["test", `--project=${project}`, ...args], { stdio: "inherit" }, cli).status ?? 1;

  const gating = count("chromium");
  const flaky = count("known-flake");

  if (gating === 0 && flaky === 0) {
    // Nothing matched either project: let Playwright say so in its own words.
    return playwright(["test", ...args], { stdio: "inherit" }, cli).status ?? 1;
  }

  const status = gating > 0 ? run("chromium") : 0;

  if (flaky > 0) {
    log(
      `\ncheck:ui: ${flaky} known flake${flaky === 1 ? "" : "s"} — reported here, not counted above ` +
        "(AGENTS.md, Deferred amendments)\n",
    );
    const flakeStatus = run("known-flake");
    log(`\ncheck:ui: known flakes ${flakeStatus === 0 ? "passed" : "failed"} this run; not counted.`);
  }

  if (gating > 0) log(`check:ui: ${status === 0 ? "clean" : "FAILED"} — ${gating} checks decide the result.`);
  return status;
}
