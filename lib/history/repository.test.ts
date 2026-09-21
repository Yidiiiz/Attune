// The containment, against the exact shape of the bug it closes: a checkout with no repository of
// its own, sitting inside a directory that has one. That is what `lib/history/chat-actions.test.ts`
// was — a temp sandbox with no `git init`, under a home folder with a `.git` — and git's discovery
// climbed out of it and committed there 232 times.
//
// The first case shows the trap is real before any case shows it closed: without this app's options,
// git run from the inner directory really does find the outer repository. A containment test that
// never demonstrated the escape would pass just as well with the containment deleted.

import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempDir } from "../testing/checkout.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUTER = await createTempDir("enclosing");
const INNER = path.join(OUTER, "checkout");

const raw = (cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env): string =>
  execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

// The enclosing repository — the stand-in for the home folder — with one commit in it.
raw(OUTER, ["init", "-q"]);
raw(OUTER, ["config", "user.email", "check@example.invalid"]);
raw(OUTER, ["config", "user.name", "check"]);
raw(OUTER, ["config", "commit.gpgsign", "false"]);
raw(OUTER, ["commit", "-q", "--allow-empty", "-m", "outer"]);
await mkdir(INNER, { recursive: true });
await cp(path.join(ROOT, "seed"), path.join(INNER, "data"), { recursive: true });

process.env.ATTUNE_REPO_DIR = INNER;

const { assertOwnRepository, ceilingValue, checkRepository, gitOptions, RepositoryError } = await import(
  "./repository.ts"
);
const { runBatch } = await import("./batch.ts");
const { createTask } = await import("./actions.ts");
const { readLogText } = await import("./log.ts");

const outerCommits = (): number => Number(raw(OUTER, ["rev-list", "--count", "HEAD"]));

const task = (title: string, commit = true) =>
  runBatch({
    actor: "user",
    scope: "user",
    summary: `add ${title}`,
    commitPrefix: "task",
    commit,
    actions: [createTask({ title })],
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a checkout with no repository, inside one that has", () => {
  it("is where plain git discovery escapes to the enclosing repository", () => {
    expect(path.resolve(raw(INNER, ["rev-parse", "--show-toplevel"])).toLowerCase()).toBe(
      path.resolve(OUTER).toLowerCase(),
    );
  });

  it("finds no repository at all under this app's options", async () => {
    expect(() => raw(INNER, ["rev-parse", "--show-toplevel"], gitOptions().env)).toThrow();
    await expect(assertOwnRepository()).rejects.toThrow(/is not a git repository/);
  });

  it("refuses a committing batch outside production before writing anything", async () => {
    const before = outerCommits();
    const log = await readLogText().catch(() => "");

    await expect(task("pset 4")).rejects.toBeInstanceOf(RepositoryError);

    // Loud, and nothing landed: no task file, no log line, and not one commit in the enclosing
    // repository — which is the failure that went unnoticed for two months.
    expect(await readLogText().catch(() => "")).toBe(log);
    expect(outerCommits()).toBe(before);
    expect(raw(OUTER, ["ls-files"])).toBe("");
  });

  it("still runs a batch that does not commit, because it needs no repository", async () => {
    await expect(task("reading", false)).resolves.toMatchObject({ commit: null });
  });
});

describe("the positive check", () => {
  it("catches GIT_DIR pointing elsewhere, which --show-toplevel alone does not", async () => {
    // Real git output under the influence the environment is scrubbed of. With GIT_DIR set and no
    // work tree named, git calls the working directory the top — so the toplevel looks right while
    // every object would land in the other repository.
    const influenced = { ...process.env, GIT_DIR: path.join(OUTER, ".git") };
    const toplevel = raw(INNER, ["rev-parse", "--show-toplevel"], influenced);
    const gitDir = raw(INNER, ["rev-parse", "--absolute-git-dir"], influenced);
    expect(path.resolve(toplevel).toLowerCase()).toBe(path.resolve(INNER).toLowerCase());

    // No .git of its own yet: refused as not a repository.
    expect(() => checkRepository(toplevel, gitDir)).toThrow(RepositoryError);

    // With one of its own, the foreign git directory is still refused — this is the case the
    // toplevel comparison would have passed.
    raw(INNER, ["init", "-q"]);
    try {
      expect(() => checkRepository(toplevel, gitDir)).toThrow(/refusing to commit, push or check out/);
      await expect(assertOwnRepository()).resolves.toBeUndefined();
    } finally {
      // Leave INNER as the other cases expect it: no repository of its own.
      await rm(path.join(INNER, ".git"), { recursive: true, force: true });
    }
  });

  it("strips the variables that redirect git, whatever the caller's environment says", () => {
    vi.stubEnv("GIT_DIR", path.join(OUTER, ".git"));
    vi.stubEnv("GIT_WORK_TREE", OUTER);
    const env = gitOptions().env;
    expect(env.GIT_DIR).toBeUndefined();
    expect(env.GIT_WORK_TREE).toBeUndefined();
    vi.unstubAllEnvs();
  });
});

describe("ceilingValue", () => {
  it("uses ; and forward slashes on Windows, with no trailing separator", () => {
    expect(ceilingValue("C:\\Users\\x\\Temp\\", undefined, "win32")).toBe("C:/Users/x/Temp");
    expect(ceilingValue("C:\\Users\\x\\Temp", "D:/slow", "win32")).toBe("C:/Users/x/Temp;D:/slow");
  });

  it("uses : on POSIX, with no trailing separator", () => {
    expect(ceilingValue("/tmp/attune/", undefined, "linux")).toBe("/tmp/attune");
    expect(ceilingValue("/tmp/attune", "/mnt/slow", "darwin")).toBe("/tmp/attune:/mnt/slow");
  });

  it("keeps a filesystem root whole, since there is nothing to trim", () => {
    expect(ceilingValue("/", undefined, "linux")).toBe("/");
    expect(ceilingValue("C:\\", undefined, "win32")).toBe("C:/");
  });

  it("puts ours first, so an empty entry already there cannot stop git resolving it", () => {
    expect(ceilingValue("/tmp/a", ":/mnt/nfs", "linux")).toBe("/tmp/a::/mnt/nfs");
  });
});

describe("once the checkout has a repository of its own", () => {
  it("commits there and nowhere else", async () => {
    raw(INNER, ["init", "-q"]);
    raw(INNER, ["config", "user.email", "check@example.invalid"]);
    raw(INNER, ["config", "user.name", "check"]);
    raw(INNER, ["config", "commit.gpgsign", "false"]);
    const before = outerCommits();

    const { commit } = await task("pset 5");

    expect(commit).not.toBeNull();
    expect(raw(INNER, ["log", "-1", "--format=%s"])).toBe("task: add pset 5");
    expect(outerCommits()).toBe(before);
    expect(await readFile(path.join(INNER, "data", "history", "actions.jsonl"), "utf8")).toContain("pset 5");
  });
});
