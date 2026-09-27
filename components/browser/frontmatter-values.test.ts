// `asValue` is the one part of the editable frontmatter table that can quietly change a file's
// meaning: a cell is text, and the value that goes back has to be the shape the file had. A list
// that comes back as a string, or a number that comes back as `"3"`, is a schema refusal at best and
// a silently retyped field at worst.
//
// Named `frontmatter-values.test.ts` rather than `FrontmatterTable.test.ts` because the suite
// collects `components/**/*.test.ts` and this file must not pull a `.tsx` component into plain Node.

import { describe, expect, it } from "vitest";
import { asValue } from "./FrontmatterTable";

describe("what a frontmatter cell gives back", () => {
  it("keeps a list a list, trimming and dropping the empties a trailing comma leaves", () => {
    expect(asValue("one, two ,three", ["a"])).toEqual(["one", "two", "three"]);
    expect(asValue("one,,", ["a"])).toEqual(["one"]);
    expect(asValue("", [])).toEqual([]);
  });

  it("keeps a number a number while it still reads as one, and hands back the text when it does not", () => {
    expect(asValue("45", 30)).toBe(45);
    expect(asValue(" 45 ", 30)).toBe(45);
    expect(asValue("", 30)).toBe("");
    expect(asValue("soon", 30)).toBe("soon");
  });

  it("leaves everything else as the text that was typed, including a cleared cell", () => {
    expect(asValue("2026-09-30", "2026-09-20")).toBe("2026-09-30");
    expect(asValue("", "2026-09-20")).toBe("");
    expect(asValue("something", null)).toBe("something");
  });
});
