// The link index's cache against the disk. Every write here goes around the store — `node:fs`
// directly, the way an editor or undo's `git checkout` writes — so `events.onWrite` never fires and
// the only thing that can notice is the signature `linkIndex()` checks on each read.
//
// Not tested, on purpose: a same-size edit inside one timestamp tick. That is the signature's stated
// blind spot (`treeSignature` in `lib/store/files.ts`), and a test aimed at it would pass or fail by
// the clock.

import { mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("link-index");
const { linkIndex } = await import("./index.ts");

const NOTE = "knowledge/notes/change-of-basis.md";
const abs = (rel: string): string => path.join(checkout.data, rel);

const note = (link: string): string =>
  `---\nschema: 1\nid: n_20260914_0001\ntitle: Change of basis\nlinks: [knowledge/maps/courses.md]\nupdatedAt: 2026-09-14T10:00:00-04:00\n---\nSee [the other](${link}).\n`;

beforeEach(async () => {
  await checkout.reset({
    setup: async () => {
      await mkdir(path.dirname(abs(NOTE)), { recursive: true });
      await writeFile(abs(NOTE), note("knowledge/maps/people.md"));
    },
  });
});

describe("linkIndex() and writes the store did not make", () => {
  it("reuses the built index while nothing on disk has changed", async () => {
    expect(await linkIndex()).toBe(await linkIndex());
  });

  it("sees a link added by hand", async () => {
    expect((await linkIndex()).incoming.get("knowledge/maps/tools.md")?.has(NOTE) ?? false).toBe(false);
    await writeFile(abs(NOTE), `${await readFile(abs(NOTE), "utf8")}And [tools](knowledge/maps/tools.md).\n`);
    expect((await linkIndex()).incoming.get("knowledge/maps/tools.md")?.has(NOTE)).toBe(true);
  });

  it("sees a same-size edit, which a size check alone would not", async () => {
    const first = await linkIndex();
    expect(first.incoming.get("knowledge/maps/people.md")?.has(NOTE)).toBe(true);

    const before = await readFile(abs(NOTE), "utf8");
    const after = note("knowledge/maps/pupils.md"); // `people` and `pupils`: the length does not change
    expect(after.length).toBe(before.length);
    await writeFile(abs(NOTE), after);
    // Moved well clear of the previous write's tick, so this case is about the size, not the clock.
    const later = new Date(Date.now() + 5_000);
    await utimes(abs(NOTE), later, later);

    const second = await linkIndex();
    expect(second).not.toBe(first);
    expect(second.incoming.get("knowledge/maps/people.md")?.has(NOTE) ?? false).toBe(false);
    expect(second.incoming.get("knowledge/maps/pupils.md")?.has(NOTE)).toBe(true);
  });

  it("sees a file that appeared, and one that went", async () => {
    const extra = "knowledge/notes/eigenvalues.md";
    await writeFile(abs(extra), note(NOTE).replace("n_20260914_0001", "n_20260914_0002"));
    expect((await linkIndex()).files.has(extra)).toBe(true);
    expect((await linkIndex()).incoming.get(NOTE)?.has(extra)).toBe(true);

    await rm(abs(extra));
    expect((await linkIndex()).files.has(extra)).toBe(false);
    expect((await linkIndex()).incoming.get(NOTE)?.has(extra) ?? false).toBe(false);
  });
});
