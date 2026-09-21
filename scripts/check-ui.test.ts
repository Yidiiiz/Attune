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
//   - **The evidence a failing check leaves** (the review of B2's first commit). `ui-evidence.ts` is
//     driven with the events Playwright would send it, and `runChecks` must hand both of its
//     invocations the same folder, so the known flakes' run cannot empty the gating run's.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FullConfig, FullResult, Suite, TestCase, TestResult } from "@playwright/test/reporter";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "check-ui.mjs");
const { DEV_PORTS, E2E_PORT } = await import("../e2e/ports.ts");
const { playwright, playwrightCli, runChecks } = await import("./playwright-run.ts");
const { default: EvidenceReporter, EVIDENCE_ENV } = await import("./ui-evidence.ts");
const { createTempDir } = await import("../lib/testing/checkout.ts");

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
appendFileSync(process.env.FAKE_LOG + ".env", (process.env.CHECK_UI_EVIDENCE ?? "(unset)") + "\\n");
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

  it("hands every invocation one evidence folder, and names it at the end", () => {
    const evidence = path.join(dir, "evidence-run");
    const lines: string[] = [];
    runChecks([], { cli, log: (line) => lines.push(line), evidence });

    const seen = readFileSync(`${log}.env`, "utf8").trim().split("\n");
    // Two counts, which keep only the list reporter, then the gating run and the known flakes' run,
    // both told the same folder.
    expect(seen).toEqual(["(unset)", "(unset)", evidence, evidence]);
    const [countGating, countFlaky, runGating, runFlaky] = calls();
    for (const argv of [countGating, countFlaky]) expect(argv).toContain("--reporter=list");
    for (const argv of [runGating, runFlaky]) expect(argv.some((arg) => arg.startsWith("--reporter"))).toBe(false);
    expect(lines.at(-1)).toContain(`evidence kept in ${evidence}`);
  });

  it("finds the real CLI the way Node would, with no npx and no shell", () => {
    const real = playwrightCli();
    expect(existsSync(real)).toBe(true);
    expect(path.basename(real)).toBe("cli.js");
  });
});

// The events Playwright sends a reporter, reduced to what `ui-evidence.ts` reads.
function fakeTest(title: string, line: number): TestCase {
  const test = {
    title,
    expectedStatus: "passed",
    location: { file: path.join("e2e", "annotations.spec.ts"), line, column: 1 },
    titlePath: () => ["", "chromium", "annotations.spec.ts", title],
  };
  return test as unknown as TestCase;
}

function fakeResult(status: string, extra: Record<string, unknown> = {}): TestResult {
  return {
    status,
    duration: 15_234,
    retry: 0,
    startTime: new Date("2026-09-21T10:00:00Z"),
    errors: [],
    attachments: [],
    stdout: [],
    stderr: [],
    ...extra,
  } as unknown as TestResult;
}

const suiteOf = (...projects: string[]): Suite => ({ suites: projects.map((title) => ({ title })) }) as unknown as Suite;
const config = {} as FullConfig;
const ended = (status: string): FullResult => ({ status }) as unknown as FullResult;

// One temp directory for the cases below, made at the top of the file, which is the only place
// `createTempDir` can register the `afterAll` that removes it; each case gets a run folder inside.
const EVIDENCE_TEMP = await createTempDir("ui-evidence");

describe("the evidence a failing check leaves", () => {
  let dir = "";
  let tick = 0;
  const clock = (): Date => new Date(Date.UTC(2026, 8, 21, 10, 0, tick++));

  beforeEach(() => {
    dir = mkdtempSync(path.join(EVIDENCE_TEMP, "run-"));
    tick = 0;
  });

  const failures = (): string[] => {
    const root = path.join(dir, "failures");
    return existsSync(root) ? readdirSync(root) : [];
  };
  const failure = (name: string): string => readFileSync(path.join(dir, "failures", name, "failure.txt"), "utf8");

  it("writes the error, the trace and the server's lines from while the check ran", () => {
    const trace = path.join(dir, "trace-source.zip");
    writeFileSync(trace, "trace bytes");
    const reporter = new EvidenceReporter({ dir, clock });
    const test = fakeTest("a note on a selection becomes a card", 42);

    reporter.onBegin(config, suiteOf("chromium"));
    reporter.onStdOut("[WebServer]  GET /chat 200 in 900ms\n");
    reporter.onTestBegin(test);
    reporter.onStdOut("[WebServer]  GET /chat?c=abc 200 in 18982ms\n");
    reporter.onStdOut("the check's own console line\n", test);
    reporter.onTestEnd(
      test,
      fakeResult("failed", {
        errors: [
          {
            message: "\u001b[31mError: expect(locator).toBeVisible() failed\u001b[39m",
            stack: "\u001b[31mError: expect(locator).toBeVisible() failed\u001b[39m\n    at annotations.spec.ts:57:5",
            snippet: "> 57 |   await expect(card).toBeVisible();",
            location: { file: "e2e/annotations.spec.ts", line: 57, column: 5 },
          },
        ],
        attachments: [{ name: "trace", contentType: "application/zip", path: trace }],
        stdout: ["the check's own console line\n"],
      }),
    );

    expect(failures()).toEqual(["01-chromium-annotations-42-a-note-on-a-selection-becomes-a-card"]);
    const [name] = failures();
    const text = failure(name);
    expect(text).toContain("ended:    failed (expected passed), after 15234 ms");
    // Once, since the stack carries the message, and without Playwright's colours.
    expect(text.split("Error: expect(locator).toBeVisible() failed")).toHaveLength(2);
    expect(text).not.toContain("\u001b[");
    expect(text).toContain("at annotations.spec.ts:57:5");
    expect(text).toContain("> 57 |   await expect(card).toBeVisible();");
    expect(text).toContain("the check's own console line");
    // The server's lines from while it ran, and not the one from before it began.
    expect(text).toContain("GET /chat?c=abc 200 in 18982ms");
    expect(text).not.toContain("in 900ms");
    // The trace is copied beside it, so the folder stands on its own once test-results/ is emptied.
    const copy = path.join(dir, "failures", name, "trace-source.zip");
    expect(readFileSync(copy, "utf8")).toBe("trace bytes");
    expect(text).toContain(`trace: ${copy}`);

    const server = readFileSync(path.join(dir, "server.log"), "utf8");
    expect(server).toMatch(/^2026-09-21T10:00:01\.000Z \[WebServer\] {2}GET \/chat 200 in 900ms$/m);
    expect(server).toContain("GET /chat?c=abc 200 in 18982ms");
    expect(server).not.toContain("own console line");
  });

  it("keeps a timed-out check, and nothing for a check that passed", () => {
    const reporter = new EvidenceReporter({ dir, clock });
    const passed = fakeTest("passes", 10);
    const timedOut = fakeTest("times out", 20);
    reporter.onBegin(config, suiteOf("chromium"));
    reporter.onTestBegin(passed);
    reporter.onTestEnd(passed, fakeResult("passed"));
    reporter.onTestBegin(timedOut);
    reporter.onTestEnd(timedOut, fakeResult("timedOut", { errors: [{ message: "Test timeout of 45000ms exceeded." }] }));

    expect(failures()).toEqual(["01-chromium-annotations-20-times-out"]);
    expect(failure(failures()[0])).toContain("Test timeout of 45000ms exceeded.");
  });

  it("lets the known flakes' run add to the gating run's folder without emptying it", () => {
    const gating = new EvidenceReporter({ dir, clock });
    const first = fakeTest("first", 1);
    gating.onBegin(config, suiteOf("chromium"));
    gating.onTestBegin(first);
    gating.onTestEnd(first, fakeResult("failed"));
    gating.onEnd(ended("failed"));

    const flakes = new EvidenceReporter({ dir, clock });
    const stop = fakeTest("Stop leaves the partial reply", 2);
    flakes.onBegin(config, suiteOf("known-flake"));
    flakes.onTestBegin(stop);
    flakes.onTestEnd(stop, fakeResult("failed"));

    expect(failures()).toEqual([
      "01-chromium-annotations-1-first",
      "01-known-flake-annotations-2-stop-leaves-the-partial-reply",
    ]);
    const server = readFileSync(path.join(dir, "server.log"), "utf8");
    expect(server).toContain("--- chromium begins ---");
    expect(server).toContain("--- known-flake begins ---");
  });

  it("writes what failed outside any check to errors.txt", () => {
    const reporter = new EvidenceReporter({ dir, clock });
    reporter.onBegin(config, suiteOf("chromium"));
    reporter.onError({ message: "Timed out waiting 120000ms from config.webServer." });
    reporter.onEnd(ended("interrupted"));

    const errors = readFileSync(path.join(dir, "errors.txt"), "utf8");
    expect(errors).toContain("Timed out waiting 120000ms from config.webServer.");
    expect(errors).toContain("the run ended interrupted");
  });

  it("takes its folder from check:ui when it is given one", () => {
    process.env[EVIDENCE_ENV] = path.join(dir, "from-env");
    try {
      expect(new EvidenceReporter({ clock }).dir).toBe(path.join(dir, "from-env"));
    } finally {
      delete process.env[EVIDENCE_ENV];
    }
  });
});
