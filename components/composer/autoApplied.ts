// Owns: what the client says about §6.3's auto-applied write, and its Undo — once, for both places
// it is said. The toast is the notification; the transcript marker (`components/chat/AppliedMarker`)
// is the record. They share these words and this Undo so they cannot come to disagree about what
// happened or what undoing it means.
//
// Failure behavior: an undo the log refuses — a later change touched the same file — is reported,
// never forced. Forcing it would put the whole file back as it was before this write, taking every
// later change to it along, and a button beside one small append is no place to decide that.

"use client";

import { showToast } from "@/components/shell/Toast";
import { reportFailure, reportNotice, send } from "@/components/tasks/writes";
import type { AutoApplied } from "@/lib/chat/types";

const fileOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** The one sentence both the toast and the marker say. */
export const describeApplied = (applied: AutoApplied): string =>
  `Remembered in ${fileOf(applied.path)} — ${applied.lines} line${applied.lines === 1 ? "" : "s"} added`;

/** Undo the write's batch. Null when it was undone, otherwise why not. */
export async function undoApplied(applied: AutoApplied): Promise<string | null> {
  // The route answers a refusal 200 with `ok: false` (§7.2), so the body decides, not the status.
  const answer = await send("/api/history/undo", { method: "POST", body: JSON.stringify({ batch: applied.batch }) });
  if (answer.data.ok === true) return null;
  if (Array.isArray(answer.data.conflict)) {
    return `${fileOf(applied.path)} has changed since, so this cannot be undone on its own`;
  }
  return typeof answer.data.reason === "string" ? answer.data.reason : answer.error ?? "the undo did not happen";
}

/** The toast with its Undo. `onUndone` re-reads whatever shows the marker, so the marker goes too. */
export function announceApplied(applied: AutoApplied, onUndone: () => void): void {
  showToast({
    id: `applied:${applied.batch}`,
    text: describeApplied(applied),
    action: {
      label: "Undo",
      run: () => {
        void undoApplied(applied).then((problem) => {
          // The toast is gone by now, so a refusal has no on-screen origin left (§13.5).
          if (problem !== null) {
            reportFailure("Not undone", problem);
            return;
          }
          reportNotice(`Undone — ${fileOf(applied.path)} is as it was`);
          onUndone();
        });
      },
    },
  });
}
