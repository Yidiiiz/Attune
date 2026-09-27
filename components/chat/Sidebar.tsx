// Owns: PROJECT.md §16.5's conversation sidebar — the active path as a list of exchanges, with the
// branch points on it opened up in place.
//
// Everything it renders is `buildPairs(activePath())` recomputed on every render, and nothing is
// stored (§16.5). That is not an optimisation left undone: a stored outline is a second copy of the
// tree that has to be invalidated, and the whole of §16.1 exists to avoid keeping a second copy of
// anything.
//
// **A branch point becomes a section rather than a row.** A pair whose prompt has siblings shows
// its own number — "2 of 3" — and beneath it the *other* branches only, each with the number it
// really has in sibling order, first two shown and the rest behind "N more". Listing the current
// branch among its own alternatives would make the reader find themselves in a list of places they
// could go, and the numbers are absolute because a branch that renumbers when you switch to it is
// not a landmark.
//
// The strip (36 px) is the same list with the words removed: one mark per exchange, the current one
// filled, branch points wider. §16.5 chooses between the two from available width alone, so the
// strip is what a narrow window gets, not what a long conversation gets.
//
// Failure behavior: a click that cannot find its target scrolls nowhere and changes nothing. This
// component is mounted inside `FeatureBoundary`, so a throw here costs the sidebar and leaves the
// conversation readable — which is the point of it having its own boundary (§16.7).

"use client";

import { useState } from "react";
import type { ElementRegistry } from "./element-registry";
import type { Message } from "@/lib/chat/types";
import type { Pair, Tree } from "@/lib/chat/tree";
import { siblingsOf } from "@/lib/chat/tree";
import styles from "./Chat.module.css";

export interface SidebarProps {
  pairs: Pair[];
  tree: Tree;
  /** The prompt id of the exchange being read (§16.5), or null before anything has laid out. */
  current: string | null;
  strip: boolean;
  /** Jump the message scroller to this message. */
  onGoTo: (id: string) => void;
  /** Switch to a sibling branch, which moves `activeLeafId` (§16.2). */
  onSwitch: (id: string) => void;
  /**
   * The view's registry of sidebar entries, keyed by prompt id. Auto-centring has to measure the
   * current entry, and it asks the registry rather than the DOM: `data-pair` is a test hook and an
   * app selector on one is a read of it (Decision 99, `components/data-hooks.test.ts`).
   */
  entries: ElementRegistry<string>;
}

/** §16.5 shows two alternatives and hides the rest; more than that is a list, not a signpost. */
const SHOWN = 2;

/** One line of a prompt, short enough to scan. Replies are never titles: the question is. */
function label(message: Message): string {
  const line = message.text.trim().split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.length > 0 ? line : "(empty)";
}

function Branches({
  siblings,
  currentId,
  onSwitch,
}: {
  siblings: Message[];
  currentId: string;
  onSwitch: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Numbers are 1-based positions in the *whole* sibling set, kept even though the current branch
  // is filtered out of the list — so "1" and "3" can appear with nothing between them, which is
  // exactly what it means to be looking at 2.
  const others = siblings
    .map((message, index) => ({ message, number: index + 1 }))
    .filter((entry) => entry.message.id !== currentId);
  const visible = expanded ? others : others.slice(0, SHOWN);
  const hidden = others.length - visible.length;

  return (
    <div className={styles.sideBranches}>
      {visible.map(({ message, number }) => (
        <button
          key={message.id}
          type="button"
          className={styles.sideBranch}
          data-ui="sidebar-branch"
          onClick={() => onSwitch(message.id)}
          title={label(message)}
        >
          <span className={styles.sideBranchNumber}>{number}</span>
          <span className={styles.sideBranchText}>{label(message)}</span>
        </button>
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          className={styles.sideMore}
          data-ui="sidebar-more"
          onClick={() => setExpanded(true)}
        >
          {hidden} more
        </button>
      ) : null}
    </div>
  );
}

export default function Sidebar({
  pairs,
  tree,
  current,
  strip,
  onGoTo,
  onSwitch,
  entries,
}: SidebarProps) {
  if (strip) {
    return (
      <ol className={styles.strip} data-ui="sidebar-strip">
        {pairs.map((pair) => {
          const forked = siblingsOf(tree, pair.prompt.id).length > 1;
          return (
            <li key={pair.prompt.id}>
              <button
                ref={entries.ref(pair.prompt.id)}
                type="button"
                className={`${styles.stripMark} ${forked ? styles.stripForked : ""}`}
                data-pair={pair.prompt.id}
                aria-current={pair.prompt.id === current ? "true" : undefined}
                title={label(pair.prompt)}
                onClick={() => onGoTo(pair.prompt.id)}
              >
                <span className={styles.srOnly}>{label(pair.prompt)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className={styles.sideList} data-ui="sidebar-list">
      {pairs.map((pair, index) => {
        const siblings = siblingsOf(tree, pair.prompt.id);
        const forked = siblings.length > 1;
        const position = forked
          ? siblings.findIndex((sibling) => sibling.id === pair.prompt.id) + 1
          : 0;

        return (
          <li
            key={pair.prompt.id}
            ref={entries.ref(pair.prompt.id)}
            className={forked ? styles.sideSection : styles.sideItem}
            data-pair={pair.prompt.id}
          >
            <button
              type="button"
              className={styles.sideRow}
              data-ui="sidebar-entry"
              aria-current={pair.prompt.id === current ? "true" : undefined}
              onClick={() => onGoTo(pair.prompt.id)}
            >
              <span className={styles.sideIndex}>{index + 1}</span>
              <span className={styles.sideText}>{label(pair.prompt)}</span>
              {forked ? (
                <span className={styles.sideBadge} data-ui="sidebar-branch-of">
                  {position} of {siblings.length}
                </span>
              ) : null}
            </button>
            {forked ? (
              <Branches siblings={siblings} currentId={pair.prompt.id} onSwitch={onSwitch} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
