// Owns: reading the action log back as batches, newest first, with the §7.5 filters.
// `chat.update` is not hidden here — that is the history sheet's default, and a filter the server
// applied silently would make the sheet's "show everything" impossible.

import { groupBatches, readActions } from "@/lib/history/log";
import { findConflicts, undoState } from "@/lib/history/undo";
import { handle, ok } from "../respond";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const type = url.searchParams.get("type");
    const before = url.searchParams.get("before");
    const limit = Number(url.searchParams.get("limit") ?? "50");

    const all = groupBatches(await readActions());
    let batches = [...all].reverse();

    if (scope) batches = batches.filter((batch) => batch.scope === scope);
    if (type) batches = batches.filter((batch) => batch.type === type);
    if (before) {
      const at = batches.findIndex((batch) => batch.batch === before);
      if (at >= 0) batches = batches.slice(at + 1);
    }

    const page = batches.slice(0, Number.isFinite(limit) ? Math.max(1, limit) : 50).map((batch) => ({
      ...batch,
      state: undoState(all, batch.batch),
      conflict: findConflicts(all, batch.batch),
    }));

    return ok({ batches: page, more: batches.length > page.length });
  });
}
