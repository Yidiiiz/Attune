// Owns: a file's "Linked from" list (PROJECT.md §10.2, §14), from the link index — the path, a
// task's id, and a conversation's messages all count, as they do for the graph.
//
// Failure behavior: `errors` names the files the index could not read; a non-empty list means "these
// are the links I could see", and the document view says so rather than showing an empty list as
// the truth (AGENTS.md Conventions).

import { z } from "zod";
import { linkIndex } from "@/lib/knowledge/index";
import { backlinksOf } from "@/lib/knowledge/graph";
import { resolveData } from "@/lib/store/paths";
import { handle, ok, parseInput } from "../../respond";

export const dynamic = "force-dynamic";

const Query = z.object({ path: z.string().min(1).max(500) });

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const { path } = parseInput(Query, Object.fromEntries(new URL(request.url).searchParams));
    resolveData(path); // a path out of data/ is refused, not answered with an empty list
    return ok({ ...backlinksOf(await linkIndex(), path) });
  });
}
