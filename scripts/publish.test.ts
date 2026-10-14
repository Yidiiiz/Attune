// Owns: real orphan export preparation in a contained checkout, with no remote write.
// Failure behavior: verify source HEAD/index/content and clean only the checked temporary export.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { createCheckout } from "../lib/testing/checkout.ts";
import { git, removeTemporary } from "./publish-process.mjs";
const checkout = await createCheckout("publish-export");
const originalHead = checkout.git("rev-parse", "HEAD");
let setupRefusal: Error | undefined;
try { await createCheckout("must-refuse-cached-root"); } catch (error) { setupRefusal = error as Error; }
finally { process.env.ATTUNE_REPO_DIR = checkout.dir; }
const { prepareExport } = await import("./publish.mjs");
it("refuses a cached store root before any git setup can touch the first checkout", () => {
  expect(setupRefusal?.message).toContain("refusing all git setup");
  expect(checkout.git("rev-parse", "HEAD")).toBe(originalHead);
});
it("prepares exactly one public orphan while preserving source work and excluding private history", async () => {
  await checkout.reset({ setup: async () => {
    for (const [name, text] of [["LICENSE", "approved notice"], ["source.ts", "export const value = 1;\n"], ["HANDOFF.md", "private handoff"], ["BUILD_PROMPT.md", "private brief"]]) writeFileSync(path.join(checkout.dir, name), text);
  } });
  const before = checkout.git("rev-parse", "HEAD"), status = checkout.git("status", "--porcelain");
  const index = readFileSync(path.join(checkout.dir, ".git/index"));
  const dir = await prepareExport(checkout.dir);
  try {
    expect(git(dir, ["rev-list", "--all", "--count"])).toBe("1");
    expect(git(dir, ["log", "-1", "--format=%s"])).toBe("Publish");
    expect(git(dir, ["ls-files"])).toContain("LICENSE");
    expect(existsSync(path.join(dir, "HANDOFF.md"))).toBe(false);
    expect(existsSync(path.join(dir, "BUILD_PROMPT.md"))).toBe(false);
    expect(git(dir, ["remote"])).toBe("");
    expect(checkout.git("rev-parse", "HEAD")).toBe(before); expect(checkout.git("status", "--porcelain")).toBe(status);
    expect(readFileSync(path.join(checkout.dir, ".git/index"))).toEqual(index);
    expect(readFileSync(path.join(checkout.dir, "HANDOFF.md"), "utf8")).toBe("private handoff");
  } finally { await removeTemporary(dir); }
});
