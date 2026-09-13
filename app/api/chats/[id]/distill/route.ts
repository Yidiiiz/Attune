// Owns: `POST /api/chats/[id]/distill` (PROJECT.md §14) — a session summary *proposal* for one
// conversation. It returns the proposal and writes nothing; the tray's Add sends it to
// `/api/agent/apply` like any other knowledge write.
//
// Failure behavior: a conversation that is not there is a 404 from the store; an empty one is a 400;
// a provider failure carries its `AgentError` code, so the client routes it per §13.5.

import { distillConversation } from "@/lib/agent/distill";
import { readSettings } from "@/lib/store/settings";
import { handle, ok } from "../../../respond";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    const effort = (await readSettings()).models.default.effort;
    const proposal = await distillConversation(id, {
      ...(effort === undefined ? {} : { effort }),
      signal: request.signal,
    });
    return ok({ proposal });
  });
}
