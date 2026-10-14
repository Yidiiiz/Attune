// Owns: rejecting a plan or reverting its captured diff. Failure behavior: preserve stale edits.
import { z } from "zod";
import { revertBuild } from "@/lib/agent/build";
import { body, handle, ok, parseInput } from "../../../respond";
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  return handle(async () => { const { id } = parseInput(z.object({ id: z.string().uuid() }).strict(), await body(request)); return ok({ state: await revertBuild(id) }); });
}
