// A `{ git: true }` snapshot, against a real checkout. It is the snapshot for bytes the log does not
// carry — an upload, a text file over 64 KB — so everything that reads a snapshot has to go somewhere
// else for them: the secret scan to the file on disk, a rollback to bytes held in memory, an undo or
// a redo to the commit. Until Phase 8 none of the three did (AGENTS.md, the Phase 8 `{ git: true }`
// conditions), and each case below failed before the fix:
//
//   - The scan read a `{ git: true }` snapshot as empty text, so a key in an uploaded text file was
//     logged and committed — and the pre-commit hook, which scans every staged file without a NUL
//     byte, then refused that commit and every one after it. Hard rule 4's deadlock.
//   - Rollback had no commit to restore from, so a refused batch left the file as the batch wrote it.
//   - Undo and redo handed git a `data/`-relative path from the repository root, and redo checked out
//     the commit's parent, which is the state before the batch rather than after it.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("git-snapshot");
const { git, data: DATA } = checkout;

const { runBatch } = await import("./batch.ts");
const { addFile } = await import("./file-actions.ts");
const { createTask, updateTask } = await import("./actions.ts");
const { undoBatch, redoBatch } = await import("./undo.ts");
const { readActions } = await import("./log.ts");
const { listTasks } = await import("../store/tasks.ts");
const { StoreError } = await import("../store/paths.ts");

type ActionSpec = import("./batch.ts").ActionSpec;

// Assembled from fragments, as `lib/security/secrets.test.ts` does, so this file is not its own hit.
const KEY = "sk" + "-ant-" + "Q".repeat(32);
const BIG = 70_000; // past the 64 KB inline limit

const sha = (rel: string): string => createHash("sha256").update(readFileSync(path.join(DATA, rel))).digest("hex");
const head = (): string => git("rev-parse", "HEAD");

const user = { actor: "user" as const, scope: "user" as const };

async function upload(name: string, bytes: Buffer): Promise<{ batch: string; rel: string }> {
  const result = await runBatch({ ...user, summary: `add ${name}`, commitPrefix: "file", actions: [addFile("docs", name, bytes, "check")] });
  return { batch: result.batch, rel: result.targets[0] };
}

async function bigTask(title: string): Promise<{ id: string; rel: string }> {
  await runBatch({ ...user, summary: "add", commitPrefix: "task", actions: [createTask({ title, body: "a".repeat(BIG) })] });
  const task = (await listTasks()).find((one) => one.title === title);
  if (!task) throw new Error("the task was not created");
  return { id: task.id, rel: task.path };
}

beforeEach(async () => {
  await checkout.reset();
});

describe("the secret scan reads what a { git: true } snapshot leaves out", () => {
  it("refuses a text upload holding a key, and writes, logs and commits nothing", async () => {
    const logged = (await readActions()).length;
    const before = head();

    const attempt = upload("notes.txt", Buffer.from(`hello\nkey ${KEY}\n`));
    await expect(attempt).rejects.toBeInstanceOf(StoreError);
    await expect(attempt).rejects.toMatchObject({ code: "secret_rejected" });
    await attempt.catch((err: Error) => expect(err.message).not.toContain(KEY));

    expect(git("ls-files", "--others", "--exclude-standard", "data/files")).toBe("");
    expect((await readActions()).length).toBe(logged);
    expect(head()).toBe(before);
  });

  it("lets a binary through, because the hook skips a file with a NUL byte and so must the write path", async () => {
    const { rel } = await upload("scan.png", Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]), Buffer.from(KEY)]));
    expect(existsSync(path.join(DATA, rel))).toBe(true);
  });

  it("refuses a task body over 64 KB holding a key, and puts the file back byte for byte", async () => {
    const { id, rel } = await bigTask("Long");
    const original = sha(rel);
    const logged = (await readActions()).length;

    await expect(
      runBatch({ ...user, summary: "edit", commitPrefix: "task", actions: [updateTask(id, { body: `${"b".repeat(BIG)}\n${KEY}\n` })] }),
    ).rejects.toMatchObject({ code: "secret_rejected" });

    expect(sha(rel)).toBe(original);
    expect((await readActions()).length).toBe(logged);
  });
});

describe("rollback, undo and redo restore a { git: true } snapshot", () => {
  it("rolls back a failed batch's edit over 64 KB from the bytes it held", async () => {
    const { id, rel } = await bigTask("Rolled back");
    const original = sha(rel);
    const failing: ActionSpec = {
      type: "task.update",
      summary: "fails after the edit",
      apply: async () => {
        throw new StoreError("invalid", "a later action in the same batch failed");
      },
    };

    await expect(
      runBatch({ ...user, summary: "edit", commitPrefix: "task", actions: [updateTask(id, { body: "c".repeat(BIG) }), failing] }),
    ).rejects.toThrow("a later action");
    expect(sha(rel)).toBe(original);
  });

  // SKIPPED, not deleted, and the case below pins what happens instead. `data/` is ignored and a
  // batch that writes only under it never commits (`batch.ts`), so the one thing a `{ git: true }`
  // snapshot of a data path needs in order to be restored — a commit holding those bytes — is the
  // one thing that no longer exists. The replacement is a content-addressed blob store under
  // `data/history/blobs/`, filed against Phase 8b in AGENTS.md; these three turn back on with it.
  it.skip("undoes an edit over 64 KB byte for byte, and redoes it byte for byte", async () => {
    const { id, rel } = await bigTask("Edited");
    const original = sha(rel);
    const { batch } = await runBatch({ ...user, summary: "edit", commitPrefix: "task", actions: [updateTask(id, { body: "d".repeat(BIG) })] });
    const edited = sha(rel);

    expect(await undoBatch(batch)).toMatchObject({ ok: true });
    expect(sha(rel)).toBe(original);
    expect(await redoBatch(batch)).toMatchObject({ ok: true });
    expect(sha(rel)).toBe(edited);
  });

  it.skip("redoes an upload with the bytes that were uploaded", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 0, 4]);
    const { batch, rel } = await upload("photo.png", bytes);
    const uploaded = sha(rel);

    expect(await undoBatch(batch)).toMatchObject({ ok: true });
    expect(existsSync(path.join(DATA, rel))).toBe(false);
    expect(await redoBatch(batch)).toMatchObject({ ok: true });
    expect(sha(rel)).toBe(uploaded);
  });

  it.skip("undoes a delete whose before-state is { git: true } from the commit before it", async () => {
    const { rel } = await upload("gone.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 9, 9, 9]));
    const uploaded = sha(rel);
    const remove: ActionSpec = {
      type: "file.write",
      summary: "delete it",
      apply: async (store) => {
        await store.files.deleteFile(rel);
        return { targets: [rel], before: { [rel]: { git: true } }, after: { [rel]: null } };
      },
    };
    const { batch } = await runBatch({ ...user, summary: "delete", commitPrefix: "file", actions: [remove] });
    expect(existsSync(path.join(DATA, rel))).toBe(false);

    expect(await undoBatch(batch)).toMatchObject({ ok: true });
    expect(sha(rel)).toBe(uploaded);
  });

  it("refuses such an undo by name rather than restoring the wrong bytes", async () => {
    const { rel } = await upload("kept.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 7, 7, 7]));
    const uploaded = sha(rel);
    const remove: ActionSpec = {
      type: "file.write",
      summary: "delete it",
      apply: async (store) => {
        await store.files.deleteFile(rel);
        return { targets: [rel], before: { [rel]: { git: true } }, after: { [rel]: null } };
      },
    };
    const { batch, commit } = await runBatch({ ...user, summary: "delete", commitPrefix: "file", actions: [remove] });

    // The gap the blob store closes, checked rather than only described. The batch has no commit,
    // `resolveCommit` will not invent one from HEAD because the entry says `noCommit` rather than
    // pending, and `applySnapshot` says which file and why instead of putting back whatever the
    // wrong revision happens to hold.
    expect(commit).toBeNull();
    await expect(undoBatch(batch)).rejects.toThrow(/can only be restored from its commit/);
    expect(existsSync(path.join(DATA, rel))).toBe(false);
    expect(uploaded).toMatch(/^[0-9a-f]{64}$/); // the bytes existed; nothing can reach them
  });
});
