// Owns: PROJECT.md §16.4 as one mounted thing — the placement pass, the four writes, and the
// gutter they feed. Split out of `ChatView` along the section boundary the spec already draws:
// §16.2 is the conversation and its branches, §16.4 is the marginalia beside it, and the only
// things that cross between them are a width, a scroller, and a draft.
//
// The draft is `ChatView`'s rather than this component's, and that is the one deliberate exception.
// A draft begins with a selection inside a *message*, which is the conversation's DOM; the pane
// would have to reach into it to start one. Handing the finished selection across keeps each side
// reading only its own elements.
//
// Failure behavior: mounted inside `FeatureBoundary` by its caller (§16.7), so a throw in placement
// unmounts the annotations and leaves the conversation readable. The writes route their own
// failures per §13.5 — the composer's inline, the cards' to a toast — in `useAnnotationWrites`.

"use client";

import Gutter from "./Gutter";
import type { Draft } from "./Gutter";
import { useAnnotations } from "./useAnnotations";
import { useAnnotationWrites } from "./useAnnotationWrites";
import { scrollMessageIntoView } from "./useSidebar";
import type { ElementRegistry } from "./element-registry";
import type { AnnotationGroups } from "@/lib/chat/annotations";
import type { MessageId } from "@/lib/chat/types";

export interface AnnotationPaneProps {
  conversationId: string;
  groups: AnnotationGroups;
  scroller: HTMLElement | null;
  /** The view's message rows by id, which is how a card finds the row it belongs beside. */
  rows: ElementRegistry<MessageId>;
  width: number;
  /** Bumped by the caller when the conversation re-rendered, so placement re-runs. */
  revision: number;
  draft: Draft | null;
  onDraftDone: () => void;
  reload: (id: string) => Promise<unknown>;
}

export default function AnnotationPane({
  conversationId,
  groups,
  scroller,
  rows,
  width,
  revision,
  draft,
  onDraftDone,
  reload,
}: AnnotationPaneProps) {
  const { placed, measure } = useAnnotations({ scroller, rows, onPath: groups.onPath, revision });
  const annotations = useAnnotationWrites(conversationId, reload);

  return (
    <Gutter
      width={width}
      placed={placed}
      unanchored={groups.unanchored}
      removed={groups.removed}
      draft={draft}
      onMeasure={measure}
      onSaveDraft={async (text) => {
        if (draft === null) return "The note lost its place.";
        const failure = await annotations.create({ ...draft, text });
        if (failure === null) onDraftDone();
        return failure;
      }}
      onCancelDraft={onDraftDone}
      onToggleContext={(annotation) => void annotations.toggleContext(annotation)}
      onRemove={(annotation) => void annotations.remove(annotation)}
      onRestore={(annotation) => void annotations.restore(annotation)}
      onGoTo={(annotation) => scrollMessageIntoView(rows, annotation.targetMessageId)}
    />
  );
}
