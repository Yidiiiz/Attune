// §6.3 and §6.4's rules as pure functions: the similarity line, the duplicate rewrite, and which
// writes may skip the card. The similarity cases sit at the line on purpose — a threshold tested only
// far from its edge is a threshold nobody has checked.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HEURISTIC,
  SIMILAR,
  autoApplicable,
  filterWrites,
  normalizeTitle,
  overCap,
  pickAutoApply,
  titleSimilarity,
} from "./memory.ts";
import type { ProposedWrite } from "./memory.ts";

const HABITS = "knowledge/profile/habits.md";

const append = (path: string, content: string): ProposedWrite => ({ path, op: "append", content, reason: "seen twice", mapLink: null });

describe("normalizeTitle", () => {
  it("folds case and accents, turns punctuation into spaces, and drops stop words", () => {
    expect(normalizeTitle("Notes: The Café's Hours (for MATH-221)")).toBe("notes cafe s hours math 221");
  });

  it("keeps a title made only of stop words, rather than reducing it to nothing", () => {
    expect(normalizeTitle("The")).toBe("the");
  });
});

describe("titleSimilarity against the 0.8 line", () => {
  it("is 1 for a single-word title matched to itself", () => {
    expect(titleSimilarity("Dune", "Dune")).toBe(1);
  });

  it("puts a single word one letter short exactly on the line, which is not above it", () => {
    expect(titleSimilarity("Dune", "Dun")).toBeCloseTo(0.8, 10);
    expect(titleSimilarity("Dune", "Dun") > SIMILAR).toBe(false);
    expect(titleSimilarity("Dune", "Dunes") > SIMILAR).toBe(true);
  });

  it("matches a pair just above the line and not a pair just below it", () => {
    const above = titleSimilarity("Advisor meetings", "Advisor meeting notes");
    const below = titleSimilarity("Office hours", "Office hrs");
    expect(above).toBeCloseTo(0.8125, 4);
    expect(below).toBeCloseTo(0.7778, 4);
    expect(above > SIMILAR).toBe(true);
    expect(below > SIMILAR).toBe(false);
  });

  it("is not fooled by word order or stop words", () => {
    expect(titleSimilarity("Office hours for MATH 221", "MATH 221 office hours")).toBeGreaterThan(SIMILAR);
  });

  it("scores two strings too short for a bigram as equal or not", () => {
    expect(titleSimilarity("X", "x")).toBe(1);
    expect(titleSimilarity("X", "Y")).toBe(0);
  });
});

describe("filterWrites", () => {
  const notes = [{ path: "knowledge/notes/office-hours.md", title: "Office hours for MATH 221" }];

  it("turns a duplicate create into an append to the existing note, and says why on the write itself", () => {
    const [write] = filterWrites(
      [{ path: "knowledge/notes/math-office-hours.md", op: "create", content: "---\ntitle: MATH 221 office hours\n---\nMoved to Room 210.\n", reason: "changed", mapLink: "knowledge/maps/courses.md" }],
      notes,
    );
    // What the card shows is what will be applied: the existing path, append, the body only.
    expect(write).toMatchObject({ path: "knowledge/notes/office-hours.md", op: "append", content: "Moved to Room 210.\n", mapLink: null });
    expect(write.rewritten?.path).toBe("knowledge/notes/math-office-hours.md");
    expect(write.rewritten?.why).toContain('matches the existing note "Office hours for MATH 221"');
  });

  it("leaves a create alone when nothing is close enough", () => {
    const original = { path: "knowledge/notes/advisor.md", op: "create" as const, content: "# Advisor\n\nMondays.\n", reason: "", mapLink: "knowledge/maps/people.md" };
    expect(filterWrites([original], notes)).toEqual([original]);
  });

  it("does not touch appends, replaces, or writes outside notes", () => {
    const writes = [append(HABITS, "- a\n"), { ...append("knowledge/notes/x.md", "y"), op: "replace" as const }];
    expect(filterWrites(writes, notes)).toEqual(writes);
  });
});

describe("what may skip the card", () => {
  it("is an append of one to three non-empty lines to habits or preferences", () => {
    expect(autoApplicable(append(HABITS, "- Works late.\n\n- Plans on Sunday.\n- Hates 8am.\n"))).toBe(true);
    expect(autoApplicable(append("knowledge/profile/preferences.md", "- Short answers.\n"))).toBe(true);
  });

  it("is never four lines, a replace, another file, or an empty append", () => {
    expect(autoApplicable(append(HABITS, "a\nb\nc\nd\n"))).toBe(false);
    expect(autoApplicable({ ...append(HABITS, "a\n"), op: "replace" })).toBe(false);
    expect(autoApplicable(append("knowledge/profile/about-me.md", "a\n"))).toBe(false);
    expect(autoApplicable(append(HABITS, "\n  \n"))).toBe(false);
  });

  it("is never a write the filter rewrote, however small", () => {
    const rewritten = { ...append(HABITS, "a\n"), rewritten: { from: "create" as const, path: "knowledge/notes/x.md", why: "match" } };
    expect(autoApplicable(rewritten)).toBe(false);
  });

  it("is at most one per turn", () => {
    const writes = [append(HABITS, "a\n"), append("knowledge/profile/preferences.md", "b\n")];
    const first = pickAutoApply(writes, false);
    expect(first.auto?.path).toBe(HABITS);
    expect(first.rest).toEqual([writes[1]]);
    // The second eligible write in the same turn goes to the card.
    expect(pickAutoApply(first.rest, true)).toEqual({ auto: null, rest: [writes[1]] });
  });
});

describe("the rest of §6", () => {
  it("carries §6.4's heuristic word for word, read from the spec rather than copied into this test", () => {
    const spec = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "PROJECT.md"), "utf8");
    const section = spec.slice(spec.indexOf("### 6.4"), spec.indexOf("### 6.5"));
    const quoted = /^> (.+)$/m.exec(section)?.[1];
    expect(quoted).toBeDefined();
    expect(HEURISTIC).toBe(quoted);
  });

  it("calls a profile file over 150 lines over the cap", () => {
    expect(overCap(Array(150).fill("x").join("\n"))).toBe(false);
    expect(overCap(Array(151).fill("x").join("\n"))).toBe(true);
  });
});
