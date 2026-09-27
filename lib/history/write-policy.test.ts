// What this pins: `rowPolicy` is the Files panel's menu reading the same table the builders enforce,
// and not a second copy of it (Decision 105). The owner's condition on that item was exactly this —
// "from the same table the builder enforces, not a second copy of the rules" — and a prose claim is
// the shape that drifts, so the identity is asserted rather than described.
//
// Two halves. The first is the invariant: for every row, each of the four answers is *the same string*
// the primitive gives, so a sentence hand-written into `rowPolicy` fails here rather than in a menu
// nobody compares against the builder. The second is a pin on the outcomes themselves, so a change to
// the table shows up as a change to what the menu offers, in this file's diff.

import { describe, expect, test } from "vitest";
import { folderPolicy, policyFor, rowPolicy, rowPolicies } from "./write-policy.ts";
import type { TreeNode } from "../store/files.ts";

const FILES = [
  "tasks/2026-09-20-a.md",
  "knowledge/notes/a.md",
  "knowledge/maps/m.md",
  "knowledge/collections/c.md",
  "knowledge/profile/habits.md",
  "knowledge/sessions/c_20260920_aaaa.md",
  "knowledge/index.md",
  "files/index.md",
  "files/notes.txt",
  "files/images/2026-09/p.png",
  "chats/c_1/messages/m.md",
  "history/actions.jsonl",
  "settings/settings.json",
];

const FOLDERS = ["tasks", "knowledge", "knowledge/notes", "knowledge/notes/deep", "knowledge/maps", "files", "files/images", "chats"];

describe("rowPolicy answers only what the table already says", () => {
  test.each(FILES)("%s takes its rename and delete from policyFor", (rel) => {
    const table = policyFor(rel, { text: true });
    const row = rowPolicy(rel, false);
    expect(row.rename).toBe(table.rename);
    expect(row.remove).toBe(table.remove);
  });

  test.each(FOLDERS)("%s takes all four from folderPolicy and policyFor", (rel) => {
    const folder = folderPolicy(rel);
    const row = rowPolicy(rel, true);
    expect(row.rename).toBe(folder.rename);
    expect(row.remove).toBe(folder.remove);
    expect(row.newFolder).toBe(folderPolicy(`${rel}/a-new-folder`).create);
    expect(row.newFile).toBe(policyFor(`${rel}/a-new-file.md`, { text: true }).create);
  });

  test("no folder is renamed, and the sentence is the one the builder throws", () => {
    for (const rel of FOLDERS) expect(rowPolicy(rel, true).rename).toBe(folderPolicy(rel).rename);
    expect(folderPolicy("files").rename).toContain("A folder is not renamed here");
  });

  test("a file is never offered New file or New folder, and says where they are", () => {
    for (const rel of FILES) {
      expect(rowPolicy(rel, false).newFile).toContain("New file and New folder are offered on the folder");
      expect(rowPolicy(rel, false).newFolder).toBe(rowPolicy(rel, false).newFile);
    }
  });
});

describe("what the menu therefore offers", () => {
  const allowed = (rel: string, isFolder: boolean): string[] =>
    Object.entries(rowPolicy(rel, isFolder))
      .filter(([, why]) => why === null)
      .map(([entry]) => entry)
      .sort();

  test("files", () => {
    expect(allowed("tasks/2026-09-20-a.md", false)).toEqual(["remove", "rename"]);
    expect(allowed("knowledge/notes/a.md", false)).toEqual(["remove"]); // §6.3 keeps a map linking it
    expect(allowed("knowledge/maps/m.md", false)).toEqual(["remove", "rename"]);
    expect(allowed("knowledge/collections/c.md", false)).toEqual(["remove", "rename"]);
    expect(allowed("knowledge/profile/habits.md", false)).toEqual([]);
    expect(allowed("knowledge/sessions/c_20260920_aaaa.md", false)).toEqual(["remove"]);
    expect(allowed("files/notes.txt", false)).toEqual(["remove", "rename"]);
    expect(allowed("files/images/2026-09/p.png", false)).toEqual(["remove", "rename"]);
    expect(allowed("knowledge/index.md", false)).toEqual([]);
    expect(allowed("files/index.md", false)).toEqual([]);
    expect(allowed("chats/c_1/messages/m.md", false)).toEqual([]);
    expect(allowed("history/actions.jsonl", false)).toEqual([]);
    expect(allowed("settings/settings.json", false)).toEqual([]);
  });

  test("folders", () => {
    // `files` itself is one of the folders the app keeps, so it takes things but is not deleted.
    expect(allowed("files", true)).toEqual(["newFile", "newFolder"]);
    expect(allowed("files/images", true)).toEqual(["newFile", "newFolder", "remove"]);
    expect(allowed("knowledge/notes", true)).toEqual(["newFile", "newFolder"]);
    expect(allowed("knowledge", true)).toEqual([]);
    // The table allows a new file here; the map writer then refuses one with no frontmatter. That
    // residual is named below rather than answered with a sentence this module would have to invent.
    expect(allowed("knowledge/maps", true)).toEqual(["newFile"]);
    expect(allowed("tasks", true)).toEqual([]);
    expect(allowed("chats", true)).toEqual([]);
  });

  // The two the table allows and the builder behind this menu still refuses, named rather than
  // half-closed: a new note needs the map §6.3 requires and this menu has no way to ask for one, and
  // a new map or collection needs frontmatter an empty file has none of. Both are enforced where the
  // record is written, not in the table, so putting a sentence for them here would be the second copy
  // the condition rules out. They arrive as a refusal beside the typed name.
  test("New file under knowledge/notes/ is offered by the table, and refused by the writer", () => {
    expect(rowPolicy("knowledge/notes", true).newFile).toBeNull();
    expect(policyFor("knowledge/notes/a-new-file.md", { text: true }).create).toBeNull();
  });
});

test("rowPolicies covers every node of a tree, folders included", () => {
  const tree: TreeNode[] = [
    {
      name: "files",
      path: "files",
      type: "dir",
      children: [{ name: "notes.txt", path: "files/notes.txt", type: "file" }],
    },
    { name: "index.md", path: "knowledge/index.md", type: "file" },
  ];
  const all = rowPolicies(tree);
  expect(Object.keys(all).sort()).toEqual(["files", "files/notes.txt", "knowledge/index.md"]);
  expect(all.files.newFile).toBeNull();
  expect(all["files/notes.txt"].rename).toBeNull();
  expect(all["knowledge/index.md"].remove).toContain("generated from the maps");
});
