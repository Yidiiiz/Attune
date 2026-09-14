// Owns: the graph's data (PROJECT.md §10.2, §14) — every node and every edge, from the same reading
// of the link index that backlinks use, so the two agree by construction (`lib/knowledge/graph.ts`).
// The view that draws it is Phase 8b's; this is here because it is how §17's "edges matching
// backlinks" is checked over HTTP before anything draws.
//
// Failure behavior: `errors` carries the files whose links could not be read.

import { linkIndex } from "@/lib/knowledge/index";
import { graphOf } from "@/lib/knowledge/graph";
import { handle, ok } from "../../respond";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handle(async () => ok({ ...graphOf(await linkIndex()) }));
}
