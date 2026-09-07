// Owns: `npm run check:ui` — the browser checks, and the readable failure when the browser is not
// there. It is deliberately NOT part of `npm test`: `npm test` is deterministic and fast, and a
// suite that needs a 130 MB browser download to run at all is a suite people stop running.
//
// **`npm run publish-check` must never call this** (Phase 6a approval, condition 1). Its fresh-clone
// test installs into a temp directory and starts the app; a clone has no browser binaries, so
// invoking the browser checks there would turn "is this repo publishable" into "did someone run
// playwright install on this machine". Phase 11 owns `publish-check`; this comment is the note it
// should read before wiring anything.
//
// Failure behavior: the one failure worth handling is the common one. Playwright's own message for
// a missing browser is a wall of text about registry paths; this prints the single command that
// fixes it and exits 1. Everything else is passed through untouched — a failing check should look
// like a failing check.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const INSTALL = "npx playwright install chromium";

const { chromium } = await import("@playwright/test").catch(() => ({ chromium: null }));

if (chromium === null) {
  console.error(
    "check:ui: @playwright/test is not installed.\n" +
      "  Run `npm install` first, then `" + INSTALL + "`.",
  );
  process.exit(1);
}

let executable = null;
try {
  executable = chromium.executablePath();
} catch {
  executable = null;
}

if (executable === null || !existsSync(executable)) {
  console.error(
    "check:ui: the Chromium build Playwright drives is not installed on this machine.\n" +
      "\n" +
      "  Run:  " + INSTALL + "\n" +
      "\n" +
      "  It is a one-time download of about 130 MB, kept outside this repository. The browser\n" +
      "  checks are separate from `npm test` on purpose, so a checkout without it still runs the\n" +
      "  whole unit suite.",
  );
  process.exit(1);
}

const result = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
