// Owns: the Sync now button (PROJECT.md §8). Same work as the flush; a separate route because the
// two have different callers and one of them is a beacon that cannot show an error.

import { flush } from "@/lib/history/git";
import { handle, ok } from "../../respond";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return handle(async () => ok({ ...(await flush()) }));
}
