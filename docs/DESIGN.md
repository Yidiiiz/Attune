# Interface system

The owner requested a quieter, modern interface on 2026-10-15. Both protected bases
use neutral grayscale surfaces and accents with the same roles and geometry; custom themes override the existing validated tokens.
There are no remote fonts, icon packages or decorative bitmap assets.

| Role | Light | Dark | Use |
|---|---|---|---|
| Canvas `--bg` | `#fafafa` | `#181818` | Page and conversation backdrop |
| Surface `--bg-elevated` | `#ffffff` | `#202020` | Cards, menus, active navigation |
| Inset `--bg-sunken` | `#f1f1f1` | `#141414` | Inputs, segmented controls |
| Text `--fg` | `#242424` | `#ededed` | Primary content |
| Secondary `--fg-muted` | `#686868` | `#b0b0b0` | Labels and supporting content |
| Border `--border` | `#e7e7e7` | `#303030` | Quiet structure |
| Accent `--accent` | `#404040` | `#d4d4d4` | Primary actions, selected state, focus |
| Accent surface `--accent-soft` | `#ededed` | `#2b2b2b` | Selected rows and subtle emphasis |
| Danger `--danger` | `#ba425b` | `#f19aae` | Destructive controls and errors |
| Success `--success` | `#298369` | `#80cdb2` | Completed/successful state |

Use the system sans-serif stack at 14 px with a 1.6 line height. Small, medium and
large radii are 8, 12 and 18 px. Primary actions use accent + accent foreground;
secondary controls use surface + text + a quiet or transparent border. The floating
Add and Schedule toggle are secondary surfaces and blend into the page. Keep shadows soft, reserve strong
color for actions/status, and use sentence case. Keyboard focus remains explicit.

Icons use 24-unit SVG paths, currentColor, rounded strokes, and accessible labels
on their parent controls. Weather uses the same monochrome drawing vocabulary,
including a cloud silhouette. Do not use platform emoji as interface icons.

The fixed 48 px shell bar remains visible during page and conversation scrolling.
The body reserves that height and Chat uses the remaining dynamic viewport height.
The floating 40 px Add control uses the shared medium radius, elevated surface and text color. It remains
24 px from the bottom/right and rotates its plus while open. Its toggle is excluded
from outside dismissal, avoiding a mouse-down close followed by click reopening.
Animations respect reduced-motion preferences. Keep layout independent of theme.

Loading feedback renders at the route boundary. Independent file reads start in
parallel; do not add stale global caches for mutable personal files. For everyday
use, production `npm run build` then `npm run start` avoids development compilation
on the first visit. The Next development indicator is disabled.

Provider configuration: GPT-6.1 Sol is the new chat/extraction default; Claude Opus
5.5 is the Claude option and the Build SDK default. Existing non-factory choices
and conversation models stay intact. OpenAI uses the Responses API with streamed
text/tool calls, encrypted reasoning continuation, strict output schemas and local
Zod validation. Keys use the existing masked editor and secret scan. Live provider
availability is a separate check from mocked transport tests.

Official implementation references:

- [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
- [Reasoning continuation](https://developers.openai.com/api/docs/guides/reasoning)
- [Response streaming](https://developers.openai.com/api/docs/guides/streaming-responses)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Opus 5.5 compatibility](https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5)


The owner's refinement uses Today as the reference. Standard fields, header buttons
and toolbar actions are 32 px high with 13 px labels; composer inputs/actions use a
40 px variant. Segmented groups include their inner padding in the 32 px height.
Use 4, 8, 12, 16 and 24 px spacing tokens; main conversation and document gutters
are 24 px. Compact branch arrows and dense timeline time fields remain intentionally
smaller. Rail icons have no default button padding and the folder outline is centered
on the SVG viewport. Calendar controls wrap onto a second row on phone widths.

The schedule draws an independent hourly ruler from the configured day window,
including empty periods. Empty gap blocks do not repeat a single start label over
the entire day. Task packing, clock-time edits, five-minute dragging and Undo keep
the same semantics. Grid lines and selected controls use quiet neutral surfaces.

Compact refinement: selected shell tabs are 28 px with equal 3 px insets in their group and retain
that fill on hover. Use one small shared shadow (light: 2/8 px at 5%; dark: 2/10 px
at 14%), including search results. Keep ordinary secondary controls borderless
where their grouping already makes them clear. The empty conversation list uses
the same left inset as conversation titles. Model selection sits below the chat
input as quiet 24 px metadata; the document composer has no model selector.

The empty floating composer is 89 px tall on desktop, with no duplicate close
control or permanent keyboard hint. Its toggle, Escape and outside-click behavior
remain. On phones, the input gets its own row, with Send and the compact toggle
separated. Calendar uses equal side columns to center its period independently
of neighboring controls; adjacent-month dates are muted, past dates use a separate subtle neutral surface, and the current date keeps a thin rounded inset highlight.

Settings → Deadlines supplies the local cutoff for untimed due dates. The default
23:59 (11:59 p.m.) ends the due date; explicitly timed tasks retain their own time. Date-only
storage keeps deadlines on the correct Calendar day. Task editing can set or clear
an optional due time and preserves an unchanged explicit timestamp exactly.


The composer mode row now includes model selection. The open 32 px toggle aligns
with the input row; its closed state is 40 px. Top-bar Search and Sync have at least
8 px separation. Selected tabs use equal outer padding on both axes, a 28 px minimum height and
consistent 4 px vertical text padding at desktop and phone widths.

Rolling uses four complete Sunday–Saturday weeks starting with the anchor's week,
with weekday headings and the same cell treatment as Month. Past-day fill differs
subtly from future days; neighboring-month text stays muted. First and last cell
corners match the enclosing grid when highlighted.

Simple Files is the default: useful content folders, task titles, outline chevrons,
readable status/date/duration/priority and a friendly document input label. Title,
details, controls and body share the document column. The Technical file view
setting restores raw metadata, paths and Whole repo. Names and views do not move,
rename or hide underlying data from the technical view.

Terminal sign-in is the default connection. Fixed CLI arguments, isolated temporary
workspaces, disabled native tools and validated structured app-tool requests retain
Attune's proposals/Undo behavior. API remains an explicit alternative. Synthetic
structured answers and app-tool rounds were exercised with both installed clients.
Official Codex references: [CLI commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
and [configuration](https://learn.chatgpt.com/docs/config-file/config-reference).


Quick actions: model selection and the off-by-default Approve for me switch share
one aligned row. Opt-in applies successful proposals through ordinary History/Undo;
failed, interrupted or refused actions do not automatically retry. Build uses the
same switch instead of duplicate Plan/Auto buttons. Slash/Enter outside controls
opens the bottom prompt; Tab/Shift+Tab from its input cycle modes, or cycle main
pages when the prompt is closed and focus is outside controls. Chat keeps its
floating button hidden until the bottom prompt is opened with a shortcut.

Ask uses a quiet borderless answer column, a stable prefetched Open in Chat link,
and padded proposal cards with separated action rows. The app favicon derives its
foreground/background from current theme tokens, including unsaved palette previews.
The Files rail uses a simple page glyph. Today's due items sort earliest first,
remain visible beyond the focus limit, and precede future work. Countdown chips
refresh each minute and on window focus; untimed deadlines stay date-only on disk
with an effective 11:59 p.m. cutoff. Existing explicit timestamps retain their bytes.
