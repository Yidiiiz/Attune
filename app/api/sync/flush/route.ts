// Owns: the beforeunload flush (PROJECT.md §8). Called with navigator.sendBeacon, so it must stay
// cheap and must never depend on a response being read.

import { flush } from "@/lib/history/git";
import { handle, ok } from "../../respond";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return handle(async () => ok({ ...(await flush()) }));
}
