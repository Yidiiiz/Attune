// Owns: reading settings over HTTP. GET only; PUT waits for runBatch in Phase 2, because every
// write goes through the history layer (PROJECT.md §1 rule 6).

import { readSettingsResult } from "@/lib/store/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const { settings, recoveredFrom } = await readSettingsResult();
  return Response.json({ ok: true, settings, recoveredFrom });
}
