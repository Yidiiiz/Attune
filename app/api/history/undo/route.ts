// Owns: undoing one batch over HTTP (PROJECT.md §7.2, §14).
// A refused undo is a 200 with `ok: false` and the conflicting batch ids, not an HTTP error: the
// UI's job here is to show a warning and an "Undo anyway" button, which needs the ids.

import { z } from "zod";
import { undoBatch } from "@/lib/history/undo";
import { body, handle, parseInput } from "../../respond";

export const dynamic = "force-dynamic";

const Input = z.object({ batch: z.string().min(1), force: z.boolean().default(false) });

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { batch, force } = parseInput(Input, await body(request));
    return Response.json(await undoBatch(batch, { force }));
  });
}
