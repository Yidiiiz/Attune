// Owns: the receiving end of a message typed under a document (PROJECT.md §10.2, the Phase 8
// approval's open call 3). The document view stores the text and navigates here with `&ask=1`; this
// takes it, drops the flag from the address, and sends it in this conversation.
//
// **Nothing here is allowed to lose the text**, which is the condition the approval attached to the
// whole handover. There are exactly two ways it could: the entry is not there when the marker says
// it should be — a reload after it was taken, or storage that refused the write — and that becomes
// a message above the composer; or the send itself is refused, and then the text goes back into the
// composer with the reason, which is where a refused send leaves it everywhere else (Decision 50).
//
// The once-per-request guard is `useDistill`'s, for the same two reasons: React runs effects twice
// in development, and the view is keyed by conversation, so a once-per-mount flag would still be set
// the next time the flag arrived in the address.
//
// Failure behavior: as above — every path ends with the text on screen and a reason beside it.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { takeHandover } from "@/components/browser/handover";

export interface HandoverHandlers {
  /** The send was refused: the reason, and the text to put back in the box. */
  onProblem: (message: string, text: string) => void;
  /** The marker was in the address and there was nothing to take. */
  onMissing: (message: string) => void;
}

export function useHandover(
  conversationId: string,
  requested: boolean,
  send: (text: string, options: { attachments: string[] }) => Promise<string | null>,
  handlers: HandoverHandlers,
): void {
  const router = useRouter();
  const taken = useRef(false);
  // The handlers change identity on every render of the view; the effect must run on the flag, not
  // on them, so they are read through a ref rather than depended on.
  const latest = useRef(handlers);
  latest.current = handlers;
  const sender = useRef(send);
  sender.current = send;

  // **The turn may not start during the mount cycle.** `useConversation` aborts its request when the
  // view unmounts, which is what stops a stream leaking on navigate-away (§16.8) — and React's
  // development remount runs that cleanup once on the way in. A send started in a mount effect is
  // therefore aborted before it leaves: the first run of this check found the reply stuck at
  // `streaming`, no `POST /api/chats/<id>/messages` in the server log at all, and `settle()`'s
  // re-read in it, which `send` runs only on the abort path. Waiting a render puts the send after
  // that cleanup, in development and in production alike, and it is a state change rather than a
  // timer — the thing being waited for is a render, and that is what renders announce.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!requested) {
      taken.current = false;
      return;
    }
    if (!mounted || taken.current) return;
    taken.current = true;
    router.replace(`/chat?c=${conversationId}`);

    const handover = takeHandover(conversationId);
    if (handover === null) {
      latest.current.onMissing(
        "What you typed under the document did not make it here, so nothing was sent. Type it again.",
      );
      return;
    }
    void sender.current(handover.text, { attachments: handover.attachments }).then((problem) => {
      if (problem !== null) latest.current.onProblem(problem, handover.text);
    });
  }, [conversationId, mounted, requested, router]);
}
