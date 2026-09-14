// Covers the runner, not the suite. Two things are checkable without launching a browser, which is
// exactly what `npm test` must never do:
//
//   - **The port guard.** `npm run check:ui` must refuse to start while another server is on one of
//     the ports it needs free, and must name what to kill. These cases occupy a port first and assert
//     the script never gets as far as Playwright — which is why the port scan runs before the browser
//     check in `check-ui.mjs`: a guard placed after it would be unverifiable on any machine without
//     the 130 MB Chromium download.
//   - **How arguments reach Playwright.** `playwright-run.ts` is driven with a fake CLI that records
//     the argv it was given. Until Phase 8 a shell sat in between on Windows, and a `-g` pattern with
//     a space, a `|` or an `&` in it was re-parsed on the way — split in two, or run as a command.
//     These cases fail if any shell comes back, on either platform: POSIX `sh -c` splits and pipes
//     the same way `cmd.exe` does.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "check-ui.mjs");
const { DEV_PORTS, E2E_PORT } = await import("../e2e/ports.ts");
const { playwright, playwrightCli, runChecks } = await import("./playwright-run.ts");

const release: Array<() => void> = [];

/**
 * Hold a port for the duration of a case. A port that is already taken needs no help: something
 * else is the listener the script is supposed to notice, which is the same condition under test.
 */
function occupy(port: number): Promise<void> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve());
    server.listen(port, "127.0.0.1", () => {
      release.push(() => server.close());
      resolve();
    });
  });
}

function run(): { code: number; output: string } {
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", timeout: 30_000 });
  return { code: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  for (const close of release.splice(0)) close();
});

describe("check:ui's port guard", () => {
  it("refuses while something holds the port the checks start their own server on", async () => {
    await occupy(E2E_PORT);
    const { code, output } = run();

    expect(code).toBe(1);
    expect(output).toContain(`127.0.0.1:${E2E_PORT}`);
    expect(output).toContain("refusing to start");
    // It stopped here rather than going on to Playwright, which is the point of refusing.
    expect(output).not.toContain("playwright install");
  });

  it("refuses for the app's dev port too, since a stray dev server competes rather than collides", async () => {
    await occupy(DEV_PORTS[0]);
    const { code, output } = run();

    expect(code).toBe(1);
    expect(output).toContain(`127.0.0.1:${DEV_PORTS[0]}`);
    expect(output).toContain("competes with them");
  });

  it("names what to kill rather than describing it", async () => {
    await occupy(E2E_PORT);
    const { output } = run();

    // Either a pid and the command for it, or — when netstat/lsof is unavailable — the command that
    // finds one. Never just the port with no way forward.
    const named = /pid \d+ — (taskkill \/PID \d+ \/F|kill \d+)/.test(output);
    const howToFind = /(netstat -ano|lsof -ti)/.test(output);
    expect(named || howToFind).toBe(true);
  });
});

// A stand-in for Playwright's CLI: it appends the argv it was given to a log, answers `--list` with a
// count, and exits with the status the case asks for. Nothing it does depends on a shell.
const FAKE_CLI = `
import { appendFileSync } from "node:fs";
const argv = process.argv.slice(2);
appendFileSync(process.env.FAKE_LOG, JSON.stringify(argv) + "\\n");
const project = argv.find((a) => a.startsWith("--project="))?.slice(10);
if (argv.includes("--list")) console.log("Total: " + (process.env["FAKE_TOTAL_" + project] ?? "1") + " test in 1 file");
process.exit(Number(process.env["FAKE_STATUS_" + project] ?? 0));
`;

describe("how check:ui hands its arguments to Playwright", () => {
  let dir = "";
  let cli = "";
  let log = "";

  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "check-ui-args-"));
    cli = path.join(dir, "fake-cli.mjs");
    writeFileSync(cli, FAKE_CLI);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const ENV_KEYS = ["FAKE_LOG", "FAKE_TOTAL_chromium", "FAKE_TOTAL_known-flake", "FAKE_STATUS_chromium", "FAKE_STATUS_known-flake"];
  beforeEach(() => {
    log = path.join(dir, `log-${Math.random().toString(36).slice(2)}.jsonl`);
    process.env.FAKE_LOG = log;
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  const calls = (): string[][] =>
    readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]);
  const quiet = () => undefined;

  // The three patterns the probe found re-parsed: a space split the pattern in two, and `|` and `&`
  // ran what followed them as a command.
  it.each(["a|b", "Stop leaves", "x&y"])("passes -g %j through as one argument, unchanged", (pattern) => {
    runChecks(["-g", pattern], { cli, log: quiet });

    const seen = calls();
    // Two counts and two runs — both projects matched — and every one ends with the pattern intact.
    expect(seen).toHaveLength(4);
    for (const argv of seen) expect(argv.slice(-2)).toEqual(["-g", pattern]);
  });

  it("runs nothing that follows a | or & in a pattern", () => {
    // With a shell in between, each of these creates its marker file — `cmd.exe` and `sh` alike.
    const piped = path.join(dir, "piped-marker");
    const chained = path.join(dir, "chained-marker");
    const hostile = [`a|echo>${piped}`, `x&echo>${chained}`];

    for (const pattern of hostile) {
      const result = playwright(["test", "-g", pattern], { encoding: "utf8" }, cli);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    }

    expect(existsSync(piped)).toBe(false);
    expect(existsSync(chained)).toBe(false);
    expect(calls().map((argv) => argv.at(-1))).toEqual(hostile);
  });

  it("lets only the gating checks decide the exit status", () => {
    process.env["FAKE_STATUS_known-flake"] = "1";
    expect(runChecks([], { cli, log: quiet })).toBe(0);

    process.env.FAKE_STATUS_chromium = "1";
    delete process.env["FAKE_STATUS_known-flake"];
    expect(runChecks([], { cli, log: quiet })).toBe(1);
  });

  it("hands a filter that matches neither project to Playwright to report in its own words", () => {
    process.env.FAKE_TOTAL_chromium = "0";
    process.env["FAKE_TOTAL_known-flake"] = "0";
    runChecks(["-g", "nothing matches"], { cli, log: quiet });

    const seen = calls();
    expect(seen).toHaveLength(3);
    expect(seen[2]).toEqual(["test", "-g", "nothing matches"]);
  });

  it("finds the real CLI the way Node would, with no npx and no shell", () => {
    const real = playwrightCli();
    expect(existsSync(real)).toBe(true);
    expect(path.basename(real)).toBe("cli.js");
  });
});
