// Owns: the branch alternatives at one point in the path — PROJECT.md §16.2's "switching = pick a
// sibling, `latestLeafUnder`, `PATCH activeLeafId`", reduced to the control that does the picking.
//
// It appears only where there is something to pick: a message with one sibling is not a fork, and a
// bar reading `1/1` on every row would be noise on a conversation that has never branched. What it
// shows is position rather than identity — `2/3` — because the branches have no names and inventing
// them would be a branch entity, which §16.2 spends its whole first paragraph not having.
//
// Failure behavior: none of its own. It calls back with a sibling's id and the switch is somebody
// else's write; the arrows disable at the ends rather than wrapping, so a click always moves in the
// direction it points or does nothing at all.

"use client";

import type { Message } from "@/lib/chat/types";
import styles from "./Chat.module.css";

export interface BranchBarProps {
  /** The children of this message's parent, in `siblingsOf` order. */
  siblings: Message[];
  currentId: string;
  onSwitch: (id: string) => void;
}

export default function BranchBar({ siblings, currentId, onSwitch }: BranchBarProps) {
  if (siblings.length < 2) return null;

  const at = siblings.findIndex((sibling) => sibling.id === currentId);
  if (at === -1) return null;

  const go = (delta: number): void => {
    const target = siblings[at + delta];
    if (target !== undefined) onSwitch(target.id);
  };

  return (
    <div className={styles.branchBar} data-ui="branches">
      <button
        type="button"
        className={styles.branchArrow}
        aria-label="Previous branch"
        data-ui="branch-prev"
        disabled={at === 0}
        onClick={() => go(-1)}
      >
        ‹
      </button>
      <span className={styles.branchPosition} data-ui="branch-position">
        {at + 1}/{siblings.length}
      </span>
      <button
        type="button"
        className={styles.branchArrow}
        aria-label="Next branch"
        data-ui="branch-next"
        disabled={at === siblings.length - 1}
        onClick={() => go(1)}
      >
        ›
      </button>
    </div>
  );
}
