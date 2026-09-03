// Owns: what the sync indicator in the shell reads (PROJECT.md §8, §14).

import { status } from "@/lib/history/git";
import { handle, ok } from "../../respond";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handle(async () => ok({ ...(await status()) }));
}
