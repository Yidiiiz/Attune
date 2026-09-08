import { describe, expect, it } from "vitest";
import { READING_MARGIN, currentMessage, promptOf } from "./current-message.ts";
import type { RowBox } from "./current-message.ts";
import type { Message } from "./types.ts";
import { buildPairs } from "./tree.ts";

/** Six rows of 200 px, stacked from 0 — a 1,200 px conversation in a 500 px window. */
const ROWS: RowBox[] = ["a", "b", "c", "d", "e", "f"].map((id, i) => ({
  id,
  top: i * 200,
  height: 200,
}));

const view = (scrollTop: number, over: { clientHeight?: number; scrollHeight?: number } = {}) => ({
  scrollTop,
  clientHeight: over.clientHeight ?? 500,
  scrollHeight: over.scrollHeight ?? 1200,
});

describe("currentMessage", () => {
  it("answers with the last row past the reading margin", () => {
    // Scrolled to 450: the line is at 530, so rows at 0, 200 and 400 are past it and `c` is last.
    expect(currentMessage(ROWS, view(450))).toBe("c");
    expect(READING_MARGIN).toBe(80);
  });

  it("changes only when a row's top crosses the line, not continuously", () => {
    expect(currentMessage(ROWS, view(319))).toBe("b"); // line 399, `c` starts at 400
    expect(currentMessage(ROWS, view(320))).toBe("c"); // line 400
  });

  it("answers with the first message when parked at the top", () => {
    // Nothing has reached the margin, and the general rule would answer with nothing at all.
    expect(currentMessage(ROWS, view(0))).toBe("a");
  });

  it("answers with the first message just below the top, before anything clears the margin", () => {
    expect(currentMessage(ROWS, view(5))).toBe("a");
  });

  it("answers with the last message when parked at the bottom and it is on screen", () => {
    // scrollTop 700 + 500 = 1200 = scrollHeight. The general rule would say `d` (line 780).
    expect(currentMessage(ROWS, view(700))).toBe("f");
  });

  it("answers with the last message when the whole conversation fits", () => {
    // A short conversation is at its end and at its start at once. The bottom exception is checked
    // first and wins, which is right: with everything visible, the newest message is where someone
    // is, and it is also the only reading the sidebar's auto-centre does not fight.
    const rows: RowBox[] = [
      { id: "a", top: 0, height: 200 },
      { id: "b", top: 200, height: 20 },
    ];
    expect(currentMessage(rows, view(0, { clientHeight: 500, scrollHeight: 220 }))).toBe("b");
  });

  it("never lets a zero-height row win", () => {
    const rows: RowBox[] = [
      { id: "a", top: 0, height: 200 },
      { id: "ghost", top: 200, height: 0 },
      { id: "b", top: 200, height: 200 },
    ];
    expect(currentMessage(rows, view(300, { scrollHeight: 400 }))).toBe("b");
  });

  it("answers null only when there is nothing to answer with", () => {
    expect(currentMessage([], view(0))).toBeNull();
    expect(currentMessage([{ id: "a", top: 0, height: 0 }], view(0))).toBeNull();
  });
});

const message = (id: string, role: Message["role"], parentId: string | null): Message => ({
  schema: 1,
  id,
  parentId,
  role,
  status: "complete",
  createdAt: `2026-09-08T10:0${id}:00-04:00`,
  model: null,
  attachments: [],
  refs: [],
  deleted: false,
  error: null,
  text: id,
});

describe("promptOf", () => {
  const path = [
    message("1", "user", null),
    message("2", "assistant", "1"),
    message("3", "user", "2"),
    message("4", "assistant", "3"),
  ];
  const pairs = buildPairs(path);

  it("normalizes a reply to the prompt it answers", () => {
    expect(promptOf(pairs, "2")).toBe("1");
    expect(promptOf(pairs, "4")).toBe("3");
  });

  it("leaves a prompt alone", () => {
    expect(promptOf(pairs, "3")).toBe("3");
  });

  it("passes through an id the pairs do not know, rather than blanking the highlight", () => {
    expect(promptOf(pairs, "99")).toBe("99");
    expect(promptOf(pairs, null)).toBeNull();
  });
});
