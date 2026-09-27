// The registry is half of what replaced the `[data-message='…']` selectors (Decision 99), and the
// half with rules of its own: a stable ref per key, an entry that leaves with its element, and a
// walk up from a node to the element that owns it.
//
// The elements here are plain objects with a `parentElement`, which is every property the registry
// touches — the suite runs in plain Node (`vitest.config.ts`), and a real DOM would test jsdom
// rather than this file.

import { describe, expect, it } from "vitest";
import { createElementRegistry } from "./element-registry";

interface FakeNode {
  nodeType: number;
  parentElement: FakeNode | null;
}

function element(parent: FakeNode | null = null): FakeNode {
  return { nodeType: 1, parentElement: parent };
}

function text(parent: FakeNode): FakeNode {
  return { nodeType: 3, parentElement: parent };
}

const as = (node: FakeNode): HTMLElement => node as unknown as HTMLElement;

describe("the chat's element registry", () => {
  it("hands out one ref per key, so React attaches it once", () => {
    const registry = createElementRegistry<"a" | "b">();
    expect(registry.ref("a")).toBe(registry.ref("a"));
    expect(registry.ref("a")).not.toBe(registry.ref("b"));
  });

  it("answers with the element a key's ref was called with", () => {
    const registry = createElementRegistry<"a">();
    const row = element();
    expect(registry.get("a")).toBeNull();
    registry.ref("a")(as(row));
    expect(registry.get("a")).toBe(row);
  });

  it("forgets a key when its element unmounts, and keeps the ref usable", () => {
    const registry = createElementRegistry<"a">();
    const first = element();
    const attach = registry.ref("a");
    attach(as(first));
    attach(null);
    expect(registry.get("a")).toBeNull();
    expect(registry.owner(as(first))).toBeNull();

    // A remount reuses the same function, which is why it must still work after a detach.
    const second = element();
    attach(as(second));
    expect(registry.get("a")).toBe(second);
  });

  it("drops the old element when a key is re-registered without a detach", () => {
    const registry = createElementRegistry<"a">();
    const first = element();
    const second = element();
    registry.ref("a")(as(first));
    registry.ref("a")(as(second));
    expect(registry.get("a")).toBe(second);
    expect(registry.owner(as(first))).toBeNull();
    expect(registry.owner(as(second))?.key).toBe("a");
  });

  it("walks up from a text node to the element that owns it", () => {
    const registry = createElementRegistry<"row">();
    const row = element();
    const paragraph = element(row);
    const word = text(paragraph);
    registry.ref("row")(as(row));
    expect(registry.owner(word as unknown as Node)).toEqual({ key: "row", element: row });
  });

  it("answers the nearest owner, and null outside every registered element", () => {
    const registry = createElementRegistry<"outer" | "inner">();
    const outer = element();
    const inner = element(outer);
    const deep = element(inner);
    registry.ref("outer")(as(outer));
    registry.ref("inner")(as(inner));
    expect(registry.owner(deep as unknown as Node)?.key).toBe("inner");
    expect(registry.owner(element() as unknown as Node)).toBeNull();
    expect(registry.owner(null)).toBeNull();
  });
});
