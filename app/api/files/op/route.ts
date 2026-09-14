// Owns: the Files panel's operations (PROJECT.md §10.2, §14) — New folder, Rename within a folder,
// Delete — each one batch, undoable. What is allowed where, and why a rename is refused, are the
// builders' in `lib/history/file-actions.ts`; "Reveal in graph" is Phase 8b's and writes nothing.
//
// Failure behavior: every refusal is the §14 shape with nothing written; `runBatch` rolls back a
// half-applied operation.

import { z } from "zod";
import { runBatch } from "@/lib/history/batch";
import { deleteAction, folderAction, renameAction } from "@/lib/history/file-actions";
import { commitPrefixFor } from "@/lib/history/write-policy";
import { body as readBody, handle, ok, parseInput } from "../../respond";

export const dynamic = "force-dynamic";

const Path = z.string().min(1).max(500);
const Input = z.discriminatedUnion("op", [
  z.object({ op: z.literal("mkdir"), path: Path }),
  z.object({ op: z.literal("rename"), path: Path, name: z.string().min(1).max(120) }),
  z.object({ op: z.literal("delete"), path: Path }),
]);

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const input = parseInput(Input, await readBody(request));
    const action =
      input.op === "mkdir" ? folderAction(input.path) : input.op === "rename" ? renameAction(input.path, input.name) : deleteAction(input.path);
    const result = await runBatch({
      actor: "user",
      scope: "user",
      summary: action.summary[0].toLowerCase() + action.summary.slice(1),
      commitPrefix: commitPrefixFor(input.path),
      actions: [action],
    });
    return ok({ ...result });
  });
}
