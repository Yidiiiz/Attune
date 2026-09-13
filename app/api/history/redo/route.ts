// Owns: redoing one batch over HTTP (PROJECT.md §7.2, §14).
// Redo has no force flag: it re-applies `after` snapshots, and a batch it could clobber would have
// made the batch un-redoable in the first place.

import { z } from "zod";
import { redoBatch } from "@/lib/history/undo";
import { body, handle, parseInput } from "../../respond";

export const dynamic = "force-dynamic";

const Input = z.object({ batch: z.string().min(1) });

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { batch } = parseInput(Input, await body(request));
    return Response.json(await redoBatch(batch));
  });
}
