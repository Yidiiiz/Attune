// Owns: which body line each checkbox the document view draws came from, and whether any of them may
// be clicked (PROJECT.md §10.2, Decision 86; the Phase 8 approval's checkbox condition).
//
// A rendered checkbox does not know its line, and the app may not read one from a `data-*` attribute
// (AGENTS.md Conventions). So the lines come from `marked`'s own lexer, over the same stashed text the
// view renders, and the math stash is counted back out so a display block over several lines does not
// shift everything after it. The nth box drawn is the nth task item the lexer found. That holds only
// while the two agree, so **every box stays disabled, with the reason shown, whenever they might not**:
//   - the page drew a different number of boxes than the lexer found task items (raw HTML can draw an
//     `<input>` of its own, for one);
//   - a drawn box's ticked state is not its line's;
//   - a task item's line is not one `lib/knowledge/checkbox.ts` says a click can flip — a box inside
//     a quote, say, which the server would refuse anyway.
// A click then carries the line and its text, and the server refuses it if the line has changed since.
//
// Pure and synchronous: no DOM, so the node tests hold the whole of it.
//
// Failure behavior: none thrown. Anything it cannot map is a reason to disable, never a guess.

import { marked } from "marked";
import type { Token, Tokens } from "marked";
import { checkboxState } from "@/lib/knowledge/checkbox";
import { MARK, stashMath } from "./pipeline.ts";

export interface TaskLine {
  /** The body line, counted from zero — what the toggle route takes as `line`. */
  line: number;
  /** That line as it is in the body — what the route takes as `expected`. */
  text: string;
}

export type CheckboxPlan = { clickable: true; lines: TaskLine[] } | { clickable: false; reason: string };

function* taskItems(tokens: Token[]): Generator<Tokens.ListItem> {
  for (const token of tokens) {
    if (token.type === "list") {
      for (const item of (token as Tokens.List).items) {
        if (item.task) yield item;
        yield* taskItems(item.tokens);
      }
    } else if ("tokens" in token && Array.isArray(token.tokens)) {
      yield* taskItems(token.tokens);
    }
  }
}

/**
 * The task items in `body`, in the order they are drawn, each with the body line it starts on. Null
 * when the lexer's text and the body cannot be lined up at all.
 */
export function taskLines(body: string): TaskLine[] | null {
  const source = body.replace(/\r\n?/g, "\n");
  const { text, math } = stashMath(source);
  const tokens = marked.lexer(text, { gfm: true });
  if (tokens.map((token) => token.raw).join("") !== text) return null;

  const stashedLines = text.split("\n");
  const bodyLines = source.split("\n");
  // How many source lines each stashed line stands for, beyond itself: a placeholder for a display
  // block over k+1 lines stands in for k extra.
  const extra = stashedLines.map((line) => {
    let count = 0;
    for (const match of line.matchAll(new RegExp(`${MARK}(\\d+)${MARK}`, "g"))) {
      count += (math[Number(match[1])]?.raw.match(/\n/g) ?? []).length;
    }
    return count;
  });
  const toSource = (stashedLine: number): number =>
    stashedLine + extra.slice(0, stashedLine).reduce((sum, n) => sum + n, 0);

  const found: TaskLine[] = [];
  let offset = 0;
  for (const token of tokens) {
    const first = text.slice(0, offset).split("\n").length - 1;
    const last = first + token.raw.split("\n").length - 1;
    offset += token.raw.length;
    // Items inside this block, in order: each starts on the next line in the block whose content is
    // the item's first line. A nested item's `raw` has lost its indentation, and one in a quote its
    // `>`, so content is compared with both taken off.
    const content = (line: string): string => line.replace(/^[\s>]*/, "").trimEnd();
    let cursor = first;
    for (const item of taskItems([token])) {
      const head = content(item.raw.split("\n")[0]);
      while (cursor <= last && content(stashedLines[cursor]) !== head) cursor += 1;
      if (cursor > last) return null;
      const line = toSource(cursor);
      found.push({ line, text: bodyLines[line] ?? "" });
      cursor += 1;
    }
  }
  return found;
}

/**
 * Whether the boxes the page drew may be clicked, given their ticked states in drawing order. The
 * reasons are sentences for the person looking at the disabled boxes.
 */
export function checkboxPlan(body: string, drawn: boolean[]): CheckboxPlan {
  const lines = taskLines(body);
  const off = (reason: string): CheckboxPlan => ({ clickable: false, reason: `These checkboxes can't be ticked here: ${reason}` });
  if (lines === null) return off("the app could not match the drawn page back to the file's lines, and a click on a guessed line could tick the wrong one.");
  if (lines.length !== drawn.length) {
    return off(
      `the page shows ${drawn.length} ${drawn.length === 1 ? "box" : "boxes"} but the file has ${lines.length} task ${lines.length === 1 ? "line" : "lines"} the app can match them to — raw HTML can draw a box of its own — so a click could land on the wrong line.`,
    );
  }
  for (const [index, entry] of lines.entries()) {
    const state = checkboxState(entry.text);
    if (state === null) {
      return off(`line ${entry.line + 1} holds a box inside a quote or another block, which can't be changed in place.`);
    }
    if (state.ticked !== drawn[index]) {
      return off(`box ${index + 1} is drawn ${drawn[index] ? "ticked" : "unticked"} but its line says otherwise, so the page and the file disagree.`);
    }
  }
  return { clickable: true, lines };
}
