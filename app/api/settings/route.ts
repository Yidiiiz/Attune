// Owns: reading and replacing settings over HTTP (PROJECT.md §14).
// PUT goes through runBatch like every other write (§1 rule 6), so a settings change is committed,
// listed in the history sheet, and undoable — the same as a task edit.

import { runBatch } from "@/lib/history/batch";
import { updateSettings } from "@/lib/history/actions";
import { SettingsSchema, readSettings, readSettingsResult } from "@/lib/store/settings";
import { body, handle, ok } from "../respond";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handle(async () => {
    const { settings, recoveredFrom } = await readSettingsResult();
    return ok({ settings, recoveredFrom });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return handle(async () => {
    const next = SettingsSchema.parse(await body(request));
    const current = await readSettings();

    // The log records which keys moved, never their values: §11.5 keeps anything key-shaped out of
    // data/, and a settings diff is the easiest place to leak one by accident.
    const changed = Object.keys(next).filter(
      (key) => JSON.stringify((next as Record<string, unknown>)[key]) !==
        JSON.stringify((current as Record<string, unknown>)[key]),
    );
    if (changed.length === 0) return ok({ batch: null, commit: null, unchanged: true });

    const summary = `change ${changed.join(", ")}`;
    const result = await runBatch({
      actor: "user",
      scope: "user",
      summary,
      commitPrefix: "settings",
      meta: { keys: changed },
      actions: [updateSettings(next, summary)],
    });
    return ok({ ...result, changed });
  });
}
