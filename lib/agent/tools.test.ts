// The seven tools, run for real against a throwaway `data/` (Decision 45, same sandbox pattern as
// `context.test.ts`). Two properties matter more than any individual answer:
//
// - The four readers refuse rather than escape. A path outside `data/` comes back as a *result*,
//   because a thrown error would end the turn where a returned one costs a round.
// - The three collectors write nothing. The whole design of §9.5 rests on a model being unable to
//   change a file, so "propose_tasks left the tree exactly as it was" is checked, not assumed.

import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const SANDBOX = await mkdtemp(path.join(tmpdir(), "attune-tools-"));
const DATA = path.join(SANDBOX, "data");

process.env.ATTUNE_REPO_DIR = SANDBOX;

const { executeTool, TOOLS, toolsFor } = await import("./tools.ts");
const { invalidateTaskCache } = await import("../store/tasks.ts");
const { ModelTaskDraft } = await import("./tools.ts");
type Draft = import("./tools.ts").ModelTaskDraft;

const DRAFT: Draft = ModelTaskDraft.parse({
  title: "Pset 4",
  body: "",
  status: "todo",
  priority: 2,
  estimateMin: 90,
  due: "2026-09-10",
  scheduled: null,
  category: "school",
  context: "MATH 221",
  tags: ["pset"],
  links: [],
  repeat: null,
  repeatUntil: null,
  collection: null,
  inferred: ["category"],
});

async function write(rel: string, text: string): Promise<void> {
  const abs = path.join(DATA, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, text, "utf8");
}

/** Every file under `data/`, so "this wrote nothing" is a comparison rather than a hope. */
async function tree(dir = DATA, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await tree(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out.sort();
}

beforeEach(async () => {
  await rm(DATA, { recursive: true, force: true });
  await mkdir(DATA, { recursive: true });
  invalidateTaskCache();
  await write("knowledge/index.md", "# Knowledge\n\n- [Courses](maps/courses.md)\n");
  await write("knowledge/maps/courses.md", "# Courses\n\n- [MATH 221](../notes/math-221.md) — linear algebra\n");
  await write("knowledge/notes/math-221.md", "# MATH 221\n\nOffice hours Thursday 3-5pm, Room 204.\n");
  await write("knowledge/notes/gym.md", "# Gym\n\nTuesday and Thursday mornings.\n");
  await write("files/docs/2026-09/notes.txt", "an uploaded file\n");
});

describe("the tool table itself", () => {
  it("offers the seven tools of §13.3, to Tasks and Ask and to nothing else", () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual([
      "read_knowledge",
      "search_knowledge",
      "read_file",
      "list_tasks",
      "propose_tasks",
      "propose_knowledge_write",
      "propose_collection_append",
    ]);
    expect(toolsFor("tasks")).toHaveLength(7);
    expect(toolsFor("ask")).toHaveLength(7);
    expect(toolsFor("build")).toHaveLength(0);
  });

  it("describes each input as a closed object, which is what strict mode needs", () => {
    for (const tool of TOOLS) {
      expect(tool.schema.type, tool.name).toBe("object");
      expect(tool.schema.additionalProperties, tool.name).toBe(false);
      expect(tool.schema, tool.name).not.toHaveProperty("$schema");
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
    }
  });
});

describe("the four readers", () => {
  it("reads a knowledge file", async () => {
    const outcome = await executeTool("read_knowledge", { path: "knowledge/notes/math-221.md" });
    expect(outcome.result).toContain("Office hours Thursday");
    expect(outcome.isError).toBeUndefined();
  });

  it("sends a non-knowledge path to read_file rather than reading it", async () => {
    const outcome = await executeTool("read_knowledge", { path: "files/docs/2026-09/notes.txt" });
    expect(outcome.isError).toBe(true);
    expect(outcome.result).toContain("read_file");
  });

  it("reads any file under data/ with read_file", async () => {
    expect((await executeTool("read_file", { path: "files/docs/2026-09/notes.txt" })).result).toBe(
      "an uploaded file\n",
    );
  });

  it("refuses a path that escapes data/, as a result rather than a throw", async () => {
    const outcome = await executeTool("read_file", { path: "../.env.local" });
    expect(outcome.isError).toBe(true);
    expect(outcome.result).toContain("escapes the data directory");
  });

  it("reports a missing file instead of ending the turn", async () => {
    const outcome = await executeTool("read_knowledge", { path: "knowledge/notes/nope.md" });
    expect(outcome.isError).toBe(true);
    expect(outcome.result.length).toBeGreaterThan(0);
  });

  it("searches the knowledge base and shows the lines that matched", async () => {
    const outcome = await executeTool("search_knowledge", { query: "office hours" });
    expect(outcome.result).toContain("knowledge/notes/math-221.md");
    expect(outcome.result).toContain("Office hours Thursday");
    expect(outcome.result).not.toContain("gym.md");
  });

  it("says so plainly when nothing matches", async () => {
    const outcome = await executeTool("search_knowledge", { query: "kayaking" });
    expect(outcome.result).toContain("Nothing in the knowledge base matches");
    expect(outcome.isError).toBeUndefined();
  });

  it("asks for something to search for rather than returning every file", async () => {
    expect((await executeTool("search_knowledge", { query: "   " })).result).toContain("word or phrase");
  });

  it("lists open tasks in a range, and leaves out what is not in it", async () => {
    const head = (id: string, title: string, due: string, status = "todo"): string =>
      `---\nid: ${id}\ntitle: ${title}\nstatus: ${status}\ndue: ${due}\n` +
      `createdAt: 2026-09-01T00:00:00-04:00\nupdatedAt: 2026-09-01T00:00:00-04:00\n---\n\n`;
    await write("tasks/2026-09-10-pset.md", head("t_1", "Pset 4", "2026-09-10"));
    await write("tasks/2026-09-30-far.md", head("t_2", "Much later", "2026-09-30"));
    await write("tasks/2026-09-11-done.md", head("t_3", "Already done", "2026-09-11", "done"));
    invalidateTaskCache();

    const outcome = await executeTool("list_tasks", { from: "2026-09-01", to: "2026-09-15" });
    expect(outcome.result).toContain("Pset 4");
    expect(outcome.result).not.toContain("Much later");
    expect(outcome.result).not.toContain("Already done");
  });
});

describe("the three collectors", () => {
  it("records tasks and writes nothing", async () => {
    const before = await tree();
    const outcome = await executeTool("propose_tasks", { items: [DRAFT] });

    expect(outcome.result).toBe("recorded");
    expect(outcome.proposal).toEqual({ kind: "tasks", items: [DRAFT] });
    expect(await tree()).toEqual(before);
  });

  it("records a knowledge write, with the map link the note will need (§6.3)", async () => {
    const before = await tree();
    const outcome = await executeTool("propose_knowledge_write", {
      writes: [
        {
          path: "knowledge/notes/office-hours.md",
          op: "create",
          content: "Thursdays 3-5pm, Room 204.",
          reason: "asked twice this week",
          mapLink: "knowledge/maps/courses.md",
        },
      ],
    });

    expect(outcome.result).toBe("recorded");
    expect(outcome.proposal?.kind).toBe("knowledge");
    expect(await tree()).toEqual(before);
  });

  it("records a collection append, and takes new:<title> for one that does not exist", async () => {
    const before = await tree();
    const outcome = await executeTool("propose_collection_append", {
      collection: "new:Watchlist",
      items: ["Arrival", "Dune"],
    });

    expect(outcome.proposal).toEqual({
      kind: "collection",
      collection: "new:Watchlist",
      items: ["Arrival", "Dune"],
    });
    expect(await tree()).toEqual(before);
  });

  it("refuses a draft that is missing fields, as a result the model can act on", async () => {
    const outcome = await executeTool("propose_tasks", { items: [{ title: "Pset 4" }] });
    expect(outcome.isError).toBe(true);
    expect(outcome.proposal).toBeUndefined();
  });
});

it("says there is no such tool rather than failing the turn", async () => {
  const outcome = await executeTool("delete_everything", {});
  expect(outcome.isError).toBe(true);
  expect(outcome.result).toContain("no tool called delete_everything");
});
