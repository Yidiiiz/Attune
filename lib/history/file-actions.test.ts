// The Files panel's operations against a real checkout: New folder, Rename and Delete, each undone
// byte for byte — including an upload, whose snapshot is `{ git: true }` — and Rename's refusals,
// which have to say why (the Phase 8 approval, the rename condition).

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("file-actions");

const { runBatch } = await import("./batch.ts");
const { addFile, deleteAction, folderAction, renameAction } = await import("./file-actions.ts");
const { undoBatch } = await import("./undo.ts");

type ActionSpec = import("./batch.ts").ActionSpec;

const abs = (rel: string): string => path.join(checkout.data, rel);
const sha = async (rel: string): Promise<string> => createHash("sha256").update(await readFile(abs(rel))).digest("hex");
const run = (action: ActionSpec) => runBatch({ actor: "user", scope: "user", summary: action.summary, commitPrefix: "file", actions: [action] });

const MAP = "knowledge/maps/reading.md";
const MAP_TEXT = "---\nschema: 1\nid: m_20260914_0e0e\ntitle: Reading\nupdatedAt: 2026-09-14T10:00:00-04:00\n---\n\nBooks and papers.\n";

const { regenerateIndex } = await import("../store/knowledge.ts");

beforeEach(async () => {
  await checkout.reset({
    setup: async () => {
      await writeFile(abs(MAP), MAP_TEXT);
      // As the app leaves it: the generated index lists the new map, so it always has that linker.
      await regenerateIndex();
    },
  });
});

describe("New folder", () => {
  it("is made by its .gitkeep under files/, and refused where the app keeps its own folders", async () => {
    await run(folderAction("files/reading"));
    expect(existsSync(abs("files/reading/.gitkeep"))).toBe(true);
    await expect(run(folderAction("files/reading"))).rejects.toMatchObject({ code: "exists" });
    await expect(run(folderAction("tasks/archive"))).rejects.toMatchObject({ code: "forbidden_path" });
    await expect(run(folderAction("files/.ssh"))).rejects.toMatchObject({ code: "forbidden_path" });
  });
});

describe("Rename", () => {
  it("moves a map only the generated index links to, regenerates the index, and undoes both byte for byte", async () => {
    expect(await readFile(abs("knowledge/index.md"), "utf8")).toContain(MAP);
    const index = await sha("knowledge/index.md");
    const { batch, targets } = await run(renameAction(MAP, "books.md"));
    expect(existsSync(abs("knowledge/maps/books.md"))).toBe(true);
    expect(existsSync(abs(MAP))).toBe(false);
    expect(targets).toContain("knowledge/index.md");

    await undoBatch(batch);
    expect(existsSync(abs("knowledge/maps/books.md"))).toBe(false);
    expect(createHash("sha256").update(await readFile(abs(MAP))).digest("hex")).toBe(createHash("sha256").update(MAP_TEXT).digest("hex"));
    expect(await sha("knowledge/index.md")).toBe(index);
  });

  it("refuses while something links to the file, and says why rather than only who", async () => {
    await writeFile(abs("knowledge/maps/courses.md"), `${await readFile(abs("knowledge/maps/courses.md"), "utf8")}\nSee [reading](${MAP}).\n`);
    const attempt = run(renameAction(MAP, "books.md"));
    await expect(attempt).rejects.toMatchObject({ code: "invalid" });
    const message = await attempt.catch((err: Error) => err.message);
    expect(message).toContain("'Courses'");
    expect(message).toContain("point at nothing");
    expect(message).toContain("amendment v");
    expect(existsSync(abs(MAP))).toBe(true);
  });

  it("refuses a note outright, because a map always links it", async () => {
    await mkdir(abs("knowledge/notes"), { recursive: true });
    await writeFile(abs("knowledge/notes/a.md"), "---\nid: n_20260914_000a\ntitle: A\nupdatedAt: x\n---\n");
    const message = await run(renameAction("knowledge/notes/a.md", "b.md")).catch((err: Error) => err.message);
    expect(message).toContain("every note linked from a map");
  });

  it("refuses when the index could not read every file, since an unread one might link here", async () => {
    await writeFile(abs("knowledge/maps/broken.md"), "---\ntitle: [unclosed\n---\n");
    const message = await run(renameAction(MAP, "books.md")).catch((err: Error) => err.message);
    expect(message).toContain("knowledge/maps/broken.md");
    expect(existsSync(abs(MAP))).toBe(true);
  });

  it("keeps the extension and the folder", async () => {
    await expect(run(renameAction(MAP, "books.txt"))).rejects.toMatchObject({ code: "invalid" });
    await expect(run(renameAction(MAP, "../books.md"))).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("Delete", () => {
  it("removes an upload and its manifest row, and undo puts the exact bytes back", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3]);
    const added = await runBatch({ actor: "user", scope: "user", summary: "add", commitPrefix: "file", actions: [addFile("images", "a.png", bytes, "check")] });
    const rel = added.targets[0];
    const uploaded = await sha(rel);
    const manifest = await sha("files/index.md");

    const { batch, targets } = await run(deleteAction(rel));
    expect(existsSync(abs(rel))).toBe(false);
    expect(targets).toContain("files/index.md");

    expect(await undoBatch(batch)).toMatchObject({ ok: true });
    expect(await sha(rel)).toBe(uploaded);
    expect(await sha("files/index.md")).toBe(manifest);
  });

  it("removes a folder under files/ with everything in it, and undo brings every file back", async () => {
    await mkdir(abs("files/trip/day1"), { recursive: true });
    await writeFile(abs("files/trip/plan.txt"), "fly out\n");
    await writeFile(abs("files/trip/day1/.gitkeep"), "");
    await writeFile(abs("files/trip/day1/notes.md"), "# Day 1\n");
    const { batch } = await run(deleteAction("files/trip"));
    expect(existsSync(abs("files/trip"))).toBe(false);

    await undoBatch(batch);
    expect(await readFile(abs("files/trip/plan.txt"), "utf8")).toBe("fly out\n");
    expect(await readFile(abs("files/trip/day1/notes.md"), "utf8")).toBe("# Day 1\n");
    expect(existsSync(abs("files/trip/day1/.gitkeep"))).toBe(true);
  });

  it("refuses a profile file and a folder the app keeps", async () => {
    await expect(run(deleteAction("knowledge/profile/habits.md"))).rejects.toMatchObject({ code: "forbidden_path" });
    await expect(run(deleteAction("knowledge/maps"))).rejects.toMatchObject({ code: "forbidden_path" });
  });
});
