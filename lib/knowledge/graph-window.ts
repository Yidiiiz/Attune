// Owns: the graph's type filters and two-hop neighborhood (PROJECT.md §10.2).
// Failure behavior: an absent focus falls back to the most connected visible node;
// an empty filter gives an empty graph. Pure; d3 receives separate mutable copies.

import type { Graph, NodeKind } from "./graph.ts";

export const NODE_KINDS: NodeKind[] = ["task", "note", "map", "collection", "profile", "session", "index", "conversation", "file"];

export function graphWindow(graph: Graph, kinds: NodeKind[], focus: string | null, all: boolean): Graph {
  const nodes = graph.nodes.filter((node) => kinds.includes(node.kind));
  let ids = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  if (nodes.length > 400 && !all) {
    const center = ids.has(focus ?? "") ? focus! :
      [...nodes].sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id))[0].id;
    const neighbors = new Map<string, Set<string>>();
    for (const edge of edges) {
      for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
        const set = neighbors.get(from) ?? new Set<string>();
        set.add(to);
        neighbors.set(from, set);
      }
    }
    ids = new Set([center]);
    for (let hop = 0; hop < 2; hop += 1) {
      const next = [...ids].flatMap((id) => [...(neighbors.get(id) ?? [])]);
      next.forEach((id) => ids.add(id));
    }
  }
  return { nodes: nodes.filter((node) => ids.has(node.id)),
    edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)), errors: graph.errors };
}
