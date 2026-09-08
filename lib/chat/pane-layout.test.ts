import { describe, expect, it } from "vitest";
import {
  COLUMN,
  GUTTER_MINIMUM,
  GUTTER_PREFERRED,
  SIDEBAR_FULL,
  SIDEBAR_STRIP,
  paneLayout,
} from "./pane-layout.ts";

const at = (available: number, over: { wantGutter?: boolean; collapsed?: boolean } = {}) =>
  paneLayout({ available, wantGutter: over.wantGutter ?? true, collapsed: over.collapsed ?? false });

describe("paneLayout", () => {
  it("gives everything its preferred share when there is room", () => {
    const wide = at(1600);
    expect(wide).toEqual({ gutter: GUTTER_PREFERRED, sidebar: SIDEBAR_FULL, strip: false });
  });

  it("shrinks the gutter to its minimum before hiding it", () => {
    // 640 + 280 + 300 = 1220 is everything at once; 1120 is everything with the gutter squeezed.
    expect(at(1220).gutter).toBe(GUTTER_PREFERRED);
    expect(at(1180).gutter).toBe(1180 - COLUMN - SIDEBAR_FULL);
    expect(at(1120).gutter).toBe(GUTTER_MINIMUM);
    expect(at(1119).gutter).toBe(0);
  });

  it("hides the gutter before the sidebar drops to a strip", () => {
    // §16.5's yield order, and the one thing the two sections had to be reconciled about.
    const squeezed = at(1000);
    expect(squeezed.gutter).toBe(0);
    expect(squeezed.sidebar).toBe(SIDEBAR_FULL);

    const narrower = at(900);
    expect(narrower.sidebar).toBe(SIDEBAR_STRIP);
    expect(narrower.strip).toBe(true);
  });

  it("never lets narrowing the window bring a hidden gutter back", () => {
    // The trap the module header names: measuring the gutter against what the sidebar currently
    // occupies rather than against its full claim makes 900 px roomier than 1000 px.
    let previous = Number.POSITIVE_INFINITY;
    for (let width = 1600; width >= 400; width -= 1) {
      const { gutter } = at(width);
      expect(gutter).toBeLessThanOrEqual(previous);
      previous = gutter;
    }
  });

  it("keeps the message column's 640 whatever else is asked for", () => {
    for (const width of [1600, 1220, 1119, 1000, 920, 800]) {
      const { gutter, sidebar } = at(width);
      if (gutter > 0 || sidebar === SIDEBAR_FULL) expect(width - gutter - sidebar).toBeGreaterThanOrEqual(COLUMN);
    }
  });

  it("asks for no gutter when the conversation has no annotations", () => {
    expect(at(1600, { wantGutter: false }).gutter).toBe(0);
    expect(at(1600, { wantGutter: false }).sidebar).toBe(SIDEBAR_FULL);
  });

  it("forces the strip when the reader collapsed it, and hands the gutter what that frees", () => {
    const collapsed = at(1000, { collapsed: true });
    expect(collapsed.sidebar).toBe(SIDEBAR_STRIP);
    expect(collapsed.strip).toBe(true);
    // 1000 − 640 − 36 = 324, so the gutter gets its preferred width at a width where an
    // uncollapsed sidebar left it nothing. That is the release valve working, not a reflow.
    expect(collapsed.gutter).toBe(GUTTER_PREFERRED);
    expect(at(1000).gutter).toBe(0);
  });

  it("degrades toward the message column at absurd widths", () => {
    for (const width of [0, -100, Number.NaN]) {
      expect(at(width)).toEqual({ gutter: 0, sidebar: SIDEBAR_STRIP, strip: true });
    }
  });
});
