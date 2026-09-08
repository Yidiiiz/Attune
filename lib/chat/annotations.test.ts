import { describe, expect, it } from "vitest";
import { groupAnnotations } from "./annotations.ts";
import { buildTree } from "./tree.ts";
import type { Annotation, Message } from "./types.ts";

const message = (id: string, parentId: string | null, deleted = false): Message => ({
  schema: 1,
  id,
  parentId,
  role: id.startsWith("a") ? "assistant" : "user",
  status: "complete",
  createdAt: `2026-09-08T10:00:0${id.slice(-1)}-04:00`,
  model: null,
  attachments: [],
  refs: [],
  deleted,
  error: null,
  text: id,
});

const note = (id: string, targetMessageId: string, deleted = false): Annotation => ({
  schema: 1,
  id,
  kind: "note",
  targetMessageId,
  quote: "something",
  prefix: null,
  suffix: null,
  charOffset: null,
  anchorText: null,
  offsetRatio: null,
  includeInContext: false,
  deleted,
  createdAt: "2026-09-08T10:05:00-04:00",
  text: `note ${id}`,
});

// u1 → a1 → u2 (open branch) and u1 → a1 → u3 (the other branch); u4 was deleted.
const MESSAGES = [
  message("u1", null),
  message("a1", "u1"),
  message("u2", "a1"),
  message("u3", "a1"),
  message("u4", "a1", true),
];
const TREE = buildTree(MESSAGES);
const PATH = ["u1", "a1", "u2"];

describe("groupAnnotations", () => {
  it("puts an annotation on the open branch in the gutter", () => {
    const groups = groupAnnotations([note("n1", "a1")], TREE, PATH);
    expect(groups.onPath.map((a) => a.id)).toEqual(["n1"]);
    expect(groups.offPath).toEqual([]);
  });

  it("counts an annotation on another branch rather than dropping it", () => {
    const groups = groupAnnotations([note("n1", "u3")], TREE, PATH);
    expect(groups.offPath.map((a) => a.id)).toEqual(["n1"]);
    expect(groups.onPath).toEqual([]);
  });

  it("sends an annotation on a deleted message to the Unanchored tray", () => {
    const groups = groupAnnotations([note("n1", "u4")], TREE, PATH);
    expect(groups.unanchored.map((a) => a.id)).toEqual(["n1"]);
  });

  it("sends an annotation on a message that is not there to the Unanchored tray", () => {
    const groups = groupAnnotations([note("n1", "gone")], TREE, PATH);
    expect(groups.unanchored.map((a) => a.id)).toEqual(["n1"]);
  });

  it("puts a soft-deleted annotation in the restore tray whatever became of its target", () => {
    // The ordering that matters: `deleted` is checked before the target is looked at, so a note the
    // reader removed from a message that has since gone is restorable rather than "unanchored",
    // which would read as a fault instead of as something they did.
    const groups = groupAnnotations(
      [note("n1", "a1", true), note("n2", "gone", true), note("n3", "u3", true)],
      TREE,
      PATH,
    );
    expect(groups.removed.map((a) => a.id)).toEqual(["n1", "n2", "n3"]);
    expect(groups.onPath).toEqual([]);
    expect(groups.offPath).toEqual([]);
    expect(groups.unanchored).toEqual([]);
  });

  it("accounts for every annotation exactly once", () => {
    // §16.4's rule, as arithmetic: nothing is filtered away, because an annotation that is not
    // drawn still has to be counted somewhere the reader can see it.
    const all = [
      note("n1", "a1"),
      note("n2", "u3"),
      note("n3", "u4"),
      note("n4", "gone"),
      note("n5", "u2", true),
    ];
    const groups = groupAnnotations(all, TREE, PATH);
    const total =
      groups.onPath.length + groups.offPath.length + groups.unanchored.length + groups.removed.length;
    expect(total).toBe(all.length);
  });

  it("answers with four empty lists for a conversation with no annotations", () => {
    expect(groupAnnotations([], TREE, PATH)).toEqual({
      onPath: [],
      offPath: [],
      unanchored: [],
      removed: [],
    });
  });
});
