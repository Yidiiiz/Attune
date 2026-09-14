import { describe, expect, it } from "vitest";
import { backlinksOf, graphOf, knowledgeTree, nodeOf } from "./graph.ts";
import type { LinkIndex } from "./index.ts";

const TASK = "tasks/2026-09-10-pset-4.md";
const CONV = "chats/c_20260910_0a1b/conversation.md";
const MSG = "chats/c_20260910_0a1b/messages/019f.md";
const MSG2 = "chats/c_20260910_0a1b/messages/01a0.md";
const NOTE = "knowledge/notes/change-of-basis.md";
const MAP = "knowledge/maps/courses.md";
const COLL = "knowledge/collections/movies.md";

/** A hand-built index: links by path, by task id, from messages, to nothing, and to itself. */
function fixture(): LinkIndex {
  const outgoing = new Map<string, string[]>([
    [MAP, [NOTE, "knowledge/notes/missing.md", "knowledge/notes/second.md"]],
    [NOTE, [MAP, NOTE, "t_20260910_7fa2"]],
    ["knowledge/notes/second.md", [MAP]],
    [TASK, [NOTE, COLL]],
    [COLL, ["t_20260910_7fa2", "t_20990101_dead"]],
    [MSG, ["t_20260910_7fa2", NOTE, MSG2]],
    [MSG2, [NOTE]],
    [CONV, [NOTE]],
    ["knowledge/index.md", [MAP]],
  ]);
  const incoming = new Map<string, Set<string>>();
  for (const [from, edges] of outgoing) {
    for (const edge of edges) incoming.set(edge, new Set([...(incoming.get(edge) ?? []), from]));
  }
  return {
    files: new Set([MAP, NOTE, "knowledge/notes/second.md", TASK, COLL, CONV, MSG, MSG2, "knowledge/index.md", "files/images/a.png"]),
    outgoing,
    incoming,
    errors: ["knowledge/notes/broken.md"],
    titles: new Map([[MAP, "Courses"], [NOTE, "Change of basis"], ["knowledge/notes/second.md", "Another note"], [TASK, "Pset 4"], [COLL, "Movies"], [CONV, "Change of basis chat"]]),
    taskIds: new Map([["t_20260910_7fa2", TASK]]),
  };
}

describe("nodeOf", () => {
  it("folds a conversation's messages and annotations into the conversation", () => {
    expect(nodeOf(MSG)).toBe(CONV);
    expect(nodeOf("chats/c_20260910_0a1b/annotations/01b0.md")).toBe(CONV);
    expect(nodeOf(CONV)).toBe(CONV);
    expect(nodeOf(NOTE)).toBe(NOTE);
  });
});

describe("backlinksOf", () => {
  it("lists each linking file once, a conversation for its messages, and never the file itself", () => {
    const paths = backlinksOf(fixture(), NOTE).linkers.map((one) => one.path);
    expect(paths.sort()).toEqual([CONV, MAP, TASK].sort());
  });

  it("counts a [[t_…]] mention as a link to the task's file", () => {
    const paths = backlinksOf(fixture(), TASK).linkers.map((one) => one.path);
    expect(paths.sort()).toEqual([COLL, CONV, NOTE].sort());
  });

  it("carries the index's errors, so an empty list can say it may be incomplete", () => {
    const result = backlinksOf(fixture(), "files/images/a.png");
    expect(result.linkers).toEqual([]);
    expect(result.errors).toEqual(["knowledge/notes/broken.md"]);
  });

  it("labels each linker with its title and kind", () => {
    expect(backlinksOf(fixture(), MAP).linkers).toEqual([
      { path: "knowledge/notes/second.md", title: "Another note", kind: "note" },
      { path: NOTE, title: "Change of basis", kind: "note" },
      { path: "knowledge/index.md", title: "index.md", kind: "index" },
    ]);
  });
});

describe("graphOf", () => {
  it("has one node per file, one per conversation, and no edge to a file that is not there", () => {
    const graph = graphOf(fixture());
    const ids = graph.nodes.map((node) => node.id);
    expect(ids).toContain(CONV);
    expect(ids).not.toContain(MSG);
    expect(graph.edges.some((edge) => edge.target.endsWith("missing.md"))).toBe(false);
    expect(graph.edges.some((edge) => edge.source === edge.target)).toBe(false);
    expect(graph.errors).toEqual(["knowledge/notes/broken.md"]);
  });

  it("gives every node exactly its backlinks as incoming edges — §17's check, for every node", () => {
    const index = fixture();
    const graph = graphOf(index);
    let compared = 0;
    for (const node of graph.nodes) {
      const sources = graph.edges.filter((edge) => edge.target === node.id).map((edge) => edge.source).sort();
      const linkers = backlinksOf(index, node.id).linkers.map((one) => one.path).sort();
      expect([node.id, sources]).toEqual([node.id, linkers]);
      compared += sources.length;
    }
    expect(compared).toBeGreaterThan(5); // the fixture's links are really in play, not an empty match
  });

  it("counts degree over both directions", () => {
    const note = graphOf(fixture()).nodes.find((node) => node.id === NOTE);
    // In: map, task, conversation. Out: map, task (through its id).
    expect(note?.degree).toBe(5);
  });
});

describe("knowledgeTree", () => {
  it("lists maps by title with the notes they link to in the map's order, then Collections", () => {
    const { tree, errors } = knowledgeTree(fixture());
    expect(tree.map((node) => node.name)).toEqual(["Courses", "Collections"]);
    expect(tree[0].children?.map((node) => node.path)).toEqual([NOTE, "knowledge/notes/second.md"]);
    expect(tree[1].children?.map((node) => node.name)).toEqual(["Movies"]);
    expect(errors).toEqual(["knowledge/notes/broken.md"]);
  });
});
