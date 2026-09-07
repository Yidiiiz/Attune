// Owns: one Tasks-mode turn with no conversation behind it (PROJECT.md §14, §9.4) — the request
// the composer makes when someone types into the sheet and presses Enter, and again for each
// follow-up that revises what came back.
//
// Ask mode does not come here. It needs a conversation, which is `lib/store/chats.ts` and Phase 6;
// the sheet refuses an Ask send inline and makes no request at all.
//
// Failure behavior: the model and effort come from `settings.models.extract` (§11.4) and nothing
// here hardcodes either. A missing or rejected key leaves as `AgentError("auth")` → 401, which
// §13.5 sends to a toast because the fix is on the Settings screen; anything else the model does
// is 502 and belongs inline in the sheet, beside the text that is still sitting in the box.

import { z } from "zod";
import { runExtract } from "@/lib/agent/chat";
import { assembleContext } from "@/lib/agent/context";
import { ModelTaskDraft } from "@/lib/agent/tools";
import { readSettings } from "@/lib/store/settings";
import { body, handle, ok } from "../../respond";

export const dynamic = "force-dynamic";

const Input = z.object({
  prompt: z.string().min(1),
  /** §9.5 steps 2 and 4: the answer to a question, or an instruction that revises the preview. */
  followUp: z.string().optional(),
  /** The cards on screen, inline edits included, so a revision starts from what the user sees. */
  draft: z.array(ModelTaskDraft).optional(),
  /** Where the composer was opened from, which decides the view block of the context (§13.1). */
  viewDate: z.string().optional(),
  taskIds: z.array(z.string()).optional(),
});

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const input = Input.parse(await body(request));
    const settings = await readSettings();
    const { model, effort } = settings.models.extract;

    const { system } = await assembleContext({
      mode: "tasks",
      ...(input.viewDate === undefined ? {} : { viewDate: input.viewDate }),
      ...(input.taskIds === undefined ? {} : { taskIds: input.taskIds }),
    });

    const result = await runExtract({
      prompt: input.prompt,
      ...(input.followUp === undefined ? {} : { followUp: input.followUp }),
      ...(input.draft === undefined ? {} : { draft: input.draft }),
      system,
      model,
      ...(effort === undefined ? {} : { effort }),
      signal: request.signal,
    });

    return ok({ result, model });
  });
}
