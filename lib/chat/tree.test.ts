// The six properties PROJECT.md §16.10 names for the tree, plus the two failure shapes the module
// header promises: a cycle truncates rather than hangs, and a parent nobody has a file for ends the
// walk rather than being promoted to a root.

import { describe, expect, it } from "vitest";
import { activePath, buildPairs, buildTree, latestLeafUnder, siblingsOf } from "./tree.ts";
import type { Message } from "./types.ts";

let minted = 0;

/** A message with only the fields the tree looks at. `createdAt` ascends with creation order. */
function message(id: string, parentId: string | null, over: Partial<Message> = {}): Message {
  minted += 1;
  return {
    schema: 1,
    id,
    parentId,
    role: id.startsWith("a") ? "assistant" : "user",
    status: "complete",
    createdAt: `2026-09-07T10:${String(minted).padStart(2, "0")}:00-04:00`,
    model: null,
    attachments: [],
    refs: [],
    deleted: false,
    error: null,
    text: id,
    ...over,
  };
}

const ids = (messages: Message[]): string[] => messages.map((m) => m.id);

/**
 *  u1 ── a1 ── u2 ── a2
 *    \      \_ u3 ── a3
 *     u1b ── a1b
 */
function conversation(): Message[] {
  return [
    message("u1", null),
    message("a1", "u1"),
    message("u2", "a1"),
    message("a2", "u2"),
    message("u3", "a1"),
    message("a3", "u3"),
    message("u1b", null),
    message("a1b", "u1b"),
  ];
}

describe("buildTree", () => {
  it("derives children from parent links, roots under null", () => {
    const tree = buildTree(conversation());
    expect(tree.children.get(null)).toEqual(["u1", "u1b"]);
    expect(tree.children.get("a1")).toEqual(["u2", "u3"]);
    expect(tree.nodes.size).toBe(8);
  });

  it("orders siblings by createdAt then id, whatever order they arrived in", () => {
    const early = message("x", null, { createdAt: "2026-09-07T09:00:00-04:00" });
    const late = message("y", null, { createdAt: "2026-09-07T11:00:00-04:00" });
    const tieA = message("b", null, { createdAt: "2026-09-07T10:00:00-04:00" });
    const tieB = message("a", null, { createdAt: "2026-09-07T10:00:00-04:00" });

    expect(buildTree([late, tieA, tieB, early]).children.get(null)).toEqual(["x", "a", "b", "y"]);
  });

  it("keeps a deleted message in nodes but out of children", () => {
    const tree = buildTree([...conversation(), message("u4", "a1", { deleted: true })]);
    expect(tree.nodes.has("u4")).toBe(true);
    expect(tree.children.get("a1")).toEqual(["u2", "u3"]);
  });

  it("does not promote an orphan to a root", () => {
    const tree = buildTree([message("u1", null), message("lost", "gone")]);
    expect(tree.children.get(null)).toEqual(["u1"]);
    expect(tree.nodes.has("lost")).toBe(true);
  });
});

describe("activePath", () => {
  it("walks parents from the leaf and returns root-first", () => {
    expect(ids(activePath(buildTree(conversation()), "a2"))).toEqual(["u1", "a1", "u2", "a2"]);
  });

  it("returns nothing for a null leaf", () => {
    expect(activePath(buildTree(conversation()), null)).toEqual([]);
  });

  it("truncates on a missing parent rather than inventing one", () => {
    const tree = buildTree([message("orphan", "nobody"), message("child", "orphan")]);
    expect(ids(activePath(tree, "child"))).toEqual(["orphan", "child"]);
  });

  it("truncates on a cycle instead of hanging", () => {
    const tree = buildTree([message("a", "b"), message("b", "a")]);
    expect(ids(activePath(tree, "a")).sort()).toEqual(["a", "b"]);
  });

  it("leaves a deleted message out of the path", () => {
    const messages = conversation();
    const tree = buildTree([...messages, message("u4", "a2", { deleted: true })]);
    expect(ids(activePath(tree, "u4"))).toEqual(["u1", "a1", "u2", "a2"]);
  });
});

describe("siblingsOf", () => {
  it("answers with the children of the parent", () => {
    expect(ids(siblingsOf(buildTree(conversation()), "u2"))).toEqual(["u2", "u3"]);
  });

  it("treats roots as siblings of each other", () => {
    expect(ids(siblingsOf(buildTree(conversation()), "u1"))).toEqual(["u1", "u1b"]);
  });

  it("excludes a deleted sibling", () => {
    const tree = buildTree([...conversation(), message("u4", "a1", { deleted: true })]);
    expect(ids(siblingsOf(tree, "u2"))).toEqual(["u2", "u3"]);
  });

  it("answers with nothing for an id it does not know", () => {
    expect(siblingsOf(buildTree(conversation()), "nope")).toEqual([]);
  });
});

describe("latestLeafUnder", () => {
  it("follows the newest child at each step", () => {
    expect(latestLeafUnder(buildTree(conversation()), "a1")).toBe("a3");
  });

  it("answers with the id itself when it has no children", () => {
    expect(latestLeafUnder(buildTree(conversation()), "a2")).toBe("a2");
  });

  it("does not loop forever on a cycle", () => {
    const tree = buildTree([message("a", "b"), message("b", "a")]);
    expect(["a", "b"]).toContain(latestLeafUnder(tree, "a"));
  });
});

describe("buildPairs", () => {
  it("pairs each prompt with the reply that follows it", () => {
    const pairs = buildPairs(activePath(buildTree(conversation()), "a2"));
    expect(pairs.map((pair) => [pair.prompt.id, pair.response?.id ?? null])).toEqual([
      ["u1", "a1"],
      ["u2", "a2"],
    ]);
  });

  it("leaves an unanswered prompt with a null response", () => {
    const path = activePath(buildTree(conversation()), "u2");
    expect(buildPairs(path).map((pair) => pair.response?.id ?? null)).toEqual(["a1", null]);
  });

  it("gives a branch point more than one sibling, which is what makes it a section header", () => {
    const tree = buildTree(conversation());
    const pairs = buildPairs(activePath(tree, "a2"));
    const branching = pairs.filter((pair) => siblingsOf(tree, pair.prompt.id).length > 1);
    expect(branching.map((pair) => pair.prompt.id)).toEqual(["u1", "u2"]);
  });
});
