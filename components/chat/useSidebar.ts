// Owns: the measuring half of PROJECT.md §16.5 — everything about the sidebar that needs a real
// element. The deciding half is pure and lives in `lib/chat/current-message.ts` and
// `lib/chat/pane-layout.ts`; this file only reads geometry and hands it over.
//
// Three things are measured, and each has a reason for being measured rather than tracked:
//
//   - **Available width**, from a `ResizeObserver` on the main pane. §16.5 says the width mode comes
//     from available space *only* — never from conversation length — so there is nothing to track.
//   - **Row tops**, from `offsetTop` on the elements carrying `data-message`. Read on scroll,
//     inside a `requestAnimationFrame`, because a scroll handler that measures synchronously is how
//     a scroller starts to feel heavy.
//   - **Whether the reader is driving the sidebar.** §16.5 pauses auto-centring when they scroll it
//     and resumes when the current message changes.
//
// The guard flag that separates a programmatic scroll from a real one is the one subtle part, and
// it is not a timer (§16.7). `scrollTo` fires a scroll event we must ignore; the flag is set before
// the call and cleared by that event. The trap is a `scrollTo` that changes nothing — no event, so
// the flag would stay set and swallow the reader's next real scroll — and the repo's dirty-check
// convention closes it: compare the target against the current position and skip a no-op write.
//
// Failure behavior: every measurement degrades to "no answer", which the caller renders as "no
// highlight" rather than as an error. Missing `ResizeObserver` leaves the pane at its full layout,
// which is the widest and most useful of the choices. Nothing here writes anything anywhere.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { currentMessage, promptOf } from "@/lib/chat/current-message";
import type { RowBox } from "@/lib/chat/current-message";
import { paneLayout } from "@/lib/chat/pane-layout";
import type { PaneLayout } from "@/lib/chat/pane-layout";
import type { Pair } from "@/lib/chat/tree";
import type { MessageId } from "@/lib/chat/types";

export interface SidebarInput {
  /** The scrolling element the messages live in. */
  scroller: HTMLElement | null;
  /** The main pane, whose width the cascade divides. */
  pane: HTMLElement | null;
  /** The sidebar's own scroller, auto-centred on the current entry. */
  list: HTMLElement | null;
  pairs: Pair[];
  /** False until Stage C's annotations exist; the gutter asks for no room without them. */
  wantGutter: boolean;
  collapsed: boolean;
}

export interface SidebarState {
  layout: PaneLayout;
  /** The prompt id of the exchange being read, or null before anything has laid out. */
  current: MessageId | null;
}

/**
 * `offsetTop` is relative to the offset parent, so the scroller is given `position: relative` in
 * `Chat.module.css` to *be* that parent. Without it the tops carry the header's height as a
 * constant error, which is not visible in a screenshot and moves the reading margin.
 */
function measure(scroller: HTMLElement): RowBox[] {
  const rows: RowBox[] = [];
  for (const element of scroller.querySelectorAll<HTMLElement>("[data-message]")) {
    const id = element.dataset.message;
    if (id === undefined) continue;
    rows.push({ id, top: element.offsetTop, height: element.offsetHeight });
  }
  return rows;
}

export function useSidebar({
  scroller,
  pane,
  list,
  pairs,
  wantGutter,
  collapsed,
}: SidebarInput): SidebarState {
  const [available, setAvailable] = useState(0);
  const [reading, setReading] = useState<MessageId | null>(null);

  // Width. `available` starting at 0 means the first paint is a strip with no gutter, which is the
  // narrow answer — it lasts one frame and never flashes a wide layout that then collapses.
  useEffect(() => {
    if (pane === null) return;
    if (typeof ResizeObserver === "undefined") {
      setAvailable(pane.clientWidth);
      return;
    }
    const observer = new ResizeObserver(() => setAvailable(pane.clientWidth));
    observer.observe(pane);
    setAvailable(pane.clientWidth);
    return () => observer.disconnect();
  }, [pane]);

  // Position. `pairs` is in the dependencies because a new message changes the geometry without
  // anyone scrolling, and the highlight has to follow it.
  useEffect(() => {
    if (scroller === null) return;
    let frame = 0;
    const read = (): void => {
      frame = 0;
      setReading(
        currentMessage(measure(scroller), {
          scrollTop: scroller.scrollTop,
          clientHeight: scroller.clientHeight,
          scrollHeight: scroller.scrollHeight,
        }),
      );
    };
    const onScroll = (): void => {
      if (frame === 0) frame = requestAnimationFrame(read);
    };
    read();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [scroller, pairs]);

  const current = useMemo(() => promptOf(pairs, reading), [pairs, reading]);

  // Auto-centring, and the reader's veto over it.
  const paused = useRef(false);
  const programmatic = useRef(false);
  const centred = useRef<MessageId | null>(null);

  useEffect(() => {
    if (list === null) return;
    const onScroll = (): void => {
      if (programmatic.current) {
        programmatic.current = false;
        return;
      }
      paused.current = true;
    };
    list.addEventListener("scroll", onScroll, { passive: true });
    return () => list.removeEventListener("scroll", onScroll);
  }, [list]);

  useEffect(() => {
    if (list === null || current === null) return;
    // §16.5: a *changed* current message resumes centring. Someone who scrolled the sidebar away
    // gets it back the moment the conversation moves under them, which is when it is useful again.
    if (centred.current !== current) {
      paused.current = false;
      centred.current = current;
    }
    if (paused.current) return;

    const entry = list.querySelector<HTMLElement>(`[data-pair='${CSS.escape(current)}']`);
    if (entry === null) return;

    const target = Math.max(
      0,
      Math.min(
        entry.offsetTop - list.clientHeight / 2 + entry.offsetHeight / 2,
        list.scrollHeight - list.clientHeight,
      ),
    );
    // Dirty-check: a `scrollTo` that changes nothing fires no event, and the flag it set would then
    // eat the reader's next real scroll and never pause.
    if (Math.abs(list.scrollTop - target) < 1) return;
    programmatic.current = true;
    list.scrollTo({ top: target });
  }, [list, current]);

  const layout = useMemo(
    () => paneLayout({ available, wantGutter, collapsed }),
    [available, wantGutter, collapsed],
  );

  return { layout, current };
}

/** Exported for the sidebar's click handler: centring should not fight a jump the reader asked for. */
export function scrollMessageIntoView(scroller: HTMLElement | null, id: MessageId): void {
  const target = scroller?.querySelector<HTMLElement>(`[data-message='${CSS.escape(id)}']`);
  target?.scrollIntoView({ block: "start" });
}
