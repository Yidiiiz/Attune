import { describe, expect, it } from "vitest";
import { boundedSubsequence, rank, scoreEntry, TOP } from "./search.ts";
import type { Entry } from "./search.ts";

const entry = (title: string, body = "", updatedAt = "2026-09-10T10:00:00-04:00", path = `knowledge/notes/${title}.md`): Entry => ({
  kind: "note",
  title,
  body,
  path,
  updatedAt,
});

describe("scoreEntry: §10.0's four rules, best one wins", () => {
  it("scores a title substring 100, a title subsequence 60, a body substring 30, a body subsequence 10", () => {
    expect(scoreEntry("basis", "Change of basis", "")).toEqual({ score: 100, where: "title" });
    expect(scoreEntry("cob", "Change of basis", "")).toEqual({ score: 60, where: "title" });
    expect(scoreEntry("eigen", "Linear algebra", "eigenvalues first")).toEqual({ score: 30, where: "body" });
    expect(scoreEntry("egn", "Linear algebra", "an eigen value")).toEqual({ score: 10, where: "body" });
    expect(scoreEntry("zzz", "Linear algebra", "nothing here")).toBeNull();
  });

  it("takes the best single match rather than the sum", () => {
    expect(scoreEntry("basis", "Change of basis", "a basis is a basis")?.score).toBe(100);
  });

  it("ignores case on both sides", () => {
    expect(scoreEntry("basis", "CHANGE OF BASIS", "")?.score).toBe(100);
    expect(scoreEntry("dune", "Movies", "DUNE — the 2021 one")?.score).toBe(30);
  });
});

describe("the body subsequence bound: twice the query's length", () => {
  // "abc" is 3 long, so the window may be 6: the last matched character at most 5 after the first.
  it("counts a match whose window is exactly twice the query's length", () => {
    expect("a..b.c".length).toBe(6);
    expect(boundedSubsequence("abc", "a..b.c", 6)).toBe(true);
    expect(scoreEntry("abc", "Title", "xx a..b.c xx")?.score).toBe(10);
  });

  it("refuses one a character longer", () => {
    expect("a..b..c".length).toBe(7);
    expect(boundedSubsequence("abc", "a..b..c", 6)).toBe(false);
    expect(scoreEntry("abc", "Title", "xx a..b..c xx")).toBeNull();
  });

  it("finds the tight window after a loose one that starts earlier", () => {
    expect(boundedSubsequence("abc", "a....... abc", 6)).toBe(true);
  });

  it("leaves a title subsequence unbounded, since a title is short", () => {
    expect(scoreEntry("cb", "Change of basis", "")?.score).toBe(60);
  });
});

describe("rank", () => {
  it("orders by score, then the most recently updated first", () => {
    const hits = rank(
      [
        entry("Old basis", "", "2026-09-01T10:00:00-04:00"),
        entry("Notes", "a basis appears here"),
        entry("New basis", "", "2026-09-12T10:00:00-04:00"),
      ],
      "basis",
    );
    expect(hits.map((hit) => hit.title)).toEqual(["New basis", "Old basis", "Notes"]);
  });

  it("compares updatedAt as instants, not as strings in different offsets", () => {
    const hits = rank(
      [entry("A basis", "", "2026-09-10T09:00:00-04:00"), entry("B basis", "", "2026-09-10T14:00:00+01:00")],
      "basis",
    );
    // 14:00+01:00 is 13:00Z; 09:00-04:00 is 13:00Z too — equal, so the path decides, and A is first.
    // One minute later on the first flips it.
    expect(hits.map((hit) => hit.title)).toEqual(["A basis", "B basis"]);
    const later = rank(
      [entry("A basis", "", "2026-09-10T09:01:00-04:00"), entry("B basis", "", "2026-09-10T14:00:00+01:00")],
      "basis",
    );
    expect(later[0].title).toBe("A basis");
    const earlier = rank(
      [entry("A basis", "", "2026-09-10T08:59:00-04:00"), entry("B basis", "", "2026-09-10T14:00:00+01:00")],
      "basis",
    );
    expect(earlier[0].title).toBe("B basis");
  });

  it(`returns at most ${TOP}, and nothing for an empty query`, () => {
    const many = Array.from({ length: 30 }, (_, i) => entry(`basis ${i}`));
    expect(rank(many, "basis")).toHaveLength(TOP);
    expect(rank(many, "   ")).toEqual([]);
  });
});
