# Interface system

The owner requested a quieter, modern interface on 2026-10-15. Both protected bases
use the same roles and geometry; custom themes override the existing validated tokens.
There are no remote fonts, icon packages or decorative bitmap assets.

| Role | Light | Dark | Use |
|---|---|---|---|
| Canvas `--bg` | `#f7f8fc` | `#14161e` | Page and conversation backdrop |
| Surface `--bg-elevated` | `#ffffff` | `#1c1f2b` | Cards, menus, active navigation |
| Inset `--bg-sunken` | `#eef0f6` | `#10121a` | Inputs, segmented controls |
| Text `--fg` | `#202433` | `#eef0f7` | Primary content |
| Secondary `--fg-muted` | `#626b80` | `#abb3c8` | Labels and supporting content |
| Border `--border` | `#e5e8f0` | `#2c3142` | Quiet structure |
| Accent `--accent` | `#6356d9` | `#aba0ff` | Primary actions, selected state, focus |
| Accent surface `--accent-soft` | `#eeecfc` | `#2b2545` | Selected rows and subtle emphasis |
| Danger `--danger` | `#ba425b` | `#f19aae` | Destructive controls and errors |
| Success `--success` | `#298369` | `#80cdb2` | Completed/successful state |

Use the system sans-serif stack at 14 px with a 1.6 line height. Small, medium and
large radii are 8, 12 and 18 px. Primary actions use accent + accent foreground;
secondary controls use surface + text + border. Keep shadows soft, reserve strong
color for actions/status, and use sentence case. Keyboard focus remains explicit.

Icons use 24-unit SVG paths, currentColor, rounded strokes, and accessible labels
on their parent controls. Weather uses the same monochrome drawing vocabulary,
including a cloud silhouette. Do not use platform emoji as interface icons.

The fixed 48 px shell bar remains visible during page and conversation scrolling.
The body reserves that height and Chat uses the remaining dynamic viewport height.
The floating 56 px Add control uses the shared large radius and palette. It remains
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
