// Owns: what the browser remembers per device (PROJECT.md §10.2, Decision 19) — which rail panel is
// open, which folders are expanded, and where each tree was scrolled to. All of it is `localStorage`,
// read after mount so the server render and the first client render agree.
//
// Failure behavior: a browser that refuses storage costs the memory and nothing else. Every read
// falls back to the default, and every write is dropped quietly; none of this is worth an error.

"use client";

import { useCallback, useEffect, useRef } from "react";

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage refused: the default is a fine answer next time
  }
}

/**
 * Remember a scroller's position under `key`, and put it back once `ready` — once the content it
 * scrolls has loaded, since restoring into an empty list scrolls nowhere. Returns the ref for the
 * scroller.
 */
export function useRememberedScroll(key: string, ready: boolean): (element: HTMLElement | null) => void {
  const element = useRef<HTMLElement | null>(null);
  const restored = useRef(false);

  useEffect(() => {
    const target = element.current;
    if (!ready || target === null || restored.current) return;
    restored.current = true;
    const top = readStored<number>(key, 0);
    if (Number.isFinite(top) && top > 0) target.scrollTop = top;
  }, [key, ready]);

  useEffect(() => {
    const target = element.current;
    if (target === null) return;
    let frame = 0;
    const onScroll = (): void => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        writeStored(key, Math.round(target.scrollTop));
      });
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [key, ready]);

  return useCallback((node: HTMLElement | null) => {
    element.current = node;
  }, []);
}
