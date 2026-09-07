// §16.10 requires tests for refs. The interesting half is what is *not* extracted: a wrong edge in
// the graph and a wrong backlink on a task are worse than a missing one, and every rejection here
// is a path this app must never resolve.

import { describe, expect, it } from "vitest";
import { extractRefs, isDataPath } from "./refs.ts";

describe("extractRefs", () => {
  it("finds a bare task id anywhere in the prose", () => {
    expect(extractRefs("I moved t_20260903_7fa2 to Friday.")).toEqual(["t_20260903_7fa2"]);
  });

  it("finds a data path only when it is a markdown link", () => {
    expect(extractRefs("see [the notes](knowledge/notes/office-hours.md)")).toEqual([
      "knowledge/notes/office-hours.md",
    ]);
    expect(extractRefs("the file knowledge/notes/office-hours.md is where it lives")).toEqual([]);
  });

  it("keeps both kinds in one list, in the order they appear", () => {
    const text = "[map](knowledge/maps/school.md) covers t_20260903_7fa2 and [n](knowledge/notes/a.md)";
    expect(extractRefs(text)).toEqual([
      "knowledge/maps/school.md",
      "t_20260903_7fa2",
      "knowledge/notes/a.md",
    ]);
  });

  it("deduplicates", () => {
    expect(extractRefs("t_20260903_7fa2 and again t_20260903_7fa2")).toEqual(["t_20260903_7fa2"]);
  });

  it("ignores an external link", () => {
    expect(extractRefs("[open-meteo](https://open-meteo.com/) and [mail](mailto:a@b.c)")).toEqual([]);
  });

  it("ignores anything that would escape the data directory", () => {
    expect(extractRefs("[up](../../.env.local) [abs](/etc/passwd) [drive](C:/keys.txt)")).toEqual([]);
  });

  it("ignores an in-page anchor and a bare query", () => {
    expect(extractRefs("[here](#section) and [q](?x=1)")).toEqual([]);
  });

  it("takes the target and not the title", () => {
    expect(extractRefs('[n](knowledge/notes/a.md "the note")')).toEqual(["knowledge/notes/a.md"]);
  });

  it("does not mistake a near-miss for a task id", () => {
    expect(extractRefs("t_2026093_7fa2 t_20260903_7FA2 xt_20260903_7fa2")).toEqual([]);
  });

  it("answers with nothing for a message that references nothing", () => {
    expect(extractRefs("Sounds good, I will start on it tonight.")).toEqual([]);
  });
});

describe("isDataPath", () => {
  it("accepts a relative path and refuses everything else", () => {
    expect(isDataPath("knowledge/notes/a.md")).toBe(true);
    expect(isDataPath("tasks/2026-09-10-pset-4.md")).toBe(true);
    expect(isDataPath("")).toBe(false);
    expect(isDataPath("http://example.com")).toBe(false);
    expect(isDataPath("/absolute")).toBe(false);
    expect(isDataPath("a/../../b")).toBe(false);
  });
});
