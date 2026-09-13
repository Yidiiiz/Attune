// Owns: the LinkIndex — every edge between files under `data/`, read through the store and parsed
// with `links.ts` (PROJECT.md §5, §6.5, §10.2). `kb:check` is its first reader; Phase 8's backlinks,
// graph and knowledge tree are the rest, which is why it is its own module and not part of the check.
//
// `history/` is not read. The action mirror names every path a batch ever touched, so reading it as
// links would give every file an incoming edge and make an orphan impossible to see. `settings/` is
// JSON and has no links.
//
// The built index is cached and dropped on any store write (`events.onWrite`) or by
// `invalidateLinkIndex()`, for writes that bypass the store's events — an undo's `git checkout`, or a
// file edited by hand while the app runs, which the index does not see until something invalidates it.
//
// Failure behavior: a file whose frontmatter will not parse contributes no edges and is named in
// `errors`, so a reader acting on the index — `kb:check`'s orphan rule — can tell "nothing links
// here" from "I could not read what might". A reader that ignores `errors` is guessing.

import { onWrite } from "../store/events.ts";
import { listTree, readText } from "../store/files.ts";
import { splitFrontmatter } from "../store/frontmatter.ts";
import { extractLinks } from "./links.ts";
import type { TreeNode } from "../store/files.ts";

export interface LinkIndex {
  /** Every file under `data/`, markdown or not, except `history/`. What "exists" means for a link. */
  files: Set<string>;
  /** Path → the edges out of it, as `extractLinks` returns them. Markdown files only. */
  outgoing: Map<string, string[]>;
  /** Edge target → the paths that point at it. Task ids are targets too. */
  incoming: Map<string, Set<string>>;
  /** Markdown files whose frontmatter did not parse; their edges are unknown, not absent. */
  errors: string[];
}

const SKIPPED = ["history/", "settings/"];

function flatten(nodes: TreeNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === "dir") flatten(node.children ?? [], into);
    else into.push(node.path);
  }
  return into;
}

export async function buildLinkIndex(): Promise<LinkIndex> {
  const all = flatten(await listTree("")).filter((rel) => !SKIPPED.some((prefix) => rel.startsWith(prefix)));
  const index: LinkIndex = { files: new Set(all), outgoing: new Map(), incoming: new Map(), errors: [] };

  for (const rel of all.filter((one) => one.endsWith(".md")).sort()) {
    let parsed: { data: Record<string, unknown>; body: string };
    try {
      parsed = splitFrontmatter(await readText(rel));
    } catch {
      index.errors.push(rel);
      continue;
    }
    const edges = extractLinks(rel, parsed.data, parsed.body);
    index.outgoing.set(rel, edges);
    for (const edge of edges) {
      const from = index.incoming.get(edge) ?? new Set<string>();
      from.add(rel);
      index.incoming.set(edge, from);
    }
  }
  return index;
}

let cached: Promise<LinkIndex> | null = null;

/** The index, built on first use and rebuilt after anything writes. */
export function linkIndex(): Promise<LinkIndex> {
  cached ??= buildLinkIndex().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

export function invalidateLinkIndex(): void {
  cached = null;
}

onWrite(invalidateLinkIndex);
