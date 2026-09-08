// Owns: starting an annotation — PROJECT.md §16.4's step before a card exists. It is the one part
// of annotations that has to reach into the *conversation's* DOM rather than the gutter's, which is
// why it lives beside `ChatView` rather than inside `AnnotationPane`.
//
// **The selection is remembered rather than read on demand**, and that is the whole reason this is
// a hook with state instead of two lines in a click handler. §16.4 puts "annotate" in the `⋯` menu;
// opening a menu is a click; a click collapses the selection. Reading the selection when the menu
// entry fires therefore works only when the browser has not got round to clearing it — which passes
// in testing and fails for a person. `rememberSelection` captures it while it exists.
//
// Failure behavior: both refusals are toasts, because a row menu has no on-screen origin (§13.5),
// and both name a remedy the reader can act on — select something, or make room. Refusing is the
// point: accepting the action and drawing nothing would be §16.4's silent failure in a new place.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reportFailure } from "@/components/tasks/writes";
import { rememberSelection } from "./anchoring-dom";
import type { RememberedSelection } from "./anchoring-dom";
import type { Draft } from "./Gutter";
import type { Message } from "@/lib/chat/types";

export function useAnnotationDraft(
  scroller: HTMLElement | null,
  roomForGutter: boolean,
): { draft: Draft | null; clear: () => void; annotate: (message: Message) => void } {
  const [draft, setDraft] = useState<Draft | null>(null);
  const memory = useRef<{ get: () => RememberedSelection | null } | null>(null);

  useEffect(() => {
    if (scroller === null) return;
    const remembered = rememberSelection(scroller);
    memory.current = remembered;
    return () => {
      memory.current = null;
      remembered.stop();
    };
  }, [scroller]);

  const annotate = useCallback(
    (message: Message): void => {
      const element =
        scroller?.querySelector<HTMLElement>(`[data-message='${CSS.escape(message.id)}']`) ?? null;
      const remembered = memory.current?.get() ?? null;
      // A selection remembered from a different message is not this message's selection.
      const chosen = remembered?.messageId === message.id ? remembered : null;

      if (element === null || chosen === null) {
        reportFailure("There is nothing to annotate", "Select some text in the message first.");
        return;
      }
      // The composer lives in the gutter, so with no room for one there is nowhere to open it. The
      // remedy is the reader's (Decision 66) — the same one the hidden count names.
      if (!roomForGutter) {
        reportFailure("There is no room for notes", "Widen the window, or collapse the left panel.");
        return;
      }

      const { messageId: _target, ...anchor } = chosen;
      setDraft({ targetMessageId: message.id, top: element.offsetTop, ...anchor });
    },
    [scroller, roomForGutter],
  );

  return { draft, clear: () => setDraft(null), annotate };
}
