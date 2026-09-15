// A link inside `data/` against the document view's writes (the Phase 8 Stage A review, item 3): a
// save, a checkbox click, a rename, a delete and New folder through a link that leads out of `data/`
// are each refused, and the file it leads to is left exactly as it was. A read follows a link only if
// it stays inside `data/` and leads to a name the browser would open; a write never goes through one.
// Every case uses a real junction in a real checkout, because the bug is the file system following it.

import { existsSync } from "node:fs";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("links");

const { runBatch, store } = await import("./batch.ts");
const { saveDocument, toggleCheckbox, versionOf } = await import("./document-actions.ts");
const { deleteAction, folderAction, renameAction } = await import("./file-actions.ts");

type ActionSpec = import("./batch.ts").ActionSpec;

const OUTSIDE = path.join(checkout.dir, "outside");
const NOTE = "files/door/note.md";
const NOTE_TEXT = "# Outside\n\n- [ ] a box\n";
const run = (action: ActionSpec) => runBatch({ actor: "user", scope: "user", summary: action.summary, commitPrefix: "file", actions: [action] });
const outside = (name: string): Promise<Buffer> => readFile(path.join(OUTSIDE, name));
const junction = (target: string, rel: string): Promise<void> => symlink(target, path.join(checkout.data, rel), "junction");

beforeEach(async () => {
  await checkout.reset();
  await rm(OUTSIDE, { recursive: true, force: true });
  await mkdir(OUTSIDE, { recursive: true });
  await writeFile(path.join(OUTSIDE, "note.md"), NOTE_TEXT);
  // After the reset's commit, so git never sees the link.
  await junction(OUTSIDE, "files/door");
});

describe("a link out of data/", () => {
  it("is not saved through, whatever version the save carries, and the file it leads to is untouched", async () => {
    const before = await outside("note.md");
    const attempt = saveDocument(store, { path: NOTE, base: versionOf(before), text: "changed\n" });
    await expect(attempt).rejects.toMatchObject({ code: "forbidden_path" });
    expect(await attempt.catch((err: Error) => err.message)).toContain("outside data/");
    expect(await outside("note.md")).toEqual(before);
  });

  it("is not created through", async () => {
    await expect(saveDocument(store, { path: "files/door/new.md", base: null, text: "hi\n" })).rejects.toMatchObject({ code: "forbidden_path" });
    expect(existsSync(path.join(OUTSIDE, "new.md"))).toBe(false);
  });

  it("takes no checkbox click", async () => {
    await expect(toggleCheckbox(store, { path: NOTE, line: 2, expected: "- [ ] a box" })).rejects.toMatchObject({ code: "forbidden_path" });
    expect((await outside("note.md")).toString("utf8")).toBe(NOTE_TEXT);
  });

  it("is not renamed, deleted or made a folder in through", async () => {
    await expect(run(renameAction(NOTE, "moved.md"))).rejects.toMatchObject({ code: "forbidden_path" });
    await expect(run(deleteAction(NOTE))).rejects.toMatchObject({ code: "forbidden_path" });
    await expect(run(folderAction("files/door/sub"))).rejects.toMatchObject({ code: "forbidden_path" });
    expect((await outside("note.md")).toString("utf8")).toBe(NOTE_TEXT);
    expect(existsSync(path.join(OUTSIDE, "moved.md"))).toBe(false);
    expect(existsSync(path.join(OUTSIDE, "sub"))).toBe(false);
  });

  it("is not read by the store either, so nothing built on a store read can carry it", async () => {
    await expect(store.files.readBinary(NOTE)).rejects.toMatchObject({ code: "forbidden_path" });
    await expect(store.files.readText(NOTE)).rejects.toMatchObject({ code: "forbidden_path" });
    await expect(store.files.listTree("files/door")).rejects.toMatchObject({ code: "forbidden_path" });
  });
});

describe("a link that stays inside data/", () => {
  beforeEach(async () => {
    await mkdir(path.join(checkout.data, "files/real"), { recursive: true });
    await writeFile(path.join(checkout.data, "files/real/a.md"), "real\n");
    await junction(path.join(checkout.data, "files/real"), "files/alias");
  });

  it("is read, the way the browser's read follows it", async () => {
    expect((await store.files.readBinary("files/alias/a.md")).toString("utf8")).toBe("real\n");
  });

  it("is still not written through: a write replaces a path, and a link is not the file it names", async () => {
    const bytes = await store.files.readBinary("files/alias/a.md");
    const attempt = saveDocument(store, { path: "files/alias/a.md", base: versionOf(bytes), text: "changed\n" });
    await expect(attempt).rejects.toMatchObject({ code: "forbidden_path" });
    expect(await attempt.catch((err: Error) => err.message)).toContain("files/alias");
    expect(await readFile(path.join(checkout.data, "files/real/a.md"), "utf8")).toBe("real\n");
  });

  it("is not read when it leads to a credential-shaped name, by where it leads", async () => {
    await mkdir(path.join(checkout.data, "files/.ssh"), { recursive: true });
    await writeFile(path.join(checkout.data, "files/.ssh/config"), "Host x\n");
    await junction(path.join(checkout.data, "files/.ssh"), "files/plain");
    const attempt = store.files.readBinary("files/plain/config");
    await expect(attempt).rejects.toMatchObject({ code: "forbidden_path" });
    expect(await attempt.catch((err: Error) => err.message)).toContain("files/.ssh/config");
  });
});
