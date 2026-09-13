// Owns: what the client says about §6.3's auto-applied write, and its Undo. The toast is the
// notification; the marker under the reply (`components/chat/AppliedMarker`) is the record and the
// one place with Undo, in the chat transcript and under the sheet's Ask answer alike. Toasts carry no
// buttons (Decision 84): at some window widths any button in one lands on the chat's Send, and an
// Undo there turned a Send click into an undo. Both say the same sentence, from here.
//
// Failure behavior: an undo the log refuses — a later change touched the same file — is reported,
// never forced. Forcing it would put the whole file back as it was before this write, taking every
// later change to it along, and a button beside one small append is no place to decide that.

"use client";

import { showToast } from "@/components/shell/Toast";
import { send } from "@/components/tasks/writes";
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

/** The toast: the sentence, and where Undo is. */
export function announceApplied(applied: AutoApplied): void {
  showToast({ id: `applied:${applied.batch}`, text: `${describeApplied(applied)}. Undo is under the reply.` });
}
