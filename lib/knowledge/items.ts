// Owns: the body format of a collection (PROJECT.md §4.5) — which lines are items, what each
// item's slug is, and whether it has already been promoted to a task. Pure, so the promote builder,
// `kb:check` and a future document view all read an item the same way.
//
// Failure behavior: none. A line that is not a checkbox item is not an item; nothing here throws.

import { slugify } from "../store/knowledge.ts";

export interface CollectionItem {
  /** Zero-based line index in the body. */
  line: number;
  done: boolean;
  /** The line's text after the checkbox, without any ` → [[t_…]]` promote marker. */
  text: string;
  /** What the slug is made from: the text before a ` — ` description, which is §4.5's example. */
  title: string;
  slug: string;
  /** The task this item was promoted to, or null. */
  taskId: string | null;
}

const ITEM_RE = /^\s*[-*] \[( |x|X)\] (.*)$/;
const PROMOTED_RE = /\s*→\s*\[\[(t_\d{8}_[0-9a-f]{4})\]\]\s*$/;

/**
 * The checkbox items in a collection body (§4.5). `movies.md#dune` names "Dune — the 2021 one
 * first", so an item's slug is made from the part before ` — `. Two items with the same slug are
 * told apart the way task files are, by a numeric suffix in order of appearance.
 */
export function itemsOf(body: string): CollectionItem[] {
  const seen = new Map<string, number>();
  const items: CollectionItem[] = [];
  body.split("\n").forEach((raw, line) => {
    const match = ITEM_RE.exec(raw);
    if (!match) return;
    const promoted = PROMOTED_RE.exec(match[2]);
    const text = (promoted ? match[2].slice(0, promoted.index) : match[2]).trim();
    const title = text.split(" — ")[0].trim();
    const base = slugify(title, "item");
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    items.push({
      line,
      done: match[1] !== " ",
      text,
      title,
      slug: count === 1 ? base : `${base}-${count}`,
      taskId: promoted ? promoted[1] : null,
    });
  });
  return items;
}
