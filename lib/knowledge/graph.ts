// Owns: what the knowledge browser reads out of the link index — a file's backlinks, the graph, and
// the Knowledge panel's curated tree (PROJECT.md §10.2). Pure functions over a `LinkIndex`; the routes
// build the index and hand it over, so every rule here is testable without a disk.
//
// **Backlinks and the graph are one reading, so they cannot disagree.** Both go through `nodeOf`,
// which folds a conversation's message and annotation files into the conversation (§10.2: "message
// `refs` aggregated to the conversation"; conversations are one node each), and through `taskIds`,
// which turns a `[[t_…]]` edge into the task's file. The graph's edges into a node are exactly that
// node's backlinks — `graph.test.ts` checks it for every node of a fixture, which is §17's check
// ("edges matching backlinks") held as a property rather than looked at.
//
// Failure behavior: none of its own. Every result carries the index's `errors` — files whose
// frontmatter did not parse, whose links are unknown rather than absent — so a reader can say "I
// could not read everything that might link here" instead of "nothing does" (AGENTS.md Conventions).

import { kindOf } from "../store/knowledge.ts";
import { isTaskId } from "./links.ts";
import type { LinkIndex } from "./index.ts";
import type { TreeNode } from "../store/files.ts";

export type NodeKind =
  | "task" | "note" | "map" | "collection" | "profile" | "session" | "index" | "conversation" | "file";

export interface Linker {
  path: string;
  title: string;
  kind: NodeKind;
}

export interface Backlinks {
  path: string;
  linkers: Linker[];
  /** Files whose links could not be read. Non-empty means the list may be missing someone. */
  errors: string[];
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  title: string;
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  errors: string[];
}

const CONVERSATION_PART = /^(chats\/[^/]+)\/(?:messages|annotations)\/[^/]+$/;

/** The node a file belongs to: a message or an annotation is its conversation; anything else is itself. */
export function nodeOf(rel: string): string {
  const part = CONVERSATION_PART.exec(rel);
  return part ? `${part[1]}/conversation.md` : rel;
}

export function nodeKind(rel: string): NodeKind {
  if (/^tasks\/[^/]+\.md$/.test(rel)) return "task";
  if (/^chats\/[^/]+\/conversation\.md$/.test(rel)) return "conversation";
  return kindOf(rel) ?? "file";
}

const nameOf = (rel: string): string => rel.split("/").pop() ?? rel;

export const titleOf = (index: LinkIndex, rel: string): string => index.titles.get(rel) ?? nameOf(rel);

/** An edge's target as a file path: a task id becomes its task's file, or null when no file has it. */
function targetPath(index: LinkIndex, edge: string): string | null {
  return isTaskId(edge) ? (index.taskIds.get(edge) ?? null) : edge;
}

/**
 * The files that link to `rel`, each once, as nodes. Everything that resolves to `rel`'s node counts:
 * the path itself, a task's id wherever `[[t_…]]` names it, and — for a conversation — links to any
 * of its messages. A file linking to itself is not its own backlink.
 */
export function backlinksOf(index: LinkIndex, rel: string): Backlinks {
  const node = nodeOf(rel);
  const keys = new Set<string>();
  for (const file of index.files) if (nodeOf(file) === node) keys.add(file);
  for (const [id, path] of index.taskIds) if (path === node) keys.add(id);

  const found = new Set<string>();
  for (const key of keys) {
    for (const from of index.incoming.get(key) ?? []) {
      const source = nodeOf(from);
      if (source !== node) found.add(source);
    }
  }
  const linkers = [...found]
    .map((path) => ({ path, title: titleOf(index, path), kind: nodeKind(path) }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path));
  return { path: node, linkers, errors: [...index.errors] };
}

/**
 * Every file under `data/` as a node — `history/` and `settings/` are not in the index, and a
 * conversation's files are one node — and every edge between two nodes that exist. A link to a file
 * that is not there has no node to end at and is left out; `kb:check` is where a broken link is
 * reported, not the picture.
 */
export function graphOf(index: LinkIndex): Graph {
  const ids = new Set<string>();
  for (const file of index.files) ids.add(nodeOf(file));

  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  const degree = new Map<string, number>();
  for (const [from, targets] of index.outgoing) {
    const source = nodeOf(from);
    for (const edge of targets) {
      const path = targetPath(index, edge);
      if (path === null) continue;
      const target = nodeOf(path);
      const key = `${source}\n${target}`;
      if (target === source || !ids.has(target) || seen.has(key)) continue;
      seen.add(key);
      edges.push({ source, target });
      degree.set(source, (degree.get(source) ?? 0) + 1);
      degree.set(target, (degree.get(target) ?? 0) + 1);
    }
  }

  const nodes = [...ids]
    .sort()
    .map((id) => ({ id, kind: nodeKind(id), title: titleOf(index, id), degree: degree.get(id) ?? 0 }));
  return { nodes, edges, errors: [...index.errors] };
}

/**
 * §10.2's Knowledge panel: each map by title, expanding to the notes it links to in the map's own
 * order, then **Collections**. A map is a file you can open *and* a folder you can expand, so it is a
 * `file` node with `children`. A note a map links to that does not exist is left out, as in the graph.
 */
export function knowledgeTree(index: LinkIndex): { tree: TreeNode[]; errors: string[] } {
  const byTitle = (rels: string[]): string[] =>
    rels.sort((a, b) => titleOf(index, a).localeCompare(titleOf(index, b)) || a.localeCompare(b));
  const all = [...index.files];

  const maps = byTitle(all.filter((rel) => kindOf(rel) === "map")).map((map): TreeNode => {
    const notes = [...new Set(index.outgoing.get(map) ?? [])].filter((rel) => kindOf(rel) === "note" && index.files.has(rel));
    return {
      name: titleOf(index, map),
      path: map,
      type: "file",
      children: notes.map((rel) => ({ name: titleOf(index, rel), path: rel, type: "file" })),
    };
  });

  const collections: TreeNode = {
    name: "Collections",
    path: "knowledge/collections",
    type: "dir",
    children: byTitle(all.filter((rel) => kindOf(rel) === "collection")).map((rel) => ({
      name: titleOf(index, rel),
      path: rel,
      type: "file",
    })),
  };

  return { tree: [...maps, collections], errors: [...index.errors] };
}
