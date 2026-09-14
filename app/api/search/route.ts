// Owns: the shell's search (PROJECT.md §10.0, §14) — `search.ts`'s only caller (Decision 77). A hit
// on a file opens in the document view and a hit on a conversation opens the conversation; the
// `href` says which, so the box does not have to know the difference.
//
// Failure behavior: a file that would not parse is skipped and named in `skipped`, so the box can say
// the results may be missing something rather than presenting a partial list as the whole.

import { z } from "zod";
import { search } from "@/lib/knowledge/search";
import { handle, ok, parseInput } from "../respond";

export const dynamic = "force-dynamic";

const Query = z.object({ q: z.string().max(200) });

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const { q } = parseInput(Query, Object.fromEntries(new URL(request.url).searchParams));
    const { hits, skipped } = await search(q);
    const withHref = hits.map((hit) => ({
      ...hit,
      href: hit.kind === "conversation" ? `/chat?c=${encodeURIComponent(hit.path)}` : `/chat?open=${encodeURIComponent(hit.path)}`,
    }));
    return ok({ hits: withHref, skipped });
  });
}
