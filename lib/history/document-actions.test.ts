// Saving from the document view, against a real checkout: §17's byte-for-byte checks for Phase 8,
// and the refusals the approval asked to see fail — a stale save, a credential, a policy. SHA-256 of
// the file's bytes is the measure everywhere, never `git diff`, which normalizes line endings (§15).

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("document-actions");
const { git } = checkout;

const { store } = await import("./batch.ts");
const { saveDocument, toggleCheckbox, versionOf } = await import("./document-actions.ts");
const { undoBatch } = await import("./undo.ts");
const { readActions } = await import("./log.ts");
const { splitFrontmatter } = await import("../store/frontmatter.ts");
const { listTasks } = await import("../store/tasks.ts");

const NOTE = "knowledge/notes/change-of-basis.md";
const SHEET = "knowledge/collections/equations-math221.md";
const abs = (rel: string): string => path.join(checkout.data, rel);
const bytesOf = (rel: string): Promise<Buffer> => readFile(abs(rel));
const sha = async (rel: string): Promise<string> => createHash("sha256").update(await bytesOf(rel)).digest("hex");
const KEY = "sk" + "-ant-" + "Z".repeat(30);

// The §15 equation sheet: inline and display math, a backslash-heavy block, and checkbox items.
const SHEET_TEXT = [
  "---",
  "schema: 1",
  "id: k_20260903_e221",
  "title: Equations — MATH 221",
  "kind: list",
  "context: school",
  "tags: []",
  "links: []",
  "tasks: []",
  "createdAt: 2026-09-03T10:00:00-04:00",
  "updatedAt: 2026-09-03T10:00:00-04:00",
  "---",
  "",
  "- [ ] Change of basis: $[v]_B = P^{-1}[v]_{B'}$",
  "- [x] Determinant of a product $\\det(AB) = \\det A \\det B$",
  "",
  "$$",
  "\\begin{aligned}",
  "  A &= PDP^{-1} \\\\",
  "  A^k &= PD^kP^{-1}",
  "\\end{aligned}",
  "$$",
  "",
].join("\n");

const NOTE_TEXT = [
  "---",
  "schema: 1",
  "id: n_20260903_c0b1",
  "title: Change of basis",
  "type: fact",
  "tags: []",
  "links:",
  "  - knowledge/maps/courses.md",
  "source: manual",
  "confidence: medium",
  "updatedAt: 2026-09-03T10:00:00-04:00",
  "---",
  "",
  "Columns of $P$ are the new basis written in the old one.",
  "",
].join("\n");

const read = async (rel: string) => {
  const bytes = await bytesOf(rel);
  return { version: versionOf(bytes), ...splitFrontmatter(bytes.toString("utf8")) };
};

beforeEach(async () => {
  await checkout.reset({
    setup: async () => {
      await mkdir(path.dirname(abs(NOTE)), { recursive: true });
      await mkdir(path.dirname(abs(SHEET)), { recursive: true });
      await writeFile(abs(NOTE), NOTE_TEXT);
      await writeFile(abs(SHEET), SHEET_TEXT);
    },
  });
});

describe("§17: edit, save, undo", () => {
  it("restores the note byte for byte (SHA-256 equal)", async () => {
    const before = await sha(NOTE);
    const doc = await read(NOTE);
    const saved = await saveDocument(store, { path: NOTE, base: doc.version, fields: null, body: `${doc.body}More.\n` });
    expect(saved.unchanged).toBe(false);
    expect(await sha(NOTE)).not.toBe(before);

    if (saved.unchanged) throw new Error("unreachable");
    expect(await undoBatch(saved.batch)).toMatchObject({ ok: true });
    expect(await sha(NOTE)).toBe(before);
  });

  it("writes the body exactly as typed, LaTeX and all", async () => {
    const doc = await read(SHEET);
    const typed = `${doc.body}- [ ] Eigenvalues: $\\det(A - \\lambda I) = 0$\n`;
    await saveDocument(store, { path: SHEET, base: doc.version, fields: null, body: typed });
    expect((await read(SHEET)).body).toBe(typed);
  });
});

describe("§17: LaTeX survives a round trip", () => {
  it("answers an unchanged save without a batch: same SHA-256, no log line, no commit", async () => {
    const before = await sha(SHEET);
    const logged = (await readActions()).length;
    const head = git("rev-parse", "HEAD");
    const doc = await read(SHEET);

    const saved = await saveDocument(store, { path: SHEET, base: doc.version, fields: null, body: doc.body });
    expect(saved).toEqual({ unchanged: true, version: doc.version });
    // The table sent back whole, keys in another order, is still no change.
    const reordered = Object.fromEntries(Object.entries(doc.data).reverse());
    expect(await saveDocument(store, { path: SHEET, base: doc.version, fields: reordered, body: doc.body })).toMatchObject({ unchanged: true });

    expect(await sha(SHEET)).toBe(before);
    expect((await readActions()).length).toBe(logged);
    expect(git("rev-parse", "HEAD")).toBe(head);
  });
});

// The conflict path after a save the writer re-stamps (the Stage A review, item 6). A knowledge file's
// writer stamps `updatedAt`, so the bytes on disk are not the bytes the page sent: the version the
// save answers with has to cover what was written, or the next save is a false 409 — and it has to
// be taken inside the batch, or a write landing after it is a false pass.
describe("the version a save answers with", () => {
  it("covers the bytes written, stamp included, so the next save goes through and a stale one does not", async () => {
    const doc = await read(NOTE);
    const first = await saveDocument(store, { path: NOTE, base: doc.version, fields: null, body: `${doc.body}One.\n` });
    expect((await read(NOTE)).data.updatedAt).not.toBe(doc.data.updatedAt); // the writer did re-stamp
    expect(first.version).toBe(await sha(NOTE));

    const second = await saveDocument(store, { path: NOTE, base: first.version, fields: null, body: `${doc.body}One.\nTwo.\n` });
    expect(second.unchanged).toBe(false);
    expect(second.version).toBe(await sha(NOTE));
    await expect(saveDocument(store, { path: NOTE, base: first.version, fields: null, body: "stale\n" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("is taken inside the batch, so a write landing after the batch still conflicts with the next save", async () => {
    const other = NOTE_TEXT.replace("Columns", "The columns"); // an editor, elsewhere
    const doc = await read(NOTE);
    let reads = 0;
    // A store whose second read lets the other write in first — the gap between a batch returning
    // and anything read after it, made deterministic.
    const racing = {
      ...store,
      files: {
        ...store.files,
        readBinary: async (rel: string): Promise<Buffer> => {
          reads += 1;
          if (reads === 2) await writeFile(abs(NOTE), other);
          return store.files.readBinary(rel);
        },
      },
    };
    const saved = await saveDocument(racing, { path: NOTE, base: doc.version, fields: null, body: `${doc.body}Mine.\n` });
    await writeFile(abs(NOTE), other); // the same write, where the save read nothing after its batch

    await expect(saveDocument(store, { path: NOTE, base: saved.version, fields: null, body: "clobber\n" })).rejects.toMatchObject({ code: "conflict" });
    expect(await readFile(abs(NOTE), "utf8")).toBe(other);
  });

  it("does the same for a checkbox click", async () => {
    const line = "- [ ] Change of basis: $[v]_B = P^{-1}[v]_{B'}$";
    const index = (await read(SHEET)).body.split("\n").indexOf(line);
    const clicked = await toggleCheckbox(store, { path: SHEET, line: index, expected: line });
    expect(clicked.version).toBe(await sha(SHEET));
  });
});

describe("refusals", () => {
  it("refuses a save against a file that changed on disk after it was opened, and writes nothing", async () => {
    const doc = await read(NOTE);
    await writeFile(abs(NOTE), NOTE_TEXT.replace("Columns", "The columns")); // an editor, elsewhere
    const changed = await sha(NOTE);
    await expect(saveDocument(store, { path: NOTE, base: doc.version, fields: null, body: "mine" })).rejects.toMatchObject({ code: "conflict" });
    expect(await sha(NOTE)).toBe(changed);
  });

  it("refuses a credential with the file and the pattern named and the match not echoed, and writes nothing", async () => {
    const before = await sha(NOTE);
    const doc = await read(NOTE);
    const attempt = saveDocument(store, { path: NOTE, base: doc.version, fields: null, body: `${doc.body}key: ${KEY}\n` });
    await expect(attempt).rejects.toMatchObject({ code: "secret_rejected" });
    const message = await attempt.catch((err: Error) => err.message);
    expect(message).toContain(NOTE);
    expect(message).toContain("anthropic key");
    expect(message).not.toContain(KEY);
    expect(await sha(NOTE)).toBe(before);
  });

  it("refuses the generated index, a conversation, and a profile file's frontmatter, in the builder", async () => {
    const index = await read("knowledge/index.md");
    await expect(saveDocument(store, { path: "knowledge/index.md", base: index.version, fields: null, body: "x" })).rejects.toMatchObject({ code: "forbidden_path" });
    const profile = await read("knowledge/profile/habits.md");
    await expect(
      saveDocument(store, { path: "knowledge/profile/habits.md", base: profile.version, fields: { title: "Habits" }, body: profile.body }),
    ).rejects.toMatchObject({ code: "forbidden_path" });
  });

  it("names a bad frontmatter field without repeating its value", async () => {
    const doc = await read(SHEET);
    const attempt = saveDocument(store, { path: SHEET, base: doc.version, fields: { ...doc.data, kind: "zq-sentinel" }, body: doc.body });
    await expect(attempt).rejects.toMatchObject({ code: "invalid" });
    const message = await attempt.catch((err: Error) => err.message);
    expect(message).toContain("kind");
    expect(message).not.toContain("zq-sentinel");
  });

  it("keeps a task's id fixed, and leaves creating one to New task", async () => {
    await expect(saveDocument(store, { path: "tasks/2026-09-10-made-here.md", base: null, text: "x" })).rejects.toMatchObject({ code: "forbidden_path" });
    const { createTask } = await import("./actions.ts");
    const { runBatch } = await import("./batch.ts");
    await runBatch({ actor: "user", scope: "user", summary: "add", commitPrefix: "task", actions: [createTask({ title: "Pset 4" })] });
    const task = (await listTasks()).find((one) => one.title === "Pset 4");
    if (!task) throw new Error("no task");
    const doc = await read(task.path);
    await expect(saveDocument(store, { path: task.path, base: doc.version, fields: { ...doc.data, id: "t_20990101_beef" }, body: "" })).rejects.toMatchObject({ code: "invalid" });
    // A real field change goes through writeTask, as a task.update.
    const saved = await saveDocument(store, { path: task.path, base: doc.version, fields: { ...doc.data, priority: 1 }, body: "- [ ] part a\n" });
    expect(saved.unchanged).toBe(false);
    expect((await listTasks()).find((one) => one.id === task.id)?.priority).toBe(1);
    expect((await readActions()).at(-1)?.type).toBe("task.update");
  });

  it("creates a note only with its map, as §6.3 requires", async () => {
    const rel = "knowledge/notes/eigenvalues.md";
    await expect(saveDocument(store, { path: rel, base: null, fields: { title: "Eigenvalues" }, body: "λ\n" })).rejects.toMatchObject({ code: "invalid" });
    await saveDocument(store, { path: rel, base: null, fields: { title: "Eigenvalues" }, body: "λ\n", mapLink: "knowledge/maps/courses.md", reason: "for the midterm" });
    expect((await readFile(abs("knowledge/maps/courses.md"), "utf8"))).toContain(`](${rel}) — for the midterm`);
  });
});

describe("§17: clicking a checkbox in a collection saves one action", () => {
  it("flips that one line, as one knowledge.write in one batch", async () => {
    const logged = (await readActions()).length;
    const line = "- [ ] Change of basis: $[v]_B = P^{-1}[v]_{B'}$";
    const index = (await read(SHEET)).body.split("\n").indexOf(line);

    await toggleCheckbox(store, { path: SHEET, line: index, expected: line });

    const entries = (await readActions()).slice(logged);
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("knowledge.write");
    const body = (await read(SHEET)).body.split("\n");
    expect(body[index]).toBe(line.replace("[ ]", "[x]"));
    // Nothing else in the body moved.
    const original = splitFrontmatter(SHEET_TEXT).body.split("\n");
    expect(body.filter((_, i) => i !== index)).toEqual(original.filter((_, i) => i !== index));
  });

  it("refuses a click on a line that has changed since it was drawn", async () => {
    const before = await sha(SHEET);
    await expect(toggleCheckbox(store, { path: SHEET, line: 1, expected: "- [ ] Something that was there" })).rejects.toMatchObject({ code: "conflict" });
    expect(await sha(SHEET)).toBe(before);
  });
});
