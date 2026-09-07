// §9.5 step 4's merge rule, which is the one thing in the preview panel that can be quietly wrong:
// a follow-up that silently discards an edit looks exactly like a follow-up that worked, and the
// user only finds out after pressing Add.

import { describe, expect, it } from "vitest";
import { mergeDraft, mergeSelection } from "./draft";
import type { ModelTaskDraft } from "@/lib/agent/tools";

function draft(title: string, over: Partial<ModelTaskDraft> = {}): ModelTaskDraft {
  return {
    title,
    body: "",
    status: "todo",
    priority: 3,
    estimateMin: null,
    due: null,
    scheduled: null,
    category: null,
    context: null,
    tags: [],
    links: [],
    repeat: null,
    repeatUntil: null,
    collection: null,
    inferred: [],
    ...over,
  };
}

describe("mergeDraft", () => {
  it("takes the model's value for a field the follow-up changed", () => {
    const sent = [draft("Pset 4", { due: null })];
    const revised = [draft("Pset 4", { due: "2026-09-11" })];
    expect(mergeDraft(sent, sent, revised)[0].due).toBe("2026-09-11");
  });

  it("keeps an edit made while the request was in flight", () => {
    // The user retitled the card after pressing send; the model only moved the date.
    const sent = [draft("Pset 4", { due: null })];
    const current = [draft("Linear algebra pset 4", { due: null })];
    const revised = [draft("Pset 4", { due: "2026-09-11" })];

    const merged = mergeDraft(sent, current, revised);
    expect(merged[0].title).toBe("Linear algebra pset 4");
    expect(merged[0].due).toBe("2026-09-11");
  });

  it("lets the model win when it changed the very field that was edited", () => {
    const sent = [draft("Pset 4")];
    const current = [draft("Pset four")];
    const revised = [draft("Linear algebra problem set 4")];
    expect(mergeDraft(sent, current, revised)[0].title).toBe("Linear algebra problem set 4");
  });

  it("compares against what was sent, not against what is on screen", () => {
    // The trap: against `current`, the model returning the value it was given looks like a change
    // away from the in-flight edit, and the edit gets overwritten by the value it replaced.
    const sent = [draft("A", { category: "school" })];
    const current = [draft("A", { category: "personal" })];
    const revised = [draft("A", { category: "school" })];
    expect(mergeDraft(sent, current, revised)[0].category).toBe("personal");
  });

  it("merges array and null fields by value, not by identity", () => {
    const sent = [draft("A", { tags: ["pset"], estimateMin: null })];
    const current = [draft("A", { tags: ["pset", "weekly"], estimateMin: null })];
    const revised = [draft("A", { tags: ["pset"], estimateMin: 90 })];

    const merged = mergeDraft(sent, current, revised);
    expect(merged[0].tags).toEqual(["pset", "weekly"]);
    expect(merged[0].estimateMin).toBe(90);
  });

  it("takes a card the revision added exactly as it came", () => {
    const sent = [draft("A")];
    const revised = [draft("A"), draft("B", { priority: 1 })];
    const merged = mergeDraft(sent, sent, revised);
    expect(merged).toHaveLength(2);
    expect(merged[1].priority).toBe(1);
  });

  it("drops the cards a revision removed", () => {
    const sent = [draft("A"), draft("B")];
    expect(mergeDraft(sent, sent, [draft("A")]).map((item) => item.title)).toEqual(["A"]);
  });

  it("returns an empty list rather than throwing when the revision is empty", () => {
    expect(mergeDraft([draft("A")], [draft("A")], [])).toEqual([]);
  });
});

describe("mergeSelection", () => {
  it("keeps what was ticked and selects the cards a revision added", () => {
    expect(mergeSelection([true, false], 3)).toEqual([true, false, true]);
  });

  it("truncates to the new length", () => {
    expect(mergeSelection([false, true, true], 1)).toEqual([false]);
  });
});
