// Owns: the LinkIndex — every edge between files under `data/`, read through the store and parsed
// with `links.ts` (PROJECT.md §5, §6.5, §10.2). `kb:check` is its first reader; Phase 8's backlinks,
// graph and knowledge tree are the rest, which is why it is its own module and not part of the check.
//
// `history/` is not read. The action mirror names every path a batch ever touched, so reading it as
// links would give every file an incoming edge and make an orphan impossible to see. `settings/` is
// JSON and has no links.
//
// **The built index is cached, and the cache is checked against the disk on every read.** A store
// write drops it at once (`events.onWrite`); a write that bypasses the store — undo's `git checkout`,
// a note edited in another program while the app runs, which is Phase 8's document view's ordinary
// case — changes `treeSignature`, which every `linkIndex()` call compares before answering. Until
// Phase 8 only the first was true, and `invalidateLinkIndex()`, which said it covered the second,
// had no caller. The signature is a stat walk, not a content hash; its one blind spot is written down
// where it is computed, in `lib/store/files.ts`.
//
// Failure behavior: a file whose frontmatter will not parse contributes no edges and is named in
// `errors`, so a reader acting on the index — `kb:check`'s orphan rule — can tell "nothing links
// here" from "I could not read what might". A reader that ignores `errors` is guessing.

import { onWrite } from "../store/events.ts";
import { listTree, readText, treeSignature } from "../store/files.ts";
import { splitFrontmatter } from "../store/frontmatter.ts";
import { headingOf } from "../store/knowledge.ts";
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
  /** Path → the title a reader shows for it: its frontmatter `title`, else its first heading. */
  titles: Map<string, string>;
  /** Task id → the path of the task file whose frontmatter names that id. */
  taskIds: Map<string, string>;
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
  const index: LinkIndex = {
    files: new Set(all), outgoing: new Map(), incoming: new Map(), errors: [], titles: new Map(), taskIds: new Map(),
  };

  for (const rel of all.filter((one) => one.endsWith(".md")).sort()) {
    let parsed: { data: Record<string, unknown>; body: string };
    try {
      parsed = splitFrontmatter(await readText(rel));
    } catch {
      index.errors.push(rel);
      continue;
    }
    const named = typeof parsed.data.title === "string" ? parsed.data.title.trim() : "";
    const title = named || headingOf(parsed.body);
    if (title) index.titles.set(rel, title);
    if (rel.startsWith("tasks/") && typeof parsed.data.id === "string") index.taskIds.set(parsed.data.id, rel);
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

let cached: { signature: string; index: Promise<LinkIndex> } | null = null;

/**
 * The index, built on first use and rebuilt whenever the files under it have changed since. The
 * signature is taken before the build, so a write that lands while it runs makes the next call
 * rebuild rather than trust an index that may have missed it.
 */
export async function linkIndex(): Promise<LinkIndex> {
  const signature = await treeSignature(SKIPPED);
  if (cached === null || cached.signature !== signature) {
    const entry = { signature, index: buildLinkIndex() };
    cached = entry;
    entry.index.catch(() => {
      if (cached === entry) cached = null;
    });
  }
  return cached.index;
}

export function invalidateLinkIndex(): void {
  cached = null;
}

onWrite(invalidateLinkIndex);
