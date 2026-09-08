// Owns: the four writes PROJECT.md §16.4 asks for — create, include-in-context, remove, restore —
// and nothing else. Separated from `useConversation` because it is a different section of the spec
// and because that file is at 284 lines with a message turn in it; separated from `ChatView`
// because a view that owns four `fetch` shapes is a view that will grow a fifth.
//
// Every one of them re-reads the conversation afterwards rather than patching local state. Nothing
// on screen is a local guess (the rule `ChatView` already follows), and an annotation is cheap to
// re-read: it is a handful of small files that were already being parsed for the render.
//
// **Removal is `deleted: true`, never a `DELETE`.** §16.4 wants a restore tray, so removal has to
// be reversible from the record rather than from the history log — and restore is then the same
// call with the flag the other way. The route has one verb for exactly this reason.
//
// Failure behavior: §13.5's split, applied per control. Creating a note has an on-screen origin —
// the composer the reader is typing in — so its failure is returned for the composer to show with
// the text still in it (Decision 50). The card controls do not; a toast names what did not happen
// and the card stays as it was, because nothing was written optimistically.

"use client";

import { useCallback } from "react";
import { reportFailure, send as post } from "@/components/tasks/writes";
import type { Annotation } from "@/lib/chat/types";

export interface NewAnnotation {
  targetMessageId: string;
  quote: string;
  prefix: string;
  suffix: string;
  charOffset: number;
  text: string;
}

export interface AnnotationWrites {
  /** Returns a failure message for the composer to show, or null on success. */
  create: (draft: NewAnnotation) => Promise<string | null>;
  toggleContext: (annotation: Annotation) => Promise<void>;
  remove: (annotation: Annotation) => Promise<void>;
  restore: (annotation: Annotation) => Promise<void>;
}

export function useAnnotationWrites(
  conversationId: string,
  reload: (id: string) => Promise<unknown>,
): AnnotationWrites {
  const put = useCallback(
    async (annotation: Annotation, changes: Record<string, unknown>, what: string): Promise<void> => {
      const answer = await post(`/api/chats/${conversationId}/annotations/${annotation.id}`, {
        method: "PUT",
        body: JSON.stringify(changes),
      });
      if (answer.error !== null) {
        reportFailure(what, answer.error);
        return;
      }
      await reload(conversationId);
    },
    [conversationId, reload],
  );

  const create = useCallback(
    async (draft: NewAnnotation): Promise<string | null> => {
      const answer = await post(`/api/chats/${conversationId}/annotations`, {
        method: "POST",
        body: JSON.stringify({ kind: "note", ...draft }),
      });
      if (answer.error !== null) return answer.error;
      await reload(conversationId);
      return null;
    },
    [conversationId, reload],
  );

  return {
    create,
    toggleContext: (annotation) =>
      put(
        annotation,
        { includeInContext: !annotation.includeInContext },
        annotation.includeInContext ? "The note was not excluded" : "The note was not included",
      ),
    remove: (annotation) => put(annotation, { deleted: true }, "The note was not removed"),
    restore: (annotation) => put(annotation, { deleted: false }, "The note was not restored"),
  };
}
