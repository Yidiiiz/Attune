// Owns: the Files panel's tree (PROJECT.md §10.2, §14) — `data/`, or with `all=1` the checkout's
// "Whole repo", which is git's tracked files and never the directory (the Phase 8 approval). Both
// leave credential-shaped names out (`lib/store/browse.ts`).
//
// **The data tree carries the write policy for each row** (Decision 105), from the same module the
// builders enforce it with, so the panel's `⋯` can disable what will not work and say why rather
// than offer it and refuse afterwards. It is display only: nothing here decides anything, and a
// request that never saw the menu meets exactly the same refusal inside the batch. "Whole repo"
// carries none, because nothing outside `data/` is written from this tree at all.
//
// Failure behavior: a git that will not list its files fails the whole-repo request with a message;
// the data tree does not depend on git and still answers.

import { z } from "zod";
import { dataTree, repoTree } from "@/lib/store/browse";
import { trackedFiles } from "@/lib/history/git";
import { rowPolicies } from "@/lib/history/write-policy";
import { handle, ok, parseInput } from "../../respond";

export const dynamic = "force-dynamic";

const Query = z.object({ all: z.enum(["0", "1"]).optional() });

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const { all } = parseInput(Query, Object.fromEntries(new URL(request.url).searchParams));
    if (all === "1") return ok({ root: "repo", tree: repoTree(await trackedFiles()) });
    const tree = await dataTree();
    return ok({ root: "data", tree, policies: rowPolicies(tree) });
  });
}
