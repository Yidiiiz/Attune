// Owns: generated theme preview (§11.3). Failure behavior: validates without saving anything.
import { z } from "zod";
import { proposeTheme } from "@/lib/agent/theme";
import { body, handle, ok, parseInput } from "../../respond";
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { prompt } = parseInput(z.object({ prompt: z.string().trim().min(1).max(4000) }).strict(), await body(request));
    return ok({ tokens: await proposeTheme(prompt, request.signal) });
  });
}
