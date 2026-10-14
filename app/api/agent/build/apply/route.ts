// Owns: the reviewed diff's Commit gate. Failure behavior: stale/failed sessions refuse inline.
import { z } from "zod";
import { commitBuild } from "@/lib/agent/build";
import { body, handle, ok, parseInput } from "../../../respond";
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  return handle(async () => { const { id } = parseInput(z.object({ id: z.string().uuid() }).strict(), await body(request)); return ok({ state: await commitBuild(id) }); });
}
