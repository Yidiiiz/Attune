// `files/index.md`, the generated table of uploads (§4.8). It has no `used-by` column: who uses a
// file is its backlinks, read live from the link index, and a column filled when the table is
// regenerated is stale by construction — a stale answer to "who uses this" is the one someone deletes
// a file on (the Stage A review, item 2). A table written before that keeps its descriptions.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("manifest");
const { addFile, regenerateManifest } = await import("./manifest.ts");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST = path.join(checkout.data, "files/index.md");

beforeEach(async () => {
  await checkout.reset();
});

describe("files/index.md", () => {
  it("is what the seed ships, when there is nothing in files/", async () => {
    await regenerateManifest();
    expect(await readFile(MANIFEST, "utf8")).toBe(await readFile(path.join(ROOT, "seed/files/index.md"), "utf8"));
  });

  it("has no used-by column", async () => {
    const { rel } = await addFile("docs", "notes.txt", Buffer.from("plain\n"), "check");
    const rows = (await readFile(MANIFEST, "utf8")).split("\n").filter((line) => line.startsWith("|"));
    expect(rows[0]).toBe("| path | added | source | description |");
    expect(rows.find((row) => row.startsWith(`| ${rel} `))?.split("|").length).toBe(6);
    expect(await readFile(MANIFEST, "utf8")).not.toContain("used-by");
  });

  it("keeps a description written into the old five-column table", async () => {
    const { rel } = await addFile("docs", "notes.txt", Buffer.from("plain\n"), "check");
    await writeFile(
      MANIFEST,
      `# Files\n\n| path | added | source | description | used-by |\n| --- | --- | --- | --- | --- |\n| ${rel} | 2026-09-01 | check | Lecture notes, week 2 |  |\n`,
    );
    await regenerateManifest();
    const text = await readFile(MANIFEST, "utf8");
    expect(text).toContain(`| ${rel} | 2026-09-01 | check | Lecture notes, week 2 |\n`);
    expect(text).not.toContain("used-by");
    // And from the four-column table it now is.
    await regenerateManifest();
    expect(await readFile(MANIFEST, "utf8")).toContain(`| ${rel} | 2026-09-01 | check | Lecture notes, week 2 |\n`);
  });
});
