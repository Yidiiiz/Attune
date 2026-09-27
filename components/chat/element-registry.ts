// Owns: the chat's answer to "which element is this record?" — a map from a record's id to the
// element rendering it, filled by the elements themselves as React mounts them.
//
// It exists because of the `data-*` convention (AGENTS.md, Conventions; Decision 99): a `data-`
// attribute is a test hook, so a test may rename one freely, and application behaviour that reads
// one — including by selector — is behaviour resting on a hook. `scroller.querySelector("[data-message='…']")`
// was five such reads. A callback ref is the same lookup with the dependency the right way round:
// the component that renders the row hands its element over, and nothing parses the DOM for it.
//
// Three properties are worth knowing before using it.
//
//   - **The ref for a key is the same function for the life of the registry.** React re-invokes a
//     callback ref whose identity changed — detaching with `null` and re-attaching — so a fresh
//     closure per render would churn the map on every keystroke. They are cached, and a key's entry
//     is dropped when its element unmounts while the function stays.
//   - **`owner` walks up from a node**, which is how a selection is traced back to the message it
//     was made in without reading the row's id off the row.
//   - **A miss is `null`, never a throw.** An element that has not mounted yet, or has just
//     unmounted, is an ordinary state here: the sidebar measures what it can find and the
//     annotation pass places the cards whose messages are on screen.
//
// Failure behavior: every answer degrades to "no element", which each caller already handles as
// "nothing to measure" or "nothing to scroll to". Nothing here touches the document.

"use client";

import { useRef } from "react";

export interface ElementRegistry<K extends string> {
  /** The callback ref for the element that *is* `key`. Stable, so React attaches it once. */
  ref(key: K): (element: HTMLElement | null) => void;
  /** The element rendering `key`, or null if nothing is mounted for it. */
  get(key: K): HTMLElement | null;
  /** The registered element containing `node`, with its key — the nearest one, walking up. */
  owner(node: Node | null): { key: K; element: HTMLElement } | null;
}

export function createElementRegistry<K extends string>(): ElementRegistry<K> {
  const byKey = new Map<K, HTMLElement>();
  const keyOf = new Map<HTMLElement, K>();
  const refs = new Map<K, (element: HTMLElement | null) => void>();

  return {
    ref(key: K) {
      const cached = refs.get(key);
      if (cached !== undefined) return cached;
      const attach = (element: HTMLElement | null): void => {
        const previous = byKey.get(key);
        if (previous !== undefined) keyOf.delete(previous);
        if (element === null) {
          byKey.delete(key);
          return;
        }
        byKey.set(key, element);
        keyOf.set(element, key);
      };
      // Kept after the element unmounts, deliberately: `refs.delete` here would hand React a new
      // function on the next render, and React detaches the old ref by calling it with `null` —
      // which would then delete the entry the new one had just made.
      refs.set(key, attach);
      return attach;
    },

    get(key: K) {
      return byKey.get(key) ?? null;
    },

    owner(node: Node | null) {
      // `nodeType === 1` rather than `Node.ELEMENT_NODE`: this module is imported by a test that
      // runs in plain Node, where the `Node` global does not exist (`vitest.config.ts`).
      let element: HTMLElement | null =
        node === null
          ? null
          : node.nodeType === 1
            ? (node as HTMLElement)
            : (node.parentElement as HTMLElement | null);
      while (element !== null) {
        const key = keyOf.get(element);
        if (key !== undefined) return { key, element };
        element = element.parentElement;
      }
      return null;
    },
  };
}

/** The same registry for the life of the component, so refs never churn across renders. */
export function useElementRegistry<K extends string>(): ElementRegistry<K> {
  const registry = useRef<ElementRegistry<K> | null>(null);
  registry.current ??= createElementRegistry<K>();
  return registry.current;
}
