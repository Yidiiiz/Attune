// Owns: §16.0’s tail-follow policy and its bottom navigation target.
// Failure behavior: scrolling up suspends following; a new send or path resumes it.
"use client";
import { useEffect, useRef } from "react";

export function useChatScroll(scroller: HTMLElement | null, pathLength: number, streamingId: string | null, messages: readonly unknown[]) {
  const bottom = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  useEffect(() => {
    if (scroller === null) return;
    const onScroll = () => { following.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 80; };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [scroller]);
  useEffect(() => { following.current = true; }, [pathLength]);
  useEffect(() => {
    if (following.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [pathLength, streamingId, messages]);
  return { bottom, follow: () => { following.current = true; } };
}
