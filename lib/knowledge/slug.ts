// Owns: turning a title into a slug — the rule a collection's file name, a collection item's
// `#fragment` and a new knowledge file's name are all made by (PROJECT.md §4.1, §4.5). Pure and free
// of any store import, so `items.ts` is pure too and a component can read a collection's items the
// way the promote builder does. `lib/store/knowledge.ts` re-exports it for the writers that already
// took it from there.
//
// Failure behavior: none. Every input has a slug; an input with no letters or digits gets `fallback`.

/** Title to slug: lowercase ASCII words joined by hyphens, at most 40 characters, never empty. */
export function slugify(text: string, fallback: string): string {
  const base = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length <= 40) return base || fallback;
  const cut = base.slice(0, 40);
  const boundary = cut.lastIndexOf("-");
  return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, "") || fallback;
}
