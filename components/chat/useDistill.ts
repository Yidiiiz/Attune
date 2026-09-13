// Owns: "Distill to knowledge" as the conversation view runs it (Decision 18). The Chats menu opens
// the conversation with `?distill=1`; this asks the server for the summary once, drops the flag from
// the address so a reload does not ask again, and hands the proposal to the conversation's tray.
//
// Failure behavior: §13.5's routing. A key or provider problem toasts, because its remedy is the
// Settings screen; anything else — an empty conversation — is the tray's error, where the summary
// would have been.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { reportFailure, send } from "@/components/tasks/writes";
import type { Proposal } from "@/lib/agent/tools";
import type { Tray } from "@/components/composer/useProposals";

/** "Summarizing…" while the request is out, then null. */
export function useDistill(conversationId: string, requested: boolean, tray: Tray): string | null {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  // Once per mount, including React's development double-run of effects: a second request is a
  // second model call and a second card.
  const asked = useRef(false);

  useEffect(() => {
    if (!requested || asked.current) return;
    asked.current = true;
    router.replace(`/chat?c=${conversationId}`);
    setStatus("Summarizing this conversation…");
    void send(`/api/chats/${conversationId}/distill`, { method: "POST" }).then((answer) => {
      setStatus(null);
      if (answer.error === null) {
        tray.receive(answer.data.proposal as Proposal);
        return;
      }
      const code = typeof answer.data.code === "string" ? answer.data.code : "";
      if (code === "auth" || code === "provider") reportFailure("The conversation was not distilled", answer.error);
      else tray.setError(answer.error);
    });
  }, [conversationId, requested, router, tray]);

  return status;
}
