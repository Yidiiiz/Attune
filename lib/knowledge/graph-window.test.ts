// Owns: neighborhood/filter checks. Failure behavior: fail on dropped two-hop nodes or leaked edges.
import { describe, expect, it } from "vitest";
import { graphWindow, NODE_KINDS } from "./graph-window.ts";
import type { Graph } from "./graph.ts";

const graph: Graph = { nodes: Array.from({ length: 405 }, (_, i) => ({
  id: String(i), title: `Node ${i}`, degree: i === 2 ? 5 : 2, kind: i === 3 ? "file" : "note",
})), edges: Array.from({ length: 404 }, (_, i) => ({ source: String(i), target: String(i + 1) })), errors: [] };

describe("graph window", () => {
  it("defaults to the most connected node and includes exactly two hops", () => {
    expect(graphWindow(graph, NODE_KINDS, null, false).nodes.map((n) => n.id)).toEqual(["0", "1", "2", "3", "4"]);
    expect(graphWindow(graph, NODE_KINDS, "403", false).nodes.map((n) => n.id)).toEqual(["401", "402", "403", "404"]);
  });
  it("Show all includes all nodes; filtering drops edges with a hidden endpoint", () => {
    expect(graphWindow(graph, NODE_KINDS, null, true).nodes).toHaveLength(405);
    const filtered = graphWindow(graph, ["note"], null, true);
    expect(filtered.nodes).toHaveLength(404);
    expect(filtered.edges.some((edge) => edge.source === "3" || edge.target === "3")).toBe(false);
  });
  it("handles empty data, no enabled kinds and an absent focus", () => {
    expect(graphWindow({ nodes: [], edges: [], errors: [] }, NODE_KINDS, null, false).nodes).toEqual([]);
    expect(graphWindow(graph, [], null, false).nodes).toEqual([]);
    expect(graphWindow(graph, NODE_KINDS, "missing", false).nodes[0].id).toBe("0");
  });
});
