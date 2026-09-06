// Owns: the one write layer every task surface uses — Today's list, the calendar's selection
// toolbar, and later Phase 5's preview panel and Phase 8's document view. PROJECT.md Decision 53
// records why this exists at the *second* use rather than the third: what it holds is §13.5
// semantics, not convenience. A hand-copied second version does not stay a copy; it drifts into
// disagreeing about where a failure is shown, which is a correctness divergence.
//
// The rule it encodes, once: a write fired from a menu has no on-screen origin, so it raises a
// toast naming what did not happen and leaves the row as it was; a refused *edit* has one, so the
// message is handed back to the caller to render inline, where the form still holds every character
// that was typed (Decision 50). Nothing is written optimistically — after a success it calls
// `router.refresh()` and lets the server re-derive, so a refusal needs no unwinding.
//
// Kept deliberately narrow, per Decision 53: `send`, the busy id, that routing, and the refresh.
// Anything else accumulating here is hard rule 1 reasserting itself, not this exception widening.

"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/shell/Toast";

/** Error toasts are per click, not per kind, so a second failure is not silently deduped. */
let toastSeq = 0;

export interface Sent {
  /** The message to show, or null when the write succeeded. */
  error: string | null;
  data: Record<string, unknown>;
}

/** One request against an API route, reduced to §14's two shapes. Never throws. */
export async function send(url: string, init: RequestInit = {}): Promise<Sent> {
  try {
    const response = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.ok) return { error: null, data };
    return { error: data.error ?? `${response.status} ${response.statusText}`, data };
  } catch (err) {
    return { error: (err as Error).message, data: {} };
  }
}

/** Raise a toast for a write with no on-screen origin (§13.5). */
export function reportFailure(what: string, message: string): void {
  toastSeq += 1;
  showToast({ id: `write:${toastSeq}`, tone: "error", text: `${what} — ${message}` });
}

/** An informational toast, for something that happened off screen and would otherwise go unseen. */
export function reportNotice(text: string): void {
  toastSeq += 1;
  showToast({ id: `notice:${toastSeq}`, text });
}

export interface TaskWrites {
  /** The id of the task a write is in flight for, or null. Surfaces disable that row with it. */
  busyId: string | null;
  /**
   * A write with no on-screen origin: marks the task busy, toasts `what` on failure, refreshes on
   * success. Returns the response so a caller can read what the route reported.
   */
  run: (id: string, what: string, url: string, init?: RequestInit) => Promise<Sent>;
  /**
   * A write with an on-screen origin — an edit form. Marks the task busy and *returns* the message
   * instead of toasting it, so the caller renders it beside the text that was refused. Null means
   * it succeeded, and the refresh has been asked for.
   */
  submit: (id: string, url: string, init?: RequestInit) => Promise<string | null>;
}

export function useTaskWrites(): TaskWrites {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = useCallback(
    async (id: string, what: string, url: string, init: RequestInit = {}): Promise<Sent> => {
      setBusyId(id);
      const sent = await send(url, init);
      setBusyId(null);
      if (sent.error !== null) reportFailure(what, sent.error);
      else router.refresh();
      return sent;
    },
    [router],
  );

  const submit = useCallback(
    async (id: string, url: string, init: RequestInit = {}): Promise<string | null> => {
      setBusyId(id);
      const sent = await send(url, init);
      setBusyId(null);
      if (sent.error !== null) return sent.error;
      router.refresh();
      return null;
    },
    [router],
  );

  return { busyId, run, submit };
}
