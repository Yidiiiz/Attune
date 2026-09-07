// §16.10: both modes, block-boundary newlines, and the repetition limit. The cases are written
// against the asymmetry the module exists for — stored markdown on one side, rendered text or a
// pointer selection on the other — rather than against synthetic strings.

import { describe, expect, it } from "vitest";
import { denseIndex, densify, findDense, findDenseFirst } from "./text-match.ts";

describe("densify", () => {
  it("drops whitespace in the default mode and leaves markdown alone", () => {
    expect(densify("due  on\nFriday")).toBe("dueonFriday");
    expect(densify("**due** on Friday")).toBe("**due**onFriday");
  });

  it("drops markdown syntax too in markdown mode", () => {
    expect(densify("**due** on Friday", true)).toBe("dueonFriday");
    expect(densify("# A heading\n\n- one\n- two", true)).toBe("Aheadingonetwo");
  });
});

describe("denseIndex", () => {
  it("maps every dense offset back to its source offset", () => {
    const index = denseIndex("a b");
    expect(index.dense).toBe("ab");
    expect(index.map).toEqual([0, 2]);
    expect(index.source).toBe("a b");
  });

  it("indexes an empty string without complaint", () => {
    expect(denseIndex("")).toEqual({ source: "", dense: "", map: [] });
  });
});

describe("findDense", () => {
  it("finds a quote whose newlines the rendered text does not have", () => {
    // The selection crossed a list boundary, so it carries a newline the paragraph does not.
    const rendered = "Bring the pset, the notes and a pen";
    const selected = "the notes\nand a pen";
    const match = findDense(denseIndex(rendered), selected)[0];
    expect(rendered.slice(match.start, match.end)).toBe("the notes and a pen");
  });

  it("finds rendered text inside its own markdown source, in markdown mode", () => {
    const source = "Read **chapter 4** before Friday";
    const rendered = "chapter 4 before";
    expect(findDense(denseIndex(source, true), rendered, true)).toHaveLength(1);
    // Without markdown mode the asterisks are in the way, which is the whole reason the mode exists.
    expect(findDense(denseIndex(source), rendered)).toHaveLength(0);
  });

  it("reports every occurrence, in source coordinates", () => {
    const text = "one two one two one";
    expect(findDense(denseIndex(text), "one").map((m) => m.start)).toEqual([0, 8, 16]);
  });

  it("stops at the repetition limit rather than scanning a pathological case", () => {
    const text = "a".repeat(1000);
    expect(findDense(denseIndex(text), "a")).toHaveLength(200);
    expect(findDense(denseIndex(text), "a", false, 5)).toHaveLength(5);
  });

  it("answers with nothing for an empty needle", () => {
    expect(findDense(denseIndex("anything"), "")).toEqual([]);
    expect(findDense(denseIndex("anything"), "   ")).toEqual([]);
  });

  it("carries dense offsets alongside the source ones, for prefix and suffix comparison", () => {
    const index = denseIndex("a  b  c");
    const match = findDense(index, "b")[0];
    expect(index.dense.slice(0, match.denseStart)).toBe("a");
    expect(index.dense.slice(match.denseEnd)).toBe("c");
  });
});

describe("findDenseFirst", () => {
  it("answers with the first occurrence, or null", () => {
    expect(findDenseFirst(denseIndex("one two one"), "one")?.start).toBe(0);
    expect(findDenseFirst(denseIndex("one two"), "three")).toBeNull();
  });
});
