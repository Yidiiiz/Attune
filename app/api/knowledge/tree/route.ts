// Owns: the Knowledge panel's curated tree (PROJECT.md §10.2, §14) — maps by title with the notes
// they link to, then Collections — read from the link index (`lib/knowledge/graph.ts`).
//
// Failure behavior: `errors` names every file the index could not read, so a map that looks empty
// can say it may not be.

import { linkIndex } from "@/lib/knowledge/index";
import { knowledgeTree } from "@/lib/knowledge/graph";
import { handle, ok } from "../../respond";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handle(async () => ok({ ...knowledgeTree(await linkIndex()) }));
}
