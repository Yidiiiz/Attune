// What the model is told, checked against files on disk rather than mocks — the store is the thing
// being exercised here as much as the assembly is. Everything runs against a throwaway checkout
// pointed at by `ATTUNE_REPO_DIR` (Decision 45), set before `paths.ts` is imported, because
// `REPO_DIR` is resolved once when that module loads. Nothing here can see the owner's `data/`.
//
// The case that gets the most attention is the empty one. `seed/` ships `about-me.md`, `habits.md`
// and `preferences.md` as a heading and a comment addressed to the user, so a fresh install's very
// first prompt is assembled from three files with nothing in them. That is the default path, not an
// edge case, and the property worth pinning is that it produces well-formed empty blocks in the
// right order rather than throwing or quietly leaving them out.

import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SANDBOX = await mkdtemp(path.join(tmpdir(), "attune-context-"));
const DATA = path.join(SANDBOX, "data");

process.env.ATTUNE_REPO_DIR = SANDBOX;

const { assembleContext, capDocument, currentTime, estimateTokens, OPEN_DOCUMENT_CAP, stableSettings } = await import("./context.ts");
const { defaultSettings } = await import("../store/settings.ts");
const { invalidateTaskCache } = await import("../store/tasks.ts");
const { HEURISTIC } = await import("./memory.ts");

const AT = new Date("2026-09-06T18:30:00Z");

/** The labels §13.1 says come first, in the order it says they come in. */
const ALWAYS = [
  "Setup",
  "Knowledge index",
  "About me",
  "Habits",
  "Preferences",
  "Instructions",
  "Current time",
];

const labels = (blocks: Array<{ label: string }>): string[] => blocks.map((block) => block.label);

async function resetData(): Promise<void> {
  await rm(DATA, { recursive: true, force: true });
  await mkdir(DATA, { recursive: true });
  invalidateTaskCache();
}

/** A fresh install: `seed/` copied to `data/`, which is exactly what `npm run init` does (§12). */
async function seedData(): Promise<void> {
  await resetData();
  await cp(path.join(REPO, "seed"), DATA, { recursive: true });
  invalidateTaskCache();
}

async function writeTask(name: string, frontmatter: string, body = ""): Promise<void> {
  await mkdir(path.join(DATA, "tasks"), { recursive: true });
  await writeFile(path.join(DATA, "tasks", name), `---\n${frontmatter}\n---\n\n${body}\n`, "utf8");
  invalidateTaskCache();
}

beforeEach(resetData);

describe("a fresh install, whose profile is three empty files", () => {
  it("returns every always-present block, in §13.1's order", async () => {
    await seedData();
    const { system } = await assembleContext({ mode: "tasks" }, AT);
    expect(labels(system)).toEqual(ALWAYS);
  });

  it("gives the profile blocks bodies that are empty rather than absent", async () => {
    await seedData();
    const { system } = await assembleContext({ mode: "tasks" }, AT);

    for (const label of ["About me", "Habits", "Preferences"]) {
      const block = system.find((entry) => entry.label === label);
      expect(block, `${label} must be present even when its file is empty`).toBeDefined();
      // The seed file is a heading plus an HTML comment telling the *user* what to put there.
      // The comment is stripped, so what reaches the model is the heading and nothing else.
      expect(block?.text).not.toContain("<!--");
      expect(block?.text.replace(/^#.*$/m, "").trim()).toBe("");
      expect(block?.cache).toBe(true);
    }
  });

  it("caches the five stable blocks, and they are the prefix (§13.1, Decision 59)", async () => {
    await seedData();
    const { system } = await assembleContext({ mode: "ask" }, AT);
    const cached = system.filter((block) => block.cache === true).map((block) => block.label);
    expect(cached).toEqual(["Setup", "Knowledge index", "About me", "Habits", "Preferences"]);

    // The point of the split: the cached blocks are an unbroken run at the front. A block that
    // changes between requests sitting among them would invalidate the whole prefix every call.
    expect(system.slice(0, cached.length).map((block) => block.label)).toEqual(cached);
    expect(system.slice(cached.length).every((block) => block.cache === undefined)).toBe(true);
  });

  it("keeps the clock out of the cached prefix and puts it before the view (Decision 59)", async () => {
    await seedData();
    const early = await assembleContext({ mode: "ask" }, new Date("2026-09-06T14:00:00Z"));
    const later = await assembleContext({ mode: "ask" }, new Date("2026-09-06T18:30:00Z"));

    const at = (blocks: typeof early.system, label: string): string =>
      blocks.find((block) => block.label === label)?.text ?? "";

    // Only the uncached block moved. Everything in the prefix is byte-identical between the two.
    expect(at(early.system, "Current time")).not.toBe(at(later.system, "Current time"));
    for (const label of ["Setup", "Knowledge index", "About me", "Habits", "Preferences"]) {
      expect(at(early.system, label), label).toBe(at(later.system, label));
    }
    expect(at(later.system, "Setup")).not.toContain("It is now");
    expect(early.system.findIndex((block) => block.label === "Current time")).toBe(
      early.system.length - 1,
    );
  });

  it("does not throw when the files are not there at all", async () => {
    // Not even a settings file: a `data/` that has only just been created.
    const { system, total } = await assembleContext({ mode: "tasks" }, AT);
    expect(labels(system)).toEqual(ALWAYS);
    for (const label of ["Knowledge index", "About me", "Habits", "Preferences"]) {
      expect(system.find((block) => block.label === label)?.text).toBe("");
    }
    expect(total).toBeGreaterThan(0);
  });

  it("reports the total as the sum of the blocks (§6.2)", async () => {
    await seedData();
    const { system, total } = await assembleContext({ mode: "tasks" }, AT);
    expect(total).toBe(system.reduce((sum, block) => sum + block.tokens, 0));
    expect(system.every((block) => block.tokens === estimateTokens(block.text))).toBe(true);
  });

  it("stays inside §6.2's 2,000-token target on a fresh install", async () => {
    await seedData();
    const { total } = await assembleContext({ mode: "tasks" }, AT);
    expect(total).toBeLessThan(2000);
  });
});

describe("the blocks that depend on what the caller is looking at", () => {
  it("adds nothing beyond the always-present blocks when the caller says nothing", async () => {
    await seedData();
    const { system } = await assembleContext({ mode: "ask" }, AT);
    expect(labels(system)).toEqual(ALWAYS);
  });

  it("adds a table for a view date, holding that day's open tasks", async () => {
    await seedData();
    await writeTask(
      "2026-09-06-pset-4.md",
      "id: t_20260906_aaaa\ntitle: Pset 4\nstatus: todo\npriority: 2\ndue: 2026-09-06\ncreatedAt: 2026-09-06T00:00:00-04:00\nupdatedAt: 2026-09-06T00:00:00-04:00",
    );
    await writeTask(
      "2026-09-20-later.md",
      "id: t_20260920_bbbb\ntitle: Much later\nstatus: todo\ndue: 2026-09-20\ncreatedAt: 2026-09-06T00:00:00-04:00\nupdatedAt: 2026-09-06T00:00:00-04:00",
    );

    const { system } = await assembleContext({ mode: "tasks", viewDate: "2026-09-06" }, AT);
    expect(labels(system)).toEqual([...ALWAYS, "Tasks on 2026-09-06"]);

    const table = system[system.length - 1].text;
    expect(table).toContain("Pset 4");
    expect(table).not.toContain("Much later");
  });

  it("labels a range differently from a single day", async () => {
    await seedData();
    const { system } = await assembleContext({ mode: "ask", range: ["2026-09-01", "2026-09-30"] }, AT);
    expect(labels(system)).toEqual([...ALWAYS, "Tasks 2026-09-01 to 2026-09-30"]);
    expect(system[system.length - 1].text).toBe("No open tasks in this range.");
  });

  it("adds the open document and the referenced task, after the view (§13.1)", async () => {
    await seedData();
    await writeTask(
      "2026-09-06-pset-4.md",
      "id: t_20260906_aaaa\ntitle: Pset 4\nstatus: todo\ncontext: MATH 221\nscheduled: 2026-09-06\ncreatedAt: 2026-09-06T00:00:00-04:00\nupdatedAt: 2026-09-06T00:00:00-04:00",
      "Chapters 4.1 to 4.3.",
    );

    const { system } = await assembleContext(
      {
        mode: "ask",
        viewDate: "2026-09-06",
        openFile: "knowledge/maps/courses.md",
        taskIds: ["t_20260906_aaaa"],
      },
      AT,
    );

    expect(labels(system)).toEqual([
      ...ALWAYS,
      "Tasks on 2026-09-06",
      "Open document",
      "Task: Pset 4",
    ]);

    const detail = system[system.length - 1];
    expect(detail.source).toBe("tasks/2026-09-06-pset-4.md");
    expect(detail.text).toContain("context: MATH 221");
    expect(detail.text).toContain("Chapters 4.1 to 4.3.");
  });

  it("treats a document that is not there as empty, and one outside data/ as an error", async () => {
    await seedData();
    const { system } = await assembleContext({ mode: "ask", openFile: "knowledge/notes/gone.md" }, AT);
    expect(system[system.length - 1]).toMatchObject({ label: "Open document", text: "" });

    // Not the same thing: the store refused this one, and reporting a refusal as an empty file
    // would hide it while still putting the requested path into the prompt as a block source.
    await expect(assembleContext({ mode: "ask", openFile: "../.env.local" }, AT)).rejects.toThrow(
      /escapes the data directory/,
    );
  });

  it("caps the open document at a line break, and says how much of it was sent (Decision 85)", async () => {
    await seedData();
    const line = "x".repeat(99);
    const long = Array.from({ length: 500 }, () => line).join("\n"); // 49,999 characters
    await mkdir(path.join(DATA, "files/docs"), { recursive: true });
    await writeFile(path.join(DATA, "files/docs/long.md"), long);

    const { system } = await assembleContext({ mode: "ask", openFile: "files/docs/long.md" }, AT);
    const text = system[system.length - 1].text;
    const [kept, marker] = text.split("\n\n[Truncated: ");
    expect(kept.length).toBeLessThanOrEqual(OPEN_DOCUMENT_CAP);
    expect(kept.endsWith(line)).toBe(true); // cut at a line break, not mid-line
    expect(marker).toBe(`this is the first ${kept.length.toLocaleString("en-US")} of 49,999 characters of files/docs/long.md. The rest is not in this context.]`);
    // A document under the cap goes in whole, with no marker.
    expect(capDocument("a.md", line)).toBe(line);
  });

  it("says rather than sends a binary or a credential-shaped open document", async () => {
    await seedData();
    await mkdir(path.join(DATA, "files/images"), { recursive: true });
    await writeFile(path.join(DATA, "files/images/a.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1]));
    await writeFile(path.join(DATA, "files/.env"), "TOKEN=zq-sentinel-7\n");

    const image = (await assembleContext({ mode: "ask", openFile: "files/images/a.png" }, AT)).system.at(-1)?.text;
    expect(image).toBe("[files/images/a.png is not a text file (6 bytes); its contents are not sent.]");
    const env = (await assembleContext({ mode: "ask", openFile: "files/.env" }, AT)).system.at(-1)?.text;
    expect(env).toMatch(/^\[files\/\.env is an environment file; its contents are not sent\.\]$/);
  });

  it("skips a referenced task that does not exist instead of failing the request", async () => {
    await seedData();
    const { system } = await assembleContext({ mode: "ask", taskIds: ["t_nope_0000"] }, AT);
    expect(labels(system)).toEqual(ALWAYS);
  });

  it("changes only the instructions block when the mode changes", async () => {
    await seedData();
    const asked = await assembleContext({ mode: "ask" }, AT);
    const tasks = await assembleContext({ mode: "tasks" }, AT);
    const instructions = (blocks: typeof asked.system): string =>
      blocks.find((block) => block.label === "Instructions")?.text ?? "";

    expect(instructions(asked.system)).not.toBe(instructions(tasks.system));
    expect(instructions(tasks.system)).toContain("read Dune");
  });
});

describe("what Ask is told about remembering (§6.3, §6.4)", () => {
  const instructions = async (mode: "ask" | "tasks") =>
    (await assembleContext({ mode }, AT)).system.find((block) => block.label === "Instructions");
  const habits = (lines: number) =>
    writeFile(path.join(DATA, "knowledge/profile/habits.md"), Array.from({ length: lines }, (_, n) => `- habit ${n}`).join("\n"));

  it("carries §6.4's heuristic word for word, and the search before a new note", async () => {
    await seedData();
    const text = (await instructions("ask"))?.text ?? "";
    expect(text).toContain(HEURISTIC);
    expect(text).toMatch(/Before proposing a new note, call search_knowledge/);
  });

  it("asks for a distillation of a profile file over 150 lines, behind the cache breakpoint", async () => {
    await seedData();
    await habits(151);
    const block = await instructions("ask");
    expect(block?.text).toMatch(/over 150 lines: knowledge\/profile\/habits\.md/);
    // Decision 59: a line that comes and goes with a file's length stays out of the cached prefix.
    expect(block?.cache).toBeUndefined();
    // Tasks mode has no tools to propose with, so it is not asked.
    expect((await instructions("tasks"))?.text).not.toMatch(/over 150 lines/);
  });

  it("says nothing about distilling at the cap", async () => {
    await seedData();
    await habits(150);
    expect((await instructions("ask"))?.text).not.toMatch(/over 150 lines/);
  });
});

describe("the two settings blocks", () => {
  it("says who the user is, where they are, and what their day looks like", () => {
    const settings = defaultSettings();
    settings.identity.name = "Yidi";
    settings.timezone = "America/New_York";

    const text = stableSettings(settings);
    expect(text).toContain("The user is Yidi.");
    expect(text).toContain("America/New_York");
    expect(text).toContain("10:00 to 00:00");
    expect(text).toContain("Categories in use: school, personal.");
    // The clock is the whole reason these are two blocks and not one.
    expect(text).not.toContain("It is now");
  });

  it("says so plainly when the name has not been set (§11.2's first run)", () => {
    expect(stableSettings(defaultSettings())).toContain("The user has not given their name.");
  });

  it("gives the model both the wall clock and the date it resolves 'Friday' against", () => {
    const text = currentTime(defaultSettings(), AT);
    expect(text).toContain("2026-09-06T14:30");
    expect(text).toContain("2026-09-06");
  });
});
