// Owns: `npm run check:ui` — the browser checks, and the two refusals that make a failing run mean
// what it says. It is deliberately NOT part of `npm test`: `npm test` is deterministic and fast, and
// a suite that needs a 130 MB browser download to run at all is a suite people stop running.
//
// **`npm run publish-check` must never call this** (Phase 6a approval, condition 1). Its fresh-clone
// test installs into a temp directory and starts the app; a clone has no browser binaries, so
// invoking the browser checks there would turn "is this repo publishable" into "did someone run
// playwright install on this machine". Phase 11 owns `publish-check`; this comment is the note it
// should read before wiring anything.
//
// **Why the port scan comes first.** The suite is one worker against one data directory, and several
// of its assertions are about how long something takes to appear. Another server on the machine does
// not collide with it — it competes with it, so it surfaces as a check timing out, which reads as a
// real failure and is not one. That happened once during Phase 6a: two `next dev` processes left by
// timed-out invocations turned a clear result into a 9.9-minute mystery, and the tell was in the
// timings rather than in the output. Strays accumulate because a `npm run dev` whose terminal is
// killed never reaches the shutdown path in `scripts/dev.mjs`. Running before the browser check also
// means this guard needs nothing installed, which is why `check-ui.test.ts` can cover it.
//
// Failure behavior: refuses with the command to run, and never guesses. A port that answers is the
// observable consequence — connect versus ECONNREFUSED — and the timeout on the probe is a failure
// guard so the script cannot hang, not the thing being measured. Anything else Playwright reports is
// passed through untouched: a failing check should look like a failing check. The one exception is
// a check tagged `@known-flake`, which is reported under its own heading after the rest and does
// not decide the exit code (`playwright-run.ts`).

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import { DEV_PORTS, E2E_PORT } from "../e2e/ports.ts";
import { runChecks } from "./playwright-run.ts";

const INSTALL = "npx playwright install chromium";
const PROBE_TIMEOUT_MS = 1_000;
const WINDOWS = process.platform === "win32";

/** True when something answers on the port. Loopback refuses instantly when nothing is there. */
function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (answer) => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false)); // ECONNREFUSED: nothing is listening
    socket.once("timeout", () => done(false)); // neither answer arrived; say so rather than block
  });
}

/** The pid holding a port, so the refusal can name what to kill rather than describe it. */
function pidOn(port) {
  try {
    if (WINDOWS) {
      const out = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
      for (const line of out.split("\n")) {
        const parts = line.trim().split(/\s+/); // proto, local, foreign, state, pid
        if (parts.length === 5 && parts[3] === "LISTENING" && parts[1].endsWith(`:${port}`)) {
          return parts[4];
        }
      }
      return null;
    }
    return execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).trim().split("\n")[0] || null;
  } catch {
    return null; // no netstat, no lsof, or it refused — the port number is still enough to act on
  }
}

function killAdvice(port) {
  const pid = pidOn(port);
  if (pid === null) {
    return WINDOWS
      ? `netstat -ano -p tcp | findstr :${port}   then   taskkill /PID <pid> /F`
      : `lsof -ti tcp:${port} -sTCP:LISTEN | xargs kill`;
  }
  return WINDOWS ? `pid ${pid} — taskkill /PID ${pid} /F` : `pid ${pid} — kill ${pid}`;
}

const busy = [];
for (const port of [E2E_PORT, ...DEV_PORTS]) {
  if (await listening(port)) busy.push(port);
}

if (busy.length > 0) {
  const rows = busy
    .map((port) => {
      const what =
        port === E2E_PORT
          ? "the port these checks start their own server on"
          : "the app's dev port";
      return `  127.0.0.1:${port}  ${what}\n    ${killAdvice(port)}`;
    })
    .join("\n\n");

  console.error(
    "check:ui: refusing to start — something is already listening on a port these checks need free.\n" +
      "\n" +
      rows +
      "\n" +
      "\n" +
      "  Quit it and run this again. A server left running does not collide with these checks, it\n" +
      "  competes with them for the machine, and the result is a check that times out and looks\n" +
      "  like a real failure. A `npm run dev` whose terminal was killed never runs its shutdown, so\n" +
      "  strays accumulate quietly.",
  );
  process.exit(1);
}

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

// The checks themselves, gating first and known flakes apart (Decision 83), with every argument
// handed to Playwright as one argv entry and no shell in between — `playwright-run.ts` says why.
process.exit(runChecks(process.argv.slice(2)));
