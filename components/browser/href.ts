// Owns: every address the browser hands out (PROJECT.md §10.2) — a document's (`/chat?open=`, plus
// `&repo=1` for "Whole repo", plus the conversation it was opened from, so "← Back to chat" has
// somewhere to go), a file's bytes (`/api/files/raw`), and where a document's own links and images
// point. Pure, so the node tests hold it, and one place, so a link in a note, a tree row and a
// backlink all open a file the same way.
//
// A link in a `data/` document resolves by `lib/knowledge/links.ts`'s rule, the one the link index
// and backlinks use, so what the page opens is what the index counted. A "Whole repo" document's
// links are plain relative paths: the index's top-level rule is about `data/` and means nothing there.
//
// Failure behavior: none. A target that is not a path — a web address, a `#fragment` — is left as
// written.

import { resolveLink } from "@/lib/knowledge/links";
import type { LinkRules } from "@/components/markdown/pipeline";

export type Where = "data" | "repo";

/** The document view's address for `path`. `conversation` is carried so Back returns to it. */
export function documentHref(path: string, where: Where, conversation: string | null): string {
  const params = new URLSearchParams({ open: path });
  if (where === "repo") params.set("repo", "1");
  if (conversation) params.set("c", conversation);
  return `/chat?${params.toString()}`;
}

/** Where a linker in a backlink list opens: a conversation as itself, anything else as a document. */
export function linkerHref(path: string, conversation: string | null): string {
  const chat = /^chats\/([^/]+)\/conversation\.md$/.exec(path);
  return chat ? `/chat?c=${encodeURIComponent(chat[1])}` : documentHref(path, "data", conversation);
}

/** A file's bytes, through the route that decides whether they may show inline (Decision 88). */
export function rawHref(path: string, where: Where): string {
  return `/api/files/raw?path=${encodeURIComponent(path)}${where === "repo" ? "&repo=1" : ""}`;
}

/** PNG, JPEG, GIF and WebP are the images the raw route may show inline (Decisions 88, 93). */
export const RASTER = /\.(png|jpe?g|gif|webp)$/i;

/** A relative link in a repository file, resolved against that file's folder. */
export function resolveRepoLink(target: string, fromPath: string): string | null {
  const raw = target.trim();
  if (raw === "" || raw.startsWith("#") || raw.startsWith("?") || raw.startsWith("/") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    return null;
  }
  const url = new URL(raw, `https://repo.invalid/${fromPath}`);
  if (url.host !== "repo.invalid") return null;
  const rel = decodeURIComponent(url.pathname.slice(1));
  return rel.length > 0 ? rel : null;
}

/** Where the links and images in the document at `path` go. */
export function documentRules(path: string, where: Where, conversation: string | null): LinkRules {
  const resolve = (target: string): { rel: string; where: Where } | null => {
    if (where === "data") {
      const rel = resolveLink(target, path);
      return rel === null ? null : { rel, where: "data" };
    }
    const rel = resolveRepoLink(target, path);
    if (rel === null) return null;
    // A repository file pointing into `data/` means a data file, which opens from the data tree.
    return rel.startsWith("data/") ? { rel: rel.slice("data/".length), where: "data" } : { rel, where: "repo" };
  };
  return {
    href: (target) => {
      const found = resolve(target);
      return found === null ? null : documentHref(found.rel, found.where, conversation);
    },
    image: (target) => {
      const found = resolve(target);
      if (found === null) return null;
      const bytes = rawHref(found.rel, found.where);
      return RASTER.test(found.rel) ? { src: bytes } : { download: bytes };
    },
  };
}
