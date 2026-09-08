// Owns: PROJECT.md §16.5's width cascade — how the chat main pane divides itself between the
// message column, the annotation gutter and the sidebar (Decision 66). One function, because §16.4
// and §16.5 each describe one claimant and neither composes with the other when read alone: a
// 300 px gutter taken out of a 640 px column leaves a 340 px reading column, which is not what
// either section means.
//
// Two orders are stated in §16.5 and they are not the same order, which is the thing to hold on to
// when reading the arithmetic below. **Reservation** runs message column → gutter → sidebar: the
// column's 640 comes off the top and is never yielded. **Yield** runs gutter → sidebar: when there
// is not enough left for both, the gutter is the one that hides, and the sidebar keeps its full
// width until well after that. So the gutter's space is always measured against the sidebar's
// *full* claim rather than against what the sidebar currently occupies. Measuring it against the
// current occupancy is the obvious implementation and it is wrong: the sidebar would drop to a
// strip at 920 px and hand the gutter 224 px it did not have at 1000 px, so narrowing the window
// would make a hidden gutter reappear.
//
// The one case where the gutter *does* get the sidebar's space is a collapse the reader asked for.
// That is a control they operate, not a reflow happening to them, which is the distinction §16.5
// draws when it calls the left panel's collapse the release valve.
//
// Failure behavior: pure arithmetic on one number; it cannot fail. A negative or absurd width
// answers with a hidden gutter and a strip sidebar, which is the same answer a very narrow window
// gets and degrades in the right direction — the message column is the thing worth keeping.

/** The message column's reserved share (§16.5). It may grow past this; it never shrinks below it. */
export const COLUMN = 640;
/** §16.4: 300 preferred, 200 minimum, hidden below that rather than overlapping the column. */
export const GUTTER_PREFERRED = 300;
export const GUTTER_MINIMUM = 200;
/** §16.5: full or strip, never anything between, and never chosen from conversation length. */
export const SIDEBAR_FULL = 280;
export const SIDEBAR_STRIP = 36;

export interface PaneLayout {
  /** Gutter width in px, or 0 when there is no room — §16.4 then owes a "N notes hidden" count. */
  gutter: number;
  sidebar: typeof SIDEBAR_FULL | typeof SIDEBAR_STRIP;
  /** True when the sidebar is at its strip width, whatever the cause. */
  strip: boolean;
}

export interface PaneInput {
  /** Width of the main pane — everything right of the rail and the resizable left panel. */
  available: number;
  /** False when the conversation has no annotations at all: no cards, no space asked for. */
  wantGutter: boolean;
  /** The persisted preference. §16.5: it forces strip regardless of how much room there is. */
  collapsed: boolean;
}

export function paneLayout({ available, wantGutter, collapsed }: PaneInput): PaneLayout {
  const width = Number.isFinite(available) ? available : 0;

  // The sidebar's own rule, unchanged from §16.5: full when the message column can still keep its
  // 640, strip otherwise. A collapse preference short-circuits it.
  const full = !collapsed && width >= COLUMN + SIDEBAR_FULL;
  const sidebar = full ? SIDEBAR_FULL : SIDEBAR_STRIP;

  // Always the sidebar's full claim, except when the reader collapsed it — see the header.
  const sidebarClaim = collapsed ? SIDEBAR_STRIP : SIDEBAR_FULL;
  const rest = width - COLUMN - sidebarClaim;

  let gutter = 0;
  if (wantGutter && rest >= GUTTER_MINIMUM) {
    gutter = rest >= GUTTER_PREFERRED ? GUTTER_PREFERRED : Math.floor(rest);
  }

  return { gutter, sidebar, strip: !full };
}
