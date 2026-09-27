// The handover is the one part of "ask about this document" with no user-visible surface of its own,
// so its rules are checked here rather than through the browser: taken exactly once, per
// conversation, and never trusting what it reads back.
//
// The store is injected, because this file runs in plain Node (`vitest.config.ts`) and because the
// interesting cases — storage that throws, an entry someone else wrote — are ones a real
// `sessionStorage` will not produce on demand.

import { describe, expect, it } from "vitest";
import { stashHandover, takeHandover } from "./handover";
import type { Store } from "./handover";

function memory(initial: Record<string, string> = {}): Store & { items: Record<string, string> } {
  const items = { ...initial };
  return {
    items,
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => {
      items[key] = value;
    },
    removeItem: (key) => {
      delete items[key];
    },
  };
}

const throwing: Store = {
  getItem() {
    throw new Error("storage is off");
  },
  setItem() {
    throw new Error("storage is off");
  },
  removeItem() {
    throw new Error("storage is off");
  },
};

describe("the document view's handover", () => {
  it("hands a message to one conversation and takes it exactly once", () => {
    const store = memory();
    expect(stashHandover("c_1", { text: "why this file?", attachments: ["files/a.png"] }, store)).toBe(true);
    expect(takeHandover("c_1", store)).toEqual({ text: "why this file?", attachments: ["files/a.png"] });
    expect(takeHandover("c_1", store)).toBeNull();
    expect(Object.keys(store.items)).toEqual([]);
  });

  it("keeps conversations apart", () => {
    const store = memory();
    stashHandover("c_1", { text: "one", attachments: [] }, store);
    stashHandover("c_2", { text: "two", attachments: [] }, store);
    expect(takeHandover("c_2", store)?.text).toBe("two");
    expect(takeHandover("c_1", store)?.text).toBe("one");
  });

  it("says so rather than throwing when storage refuses, which is what keeps the text in the box", () => {
    expect(stashHandover("c_1", { text: "one", attachments: [] }, throwing)).toBe(false);
    expect(stashHandover("c_1", { text: "one", attachments: [] }, null)).toBe(false);
    expect(takeHandover("c_1", throwing)).toBeNull();
    expect(takeHandover("c_1", null)).toBeNull();
  });

  it("refuses an entry that is not a handover, rather than sending whatever it found", () => {
    expect(takeHandover("c_1", memory({ "attune.handover:c_1": "not json" }))).toBeNull();
    expect(takeHandover("c_1", memory({ "attune.handover:c_1": "[]" }))).toBeNull();
    expect(takeHandover("c_1", memory({ "attune.handover:c_1": '{"attachments":[]}' }))).toBeNull();
    expect(takeHandover("c_1", memory({ "attune.handover:c_1": '{"text":"hi","attachments":[1,"a"]}' }))).toEqual({
      text: "hi",
      attachments: ["a"],
    });
    expect(takeHandover("c_1", memory({ "attune.handover:c_1": '{"text":"hi"}' }))).toEqual({ text: "hi", attachments: [] });
  });
});
