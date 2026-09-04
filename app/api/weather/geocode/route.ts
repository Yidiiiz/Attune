// Owns: turning a place name into coordinates (PROJECT.md §14, §11.1). Forward only — Open-Meteo
// has no reverse endpoint, which is why "Use my location" sets the label itself (Decision 51).
//
// Failure behavior: an unreachable service is an empty result list, not an error status. The
// Settings field and the first-run card both say "nothing matched" for either case, because from
// the person typing, they are the same case.

import { geocode } from "@/lib/weather";
import { StoreError } from "@/lib/store/paths";
import { handle, ok } from "../../respond";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    if (query.trim() === "") throw new StoreError("invalid", "q is required");
    return ok({ results: await geocode(query) });
  });
}
