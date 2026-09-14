// What the file browser may list and open, against a real checkout — the approval's "Whole repo"
// conditions as failing cases: `.env.local` asked for by path is refused even when it is tracked, an
// untracked file is refused when asked for directly, and a link out of `data/` is not followed.

import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "../testing/checkout.ts";

const checkout = await createCheckout("browse");
const { dataTree, readForBrowser, repoTree } = await import("./browse.ts");

const ENV = "ANTHROPIC_API_KEY=" + "sk" + "-ant-" + "E".repeat(30) + "\n";

beforeEach(async () => {
  await checkout.reset({
    setup: async () => {
      await writeFile(path.join(checkout.dir, ".env.local"), ENV);
      await writeFile(path.join(checkout.dir, "README.md"), "# Attune\n");
      await writeFile(path.join(checkout.dir, "notes.txt"), "not tracked\n");
      await writeFile(path.join(checkout.data, "files", ".env"), ENV);
    },
  });
});

const paths = (nodes: ReturnType<typeof repoTree>): string[] =>
  nodes.flatMap((node) => [node.path, ...paths(node.children ?? [])]);

describe("the trees", () => {
  it("builds Whole repo from tracked files, without data/ and without a credential name even if tracked", () => {
    const tree = repoTree(["README.md", "lib/store/files.ts", "lib/store/paths.ts", ".env.local", "config/id_rsa", "data/tasks/a.md"]);
    expect(paths(tree)).toEqual(["lib", "lib/store", "lib/store/files.ts", "lib/store/paths.ts", "README.md"]);
  });

  it("leaves a credential-shaped file out of the data tree", async () => {
    const all = paths(await dataTree());
    expect(all).toContain("files/index.md");
    expect(all).not.toContain("files/.env");
  });
});

describe("readForBrowser", () => {
  it("refuses .env.local asked for by path, even in a tracked set", async () => {
    const tracked = new Set(["README.md", ".env.local"]);
    await expect(readForBrowser(".env.local", "repo", tracked)).rejects.toMatchObject({ code: "forbidden_path" });
    const message = await readForBrowser(".env.local", "repo", tracked).catch((err: Error) => err.message);
    expect(message).not.toContain("sk-");
  });

  it("refuses a file git does not track, asked for directly", async () => {
    await expect(readForBrowser("notes.txt", "repo", new Set(["README.md"]))).rejects.toMatchObject({ code: "forbidden_path" });
    expect((await readForBrowser("README.md", "repo", new Set(["README.md"]))).toString()).toBe("# Attune\n");
  });

  it("sends data/ files to the data tree, and refuses a credential name there too", async () => {
    await expect(readForBrowser("data/files/index.md", "repo", new Set(["data/files/index.md"]))).rejects.toMatchObject({ code: "forbidden_path" });
    await expect(readForBrowser("files/.env", "data")).rejects.toMatchObject({ code: "forbidden_path" });
    await expect(readForBrowser("../.env.local", "data")).rejects.toMatchObject({ code: "forbidden_path" });
  });

  it("does not follow a link out of data/, whatever the name at the end of it", async () => {
    await mkdir(path.join(checkout.dir, "outside"), { recursive: true });
    await writeFile(path.join(checkout.dir, "outside", "plain.txt"), "outside data\n");
    await symlink(path.join(checkout.dir, "outside"), path.join(checkout.data, "files", "door"), "junction");
    const attempt = readForBrowser("files/door/plain.txt", "data");
    await expect(attempt).rejects.toMatchObject({ code: "forbidden_path" });
    expect(await attempt.catch((err: Error) => err.message)).toContain("outside data/");
  });
});
