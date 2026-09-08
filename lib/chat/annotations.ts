// Owns: PROJECT.md §16.4's four fates of an annotation, decided from the tree rather than from the
// DOM. Everything here is pure so the counts the conversation header promises can be tested without
// a browser; the placement half — where a card sits, and what it does when two want the same y —
// is `components/chat/useAnnotations.ts`.
//
// **The rule underneath all four is that silent is not acceptable.** §16.4 says so about off-path
// annotations, Decision 66 repeats it about a hidden gutter, and it is why this function returns
// four lists rather than one list of things to draw: an annotation the reader cannot see must still
// be counted somewhere they can. So nothing is filtered away here. Every annotation given to this
// function comes back in exactly one of the four.
//
// Failure behavior: pure, total, and never throws. An annotation naming a message that does not
// exist is `unanchored` rather than dropped — the case §16.4 built a tray for.

import type { Annotation, MessageId } from "./types.ts";
import type { Tree } from "./tree.ts";

export interface AnnotationGroups {
  /** Drawn in the gutter: the target is a live message on the active path. */
  onPath: Annotation[];
  /** Counted in the header as "N notes on other branches"; clicking one switches to it. */
  offPath: Annotation[];
  /** The Unanchored tray: the target message is gone, or was deleted (§16.4). */
  unanchored: Annotation[];
  /** Soft-deleted, and therefore in the restore tray at the bottom of the gutter. */
  removed: Annotation[];
}

export function groupAnnotations(
  annotations: Annotation[],
  tree: Tree,
  path: MessageId[],
): AnnotationGroups {
  const onPathIds = new Set(path);
  const groups: AnnotationGroups = { onPath: [], offPath: [], unanchored: [], removed: [] };

  for (const annotation of annotations) {
    // Checked first, and deliberately: a removed annotation is in the restore tray whatever became
    // of its target. Sorting it by its target instead would put a note the reader deleted into the
    // Unanchored tray, which reads as a fault rather than as something they did.
    if (annotation.deleted) {
      groups.removed.push(annotation);
      continue;
    }

    const target = tree.nodes.get(annotation.targetMessageId);
    if (target === undefined || target.deleted) {
      groups.unanchored.push(annotation);
      continue;
    }

    if (onPathIds.has(annotation.targetMessageId)) groups.onPath.push(annotation);
    else groups.offPath.push(annotation);
  }

  return groups;
}

