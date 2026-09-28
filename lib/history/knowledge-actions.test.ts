// The knowledge builders through `runBatch`, against a real checkout — §17's Phase 7 checks at the
// library level, and the ones the approval added. What matters is not that a file is written but
// that the batch is refused or accepted whole, and that one undo puts every byte back; so undo is
// checked with SHA-256 over the files, never with `git diff` (Decision 42).

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("knowledge");
const { git, data: DATA } = checkout;

const { runBatch } = await import("./batch.ts");
const { writeKnowledge, addToCollection, promoteItem } = await import("./knowledge-actions.ts");
const { undoBatch } = await import("./undo.ts");
const { readActions } = await import("./log.ts");
const knowledge = await import("../store/knowledge.ts");
const { listTasks } = await import("../store/tasks.ts");
const { itemsOf } = await import("../knowledge/items.ts");
const { StoreError } = await import("../store/paths.ts");
const chats = await import("../store/chats.ts");

type Spec = Parameters<typeof runBatch>[0]["actions"][number];

const run = (summary: string, ...actions: Spec[]) =>
  runBatch({ actor: "agent", scope: "user", summary, commitPrefix: "knowledge", actions });

const sha = async (rel: string): Promise<string | null> => {
  try {
    return createHash("sha256").update(await readFile(path.join(DATA, rel))).digest("hex");
  } catch {
    return null;
  }
};
const hashes = async (rels: string[]) => Object.fromEntries(await Promise.all(rels.map(async (rel) => [rel, await sha(rel)])));
const read = (rel: string) => readFile(path.join(DATA, rel), "utf8");

const NOTE = "knowledge/notes/office-hours.md";
const MAP = "knowledge/maps/courses.md";
const HABITS = "knowledge/profile/habits.md";

const officeHours = (mapLink: string | null) =>
  writeKnowledge(
    {
      path: NOTE,
      op: "create",
      content: "# Office hours for MATH 221\n\nThursdays 3–5pm, Room 204.\n",
      reason: "office hours come up every week",
      mapLink,
    },
    "chat:c_20260912_aaaa",
  );

beforeEach(async () => {
  await checkout.reset();
});

describe("the index", () => {
  it("is already what regeneration produces on a fresh seed, so the seed fixture is the new form", async () => {
    expect(await knowledge.regenerateIndex()).toBe(false);
    expect(await read(knowledge.INDEX_PATH)).toContain("- [Courses](knowledge/maps/courses.md)");
  });

  it("repairs an index in the old knowledge-relative form the first time anything regenerates it", async () => {
    const fresh = await read(knowledge.INDEX_PATH);
    await writeFile(path.join(DATA, knowledge.INDEX_PATH), fresh.replaceAll("](knowledge/", "]("));
    expect(await knowledge.regenerateIndex()).toBe(true);
    expect(await read(knowledge.INDEX_PATH)).toBe(fresh);
  });
});

describe("a new note (§6.3)", () => {
  it("is refused by runBatch without a map link, and nothing lands", async () => {
    const head = git("rev-parse", "HEAD");
    const logged = (await readActions()).length;

    await expect(run("remember office hours", officeHours(null))).rejects.toThrow(/names no map in its links/);

    expect(await sha(NOTE)).toBeNull();
    expect((await readActions()).length).toBe(logged);
    expect(git("rev-parse", "HEAD")).toBe(head);
  });

  it("is refused when it names a map that this change does not link it from", async () => {
    // Built by hand rather than through the builder: the rule belongs to every batch, not to one path in.
    const bypass: Spec = {
      type: "knowledge.write",
      summary: "a note with a map in its links and nothing in the map",
      apply: async (store) => {
        await store.knowledge.writeRecord(NOTE, "note", { id: "n_20260912_0001", title: "Office hours", links: [MAP] }, "x\n");
        return { targets: [NOTE], before: { [NOTE]: null }, after: { [NOTE]: await store.snapshotContent(NOTE) } };
      },
    };
    await expect(run("bypass", bypass)).rejects.toThrow(/is not linked from knowledge\/maps\/courses.md by this change/);
    expect(await sha(NOTE)).toBeNull();
  });

  it("with a map link is one batch and no commit, and one undo restores every byte", async () => {
    const before = await hashes([NOTE, MAP, knowledge.INDEX_PATH]);
    const head = git("rev-parse", "HEAD");

    const { batch } = await run("remember office hours", officeHours(MAP));

    // One batch, and no commit: the note, the map and the index are all under `data/` (`batch.ts`).
    expect(git("rev-list", "--count", `${head}..HEAD`)).toBe("0");
    const note = await knowledge.readRecord(NOTE);
    expect(note.data).toMatchObject({ title: "Office hours for MATH 221", type: "fact", source: "chat:c_20260912_aaaa", links: [MAP] });
    expect(String(note.data.id)).toMatch(/^n_\d{8}_[0-9a-f]{4}$/);
    expect(await read(MAP)).toContain(`- [Office hours for MATH 221](${NOTE}) — office hours come up every week`);

    await undoBatch(batch);
    expect(await hashes([NOTE, MAP, knowledge.INDEX_PATH])).toEqual(before);
  });

  it("keeps the title it was given at write time when its opening line is later rewritten", async () => {
    await run("remember office hours", officeHours(MAP));
    await run(
      "rewrite",
      writeKnowledge({ path: NOTE, op: "replace", content: "# Something else entirely\n\nMoved to Fridays.\n", reason: "", mapLink: null }, "manual"),
    );
    expect((await knowledge.readRecord(NOTE)).data.title).toBe("Office hours for MATH 221");
  });
});

describe("the other writes", () => {
  it("appends to habits.md and to nothing else", async () => {
    const before = await read(HABITS);
    const { targets } = await run("habit", writeKnowledge({ path: HABITS, op: "append", content: "- Works late on Thursdays.\n", reason: "", mapLink: null }, "chat:x"));
    expect(await read(HABITS)).toBe(`${before}- Works late on Thursdays.\n`);
    expect(targets).toEqual([HABITS]);
  });

  it("refuses the index, a new map, and a collection addressed as a note", async () => {
    const attempt = (p: string, op: "create" | "append" | "replace") =>
      run("x", writeKnowledge({ path: p, op, content: "- [x](y.md)\n", reason: "", mapLink: null }, "manual"));
    await expect(attempt(knowledge.INDEX_PATH, "replace")).rejects.toThrow(/generated from the maps/);
    await expect(attempt("knowledge/maps/new.md", "create")).rejects.toThrow(/a map accepts append/);
    await expect(attempt("knowledge/collections/x.md", "append")).rejects.toThrow(/is a collection/);
    await expect(attempt("tasks/x.md", "create")).rejects.toBeInstanceOf(StoreError);
  });

  it("fills a session summary's frontmatter from the conversation, not from the proposal", async () => {
    const conv = "c_20260912_bbbb";
    await chats.writeConversation({
      schema: 1, id: conv, title: "Change of basis", activeLeafId: null, pinned: false, model: "claude-opus-5",
      context: { file: null, taskIds: [] }, createdAt: "2026-09-12T10:00:00-04:00", updatedAt: "2026-09-12T10:00:00-04:00",
    });
    const rel = `knowledge/sessions/${conv}.md`;
    await run("distill", writeKnowledge({ path: rel, op: "create", content: "---\nmessageCount: 99\n---\nThe basis changes.\n", reason: "", mapLink: null }, "manual"));
    expect((await knowledge.readRecord(rel)).data).toMatchObject({ id: conv, title: "Change of basis", messageCount: 0 });
  });
});

describe("collections", () => {
  it("creates one with the index updated in the same action, and skips items it already has", async () => {
    const { targets } = await run("movies", addToCollection("new:Movies to watch", ["Dune — the 2021 one first", "Arrival"]));
    const rel = "knowledge/collections/movies-to-watch.md";
    expect(targets).toEqual([rel, knowledge.INDEX_PATH]);
    expect(await read(knowledge.INDEX_PATH)).toContain(`- [Movies to watch](${rel})`);

    await run("again", addToCollection(rel, ["Arrival", "Heat"]));
    expect(itemsOf((await knowledge.readRecord(rel)).body).map((item) => item.slug)).toEqual(["dune", "arrival", "heat"]);
  });

  it("with 200 items adds nothing to the task list", async () => {
    const items = Array.from({ length: 200 }, (_, n) => `Book ${n + 1}`);
    await run("reading", addToCollection("new:Reading list", items));
    expect(await listTasks()).toEqual([]);
  });

  it("promotes an item to a task linked both ways in one batch, and one undo removes both halves", async () => {
    const rel = "knowledge/collections/movies-to-watch.md";
    await run("movies", addToCollection("new:Movies to watch", ["Dune — the 2021 one first", "Arrival"]));
    const before = await hashes([rel]);
    const head = git("rev-parse", "HEAD");

    const { batch } = await run("promote", ...promoteItem(rel, "dune"));

    expect(git("rev-list", "--count", `${head}..HEAD`)).toBe("0");
    const [task] = await listTasks();
    expect(task).toMatchObject({ title: "Dune", body: "the 2021 one first", source: `collection:${rel}`, collection: `${rel}#dune` });
    const collection = await knowledge.readRecord(rel);
    expect(collection.data.tasks).toEqual([task.id]);
    expect(itemsOf(collection.body)[0]).toMatchObject({ slug: "dune", taskId: task.id });

    await expect(run("again", ...promoteItem(rel, "dune"))).rejects.toThrow(/already a task/);

    await undoBatch(batch);
    expect(await listTasks()).toEqual([]);
    expect(await sha(task.path)).toBeNull();
    expect(await hashes([rel])).toEqual(before);
  });
});
