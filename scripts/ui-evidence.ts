// Owns: keeping what a failing browser check leaves behind — its errors, its trace and the dev
// server's output while it ran — in a folder no later run overwrites (the review of B2's first
// commit: "a failure nobody can read is a failure we can't rule out").
//
// **Why Playwright's own output was not enough.** Three failures in B2's first commit could not be
// explained afterwards. The error text went only to the terminal. The traces went to
// `test-results/`, which Playwright empties at the start of every invocation, and `check:ui` makes
// two (the gating checks, then the known flakes), so the second wiped the first's traces before the
// run had even finished. The server's output reached the terminal interleaved with everything else
// and with no times on it, so a slow answer could only be matched to a check by reading the scroll.
//
// So every `check:ui` run gets a folder, `check-ui-evidence/<start time>/` (git-ignored, never
// pruned), and this reporter writes into it:
//   - `server.log` — every line the dev server printed, each with the time it arrived, across both
//     invocations;
//   - `failures/<n>-<spec>-<line>-<title>/failure.txt` for each check that did not end as expected:
//     where it is, how it ended, every error with its stack and snippet, what the check itself
//     printed, and the server lines that arrived while it ran — with a copy of each attachment
//     (the trace above all) beside it, so the folder stands on its own;
//   - `errors.txt` — anything that failed outside a check: the server not starting, a global setup
//     throwing, a run cut short.
// `playwright-run.ts` picks the folder and passes it in `CHECK_UI_EVIDENCE`. A direct
// `npx playwright test` has no such variable, and the reporter then makes a folder of its own.
//
// Failure behavior: a write that fails is reported on stderr and never throws, because a reporter
// that throws takes the run's own result down with it; the check's outcome is what matters, and the
// terminal still has it.

import { copyFileSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestError, TestResult } from "@playwright/test/reporter";

export const EVIDENCE_ENV = "CHECK_UI_EVIDENCE";
export const EVIDENCE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "check-ui-evidence");

/** A run folder's name: its start time, sortable, and legal in a Windows path. */
export function runFolder(root: string = EVIDENCE_ROOT, now: Date = new Date()): string {
  return path.join(root, now.toISOString().replace(/[:.]/g, "-"));
}

// Playwright colours its error messages; a file is read in an editor, not a terminal.
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const plain = (text: string): string => text.replace(ANSI, "");

const slug = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function describeError(error: TestError, index: number): string {
  const parts = [`--- error ${index + 1} ---`];
  if (error.location) parts.push(`at ${error.location.file}:${error.location.line}:${error.location.column}`);
  // A stack opens with its message, so the message is written on its own only when it does not.
  if (error.message && !error.stack?.includes(error.message)) parts.push(plain(error.message));
  if (error.stack) parts.push(plain(error.stack));
  if (error.snippet) parts.push(plain(error.snippet));
  if (!error.message && !error.stack && error.value) parts.push(`thrown: ${error.value}`);
  return parts.join("\n");
}

export default class EvidenceReporter implements Reporter {
  readonly dir: string;
  private readonly clock: () => Date;
  private readonly server: string[] = [];
  private readonly started = new Map<TestCase, number>();
  private project = "";
  private failures = 0;

  constructor(options: { dir?: string; clock?: () => Date } = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.dir = options.dir ?? process.env[EVIDENCE_ENV] ?? runFolder(EVIDENCE_ROOT, this.clock());
    this.safely(() => mkdirSync(this.dir, { recursive: true }));
  }

  printsToStdio(): boolean {
    return false; // the list reporter beside it owns the terminal
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.project = suite.suites.map((project) => project.title).filter(Boolean).join("+");
    this.serverLine(`--- ${this.project || "run"} begins ---`);
  }

  // Output with no test attached is the dev server's (the webServer plugin forwards it here); a
  // check's own output arrives with its test and is kept with that test's result instead.
  onStdOut(chunk: string | Buffer, test?: TestCase): void {
    if (test === undefined) this.serverChunk(chunk);
  }

  onStdErr(chunk: string | Buffer, test?: TestCase): void {
    if (test === undefined) this.serverChunk(chunk);
  }

  onTestBegin(test: TestCase): void {
    this.started.set(test, this.server.length);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const from = this.started.get(test) ?? this.server.length;
    this.started.delete(test);
    if (result.status === test.expectedStatus || result.status === "skipped") return;

    this.failures += 1;
    const file = path.basename(test.location.file).replace(/\.spec\.ts$/, "");
    const line = test.location.line;
    const folder = path.join(
      this.dir,
      "failures",
      `${String(this.failures).padStart(2, "0")}-${this.project ? `${slug(this.project)}-` : ""}${file}-${line}-${slug(test.title)}`,
    );

    this.safely(() => {
      mkdirSync(folder, { recursive: true });
      const copied: string[] = [];
      for (const attachment of result.attachments) {
        if (attachment.path) {
          const target = path.join(folder, path.basename(attachment.path));
          try {
            copyFileSync(attachment.path, target);
            copied.push(`${attachment.name}: ${target}`);
          } catch (error) {
            copied.push(`${attachment.name}: ${attachment.path} (not copied: ${(error as Error).message})`);
          }
        } else if (attachment.body) {
          copied.push(`${attachment.name}: ${plain(attachment.body.toString())}`);
        }
      }
      const own = (chunks: Array<string | Buffer>): string => plain(chunks.map(String).join("")).trimEnd() || "(nothing)";

      writeFileSync(
        path.join(folder, "failure.txt"),
        [
          `check:    ${test.titlePath().filter(Boolean).join(" › ")}`,
          `where:    ${test.location.file}:${test.location.line}`,
          `project:  ${this.project || "(none)"}`,
          `ended:    ${result.status} (expected ${test.expectedStatus}), after ${result.duration} ms, retry ${result.retry}`,
          `started:  ${result.startTime.toISOString()}`,
          "",
          result.errors.length > 0 ? result.errors.map(describeError).join("\n\n") : "--- no error was reported ---",
          "",
          "--- attachments ---",
          copied.length > 0 ? copied.join("\n") : "(none)",
          "",
          "--- the check's own stdout ---",
          own(result.stdout),
          "",
          "--- the check's own stderr ---",
          own(result.stderr),
          "",
          "--- the dev server, while the check ran ---",
          this.server.slice(from).join("\n") || "(nothing)",
          "",
        ].join("\n"),
      );
    });
  }

  onError(error: TestError): void {
    this.safely(() => appendFileSync(path.join(this.dir, "errors.txt"), `${this.stamp()} ${this.project}\n${describeError(error, 0)}\n\n`));
  }

  onEnd(result: FullResult): void {
    if (result.status === "timedout" || result.status === "interrupted") {
      this.safely(() => appendFileSync(path.join(this.dir, "errors.txt"), `${this.stamp()} ${this.project}\nthe run ended ${result.status}\n\n`));
    }
    this.serverLine(`--- ${this.project || "run"} ends: ${result.status} ---`);
  }

  private stamp(): string {
    return this.clock().toISOString();
  }

  private serverChunk(chunk: string | Buffer): void {
    for (const text of plain(String(chunk)).split(/\r?\n/)) {
      if (text.trim() !== "") this.serverLine(text);
    }
  }

  private serverLine(text: string): void {
    const line = `${this.stamp()} ${text}`;
    this.server.push(line);
    this.safely(() => appendFileSync(path.join(this.dir, "server.log"), `${line}\n`));
  }

  private safely(write: () => void): void {
    try {
      write();
    } catch (error) {
      process.stderr.write(`check:ui: could not keep evidence in ${this.dir}: ${(error as Error).message}\n`);
    }
  }
}
