// §16.10's two properties for anchoring, which are really one property stated twice: context wins,
// and position only breaks ties. If that inverts, an edit near the top of a message drags every
// later note onto the wrong copy of a repeated phrase — silently, because a wrong anchor still
// renders a card.

import { describe, expect, it } from "vitest";
import { findAnchorText, findQuote } from "./anchoring.ts";

/** Three copies of the same sentence, each with different neighbours. */
const TEXT = [
  "Monday: read the notes carefully before class.",
  "Wednesday: read the notes carefully after the pset.",
  "Friday: read the notes carefully one more time.",
].join("\n");

const first = TEXT.indexOf("read the notes");
const second = TEXT.indexOf("read the notes", first + 1);
const third = TEXT.indexOf("read the notes", second + 1);

describe("findQuote", () => {
  it("finds the only occurrence with no context at all", () => {
    const match = findQuote("just the once", "the once", null, null, null);
    expect(match).toEqual({ start: 5, end: 13 });
  });

  it("answers null rather than guessing when the quote is gone", () => {
    expect(findQuote(TEXT, "read the summary", null, null, null)).toBeNull();
    expect(findQuote(TEXT, "", null, null, null)).toBeNull();
  });

  it("uses the prefix to pick between identical occurrences", () => {
    const match = findQuote(TEXT, "read the notes carefully", "Wednesday:", null, null);
    expect(match?.start).toBe(second);
  });

  it("uses the suffix the same way", () => {
    const match = findQuote(TEXT, "read the notes carefully", null, "one more time", null);
    expect(match?.start).toBe(third);
  });

  it("lets context beat position, which is the whole scoring shape", () => {
    // The offset points straight at the first occurrence; the prefix says the third. Context wins,
    // because a matching neighbour is worth 2 and the offset penalty can never exceed 1.
    const match = findQuote(TEXT, "read the notes carefully", "Friday:", null, first);
    expect(match?.start).toBe(third);
  });

  it("lets position break a tie between context-equivalent candidates", () => {
    // No prefix and no suffix, so all three score 0 before the offset penalty is applied.
    expect(findQuote(TEXT, "read the notes carefully", null, null, second)?.start).toBe(second);
    expect(findQuote(TEXT, "read the notes carefully", null, null, third)?.start).toBe(third);
  });

  it("still finds a quote whose whitespace does not match the text", () => {
    const match = findQuote("one two three", "one\ntwo", null, null, null);
    expect(match).toEqual({ start: 0, end: 7 });
  });

  it("matches rendered text against markdown source in markdown mode", () => {
    const source = "Read **chapter 4** before Friday.";
    const match = findQuote(source, "chapter 4 before", null, null, null, true);
    expect(match).not.toBeNull();
    expect(source.slice(match?.start, match?.end)).toBe("chapter 4** before");
  });
});

describe("findAnchorText", () => {
  it("answers with the first occurrence's start offset", () => {
    expect(findAnchorText(TEXT, "Wednesday")).toBe(TEXT.indexOf("Wednesday"));
  });

  it("answers null for text that is not there, or for nothing at all", () => {
    expect(findAnchorText(TEXT, "Tuesday")).toBeNull();
    expect(findAnchorText(TEXT, "")).toBeNull();
  });
});
