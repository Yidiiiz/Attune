// Owns: the browser half of PROJECT.md §16.4's anchoring — turning a rendered message element into
// text with offsets, and turning offsets back into a range and a rectangle. The deciding half is
// pure and lives in `lib/chat/anchoring.ts`; this file is the part that cannot exist without a DOM,
// which is exactly why the two are separate (Decision 30).
//
// **The injected-UI filter is the load-bearing detail.** A message row contains more than the
// message: a branch bar, a `⋯` button, a read-aloud control, and in Stage C the annotation
// highlights themselves. Every one of those has text, and every one of them would land in the
// offsets if the walk did not skip it — so a note anchored at character 40 would drift by the
// length of whatever chrome was mounted above it that day. §16.4 names the filter and this project
// spells it `[data-ui]`, which is the attribute every control here already carries.
//
// Ranges are built by walking the same text nodes in the same order the index walked them, so an
// offset means the same thing in both directions by construction rather than by agreement.
//
// Failure behavior: every function answers null rather than throwing. A message that has been
// re-rendered under a stale offset produces no range, and the caller pins the card to the message
// top with §16.4's "anchor moved" flag — which is the honest outcome, because a note placed on the
// wrong words is worse than a note that says it lost its place.

import type { ElementRegistry } from "./element-registry";
import type { MessageId } from "@/lib/chat/types";

/** Text nodes of a rendered message, in document order, skipping injected UI. */
function textNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const parent = (node as Text).parentElement;
      if (parent === null) return NodeFilter.FILTER_REJECT;
      // `closest` rather than a parent check, because a control's text can be nested inside it —
      // but `closest` walks past `root` as well, and the message row sits inside `data-ui="messages"`
      // and `data-ui="conversation"`. Matching either of those would reject every text node in the
      // message and leave the index empty, which fails as "no anchor ever resolves" rather than as
      // an error. So the match only counts when it is inside the root and is not the root itself.
      const ui = parent.closest("[data-ui]");
      if (ui !== null && ui !== root && root.contains(ui)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node = walker.nextNode();
  while (node !== null) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

export interface TextIndex {
  text: string;
  nodes: Text[];
  /** `starts[i]` is the offset in `text` where `nodes[i]` begins. */
  starts: number[];
}

/** The message's rendered text, with the mapping needed to get back to where it came from. */
export function indexText(root: HTMLElement): TextIndex {
  const nodes = textNodes(root);
  const starts: number[] = [];
  let text = "";
  for (const node of nodes) {
    starts.push(text.length);
    text += node.data;
  }
  return { text, nodes, starts };
}

/** A DOM range covering `[start, end)` of the indexed text, or null if it does not fit. */
export function rangeFromOffsets(index: TextIndex, start: number, end: number): Range | null {
  if (start < 0 || end > index.text.length || end <= start) return null;

  const locate = (offset: number): { node: Text; offset: number } | null => {
    for (let i = index.nodes.length - 1; i >= 0; i -= 1) {
      if (index.starts[i] <= offset) {
        const node = index.nodes[i];
        const within = offset - index.starts[i];
        // An offset exactly at a node's end belongs to that node's end, not the next node's start:
        // a range that starts at the following node would skip a boundary the selection included.
        if (within <= node.data.length) return { node, offset: within };
        return null;
      }
    }
    return null;
  };

  const from = locate(start);
  const to = locate(end);
  if (from === null || to === null) return null;

  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}

/** Where a pointer is, as an offset into the indexed text — a comment's anchor (§16.4). */
export function offsetOfPoint(index: TextIndex, x: number, y: number): number | null {
  const caret = caretFromPoint(x, y);
  if (caret === null) return null;
  const at = index.nodes.indexOf(caret.node);
  if (at === -1) return null;
  return index.starts[at] + Math.min(caret.offset, caret.node.data.length);
}

/**
 * `caretPositionFromPoint` is the standard; `caretRangeFromPoint` is what older Chromium ships.
 * Both are typed loosely here because the DOM lib in this TypeScript version has neither on
 * `Document` in a form that agrees with both engines.
 */
function caretFromPoint(x: number, y: number): { node: Text; offset: number } | null {
  const document_ = document as unknown as {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = document_.caretPositionFromPoint?.(x, y);
  if (position != null && position.offsetNode.nodeType === Node.TEXT_NODE) {
    return { node: position.offsetNode as Text, offset: position.offset };
  }
  const range = document_.caretRangeFromPoint?.(x, y);
  if (range != null && range.startContainer.nodeType === Node.TEXT_NODE) {
    return { node: range.startContainer as Text, offset: range.startOffset };
  }
  return null;
}

/**
 * §16.4: align a card to the **first** line of a multi-line quote, via `getClientRects()[0]`.
 * `getBoundingClientRect` would give the union of every line, whose top is the same but whose box
 * describes a shape the reader does not see as one thing — and whose height would push the next
 * card down by the height of the whole quotation rather than of its first line.
 */
export function firstLineRect(range: Range): DOMRect | null {
  const rects = range.getClientRects();
  return rects.length > 0 ? rects[0] : range.getBoundingClientRect();
}

/** The selection inside one message, as the three fields a note stores (§16.4), or null. */
export function selectionInside(root: HTMLElement): {
  quote: string;
  prefix: string;
  suffix: string;
  charOffset: number;
} | null {
  const selection = window.getSelection();
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const index = indexText(root);
  const start = offsetOfNode(index, range.startContainer as Text, range.startOffset);
  const end = offsetOfNode(index, range.endContainer as Text, range.endOffset);
  if (start === null || end === null || end <= start) return null;

  const CONTEXT = 40;
  return {
    quote: index.text.slice(start, end),
    prefix: index.text.slice(Math.max(0, start - CONTEXT), start),
    suffix: index.text.slice(end, end + CONTEXT),
    charOffset: start,
  };
}

function offsetOfNode(index: TextIndex, node: Node, offset: number): number | null {
  const at = index.nodes.indexOf(node as Text);
  if (at === -1) return null;
  return index.starts[at] + offset;
}

export interface RememberedSelection {
  /**
   * The message the selection was made in, as the registry's key. The row is found by walking up
   * from the selection to the element `MessageRow` registered, so nothing here reads `data-message`
   * — neither its value nor the attribute (AGENTS.md, Conventions; Decision 99).
   */
  messageId: MessageId;
  quote: string;
  prefix: string;
  suffix: string;
  charOffset: number;
}

/**
 * Remember the last selection made inside a message, and keep it after it is gone.
 *
 * This exists because of an ordering nobody can design around: §16.4's annotate action lives in the
 * `⋯` menu, and opening that menu is a click, and a click collapses the selection. So by the time
 * "Annotate selection" runs there is nothing selected to read — reading it at that moment works
 * only when the browser happens not to have cleared it yet, which is exactly the kind of thing that
 * passes in testing and fails for a person. The selection is captured while it exists instead.
 *
 * It deliberately does *not* forget on collapse. A collapsed selection is what the menu click
 * produces, and treating it as "the reader deselected" would throw away the thing being annotated.
 * The memory is replaced by the next real selection and by nothing else.
 *
 * Failure behavior: returns a disposer and nothing else; a caller that never gets a selection gets
 * `null` and refuses the action with a reason, which is the honest outcome.
 */
export function rememberSelection(
  scroller: HTMLElement,
  rows: ElementRegistry<MessageId>,
): {
  get: () => RememberedSelection | null;
  stop: () => void;
} {
  let last: RememberedSelection | null = null;

  const capture = (): void => {
    const selection = window.getSelection();
    if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const owner = rows.owner(range.commonAncestorContainer);
    if (owner === null || !scroller.contains(owner.element)) return;

    const inside = selectionInside(owner.element);
    if (inside === null) return;
    last = { messageId: owner.key, ...inside };
  };

  document.addEventListener("selectionchange", capture);
  return {
    get: () => last,
    stop: () => document.removeEventListener("selectionchange", capture),
  };
}
