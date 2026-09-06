# Manual acceptance checklist

`PROJECT.md` §2: only pure modules are required to have automated tests. Everything that needs a
rendering engine, a pointer, or a real console lives here. §17 says Phase 11 writes this file; it
was started in Phase 3 instead, because Phase 3 was the first phase to produce checks that no HTTP
client can answer, and an unverified check that lives only in a chat is an unverified check nobody
will ever run.

**How to read a row.** *Verified* means someone did the steps and saw the result, and the date says
when. *Settled by construction* means the property follows from code that was read and a structural
check that ran, with the visual confirmation still outstanding — it is not a pass. *Pending* means
nobody has done it yet.

Run everything against a throwaway checkout, never `data/`:

```
git init /tmp/attune-manual && cp -r seed /tmp/attune-manual/data
ATTUNE_REPO_DIR=/tmp/attune-manual npm run dev
```

---

## Phase 3 — Today

### 3.1 The weather element arrives without moving the date — **settled by construction, 2026-09-05**

§17: *"clearing the weather location removes the element with no layout shift."*

What was established without a browser:

- The header is a three-column grid, `1fr auto 1fr`, with the date in the `auto` middle
  (`components/today/DayHeader.module.css`). The middle track is sized by its own content and the
  two `1fr` tracks split what is left equally, so the date is page-centred and its position does
  not depend on what is in either side column.
- The weather element is rendered in the **left** column, beside the previous-day arrow
  (`components/today/DayHeader.tsx`) — a side column, which is exactly the case that makes
  `auto 1fr auto` wrong and `1fr auto 1fr` right.
- The Stage B/C check confirmed over HTTP that the header has the same three grid children with
  weather off and with weather on, and that the centre column is unchanged between them.

What still needs eyes, and the one case that can genuinely break it:

1. Open Today with a location set and watch the header as the page loads. The weather element
   fetches after mount, so it appears a moment late; the date must not move when it does.
2. Settings → Weather → Clear. The element disappears; the date must not move.
3. **Narrow the window to about 360px wide and repeat.** This is the residual: `1fr auto 1fr`
   holds the centre only while each side column's content fits inside its share. On a phone-width
   window the left column (arrow + weather ≈ 95px) can exceed its `1fr`, and then the date does
   shift. If it does, the fix is a `min-width: 0` on the side columns and letting the weather wrap
   or truncate — not a different grid.

### 3.2 "Ask about this" opens the composer stub in Ask mode — **pending**

§17: *"a toast or small inline panel reading `Ask mode · <task title>`, no provider call and nothing
written."*

Steps: open Today, click `⋯` on any row, choose **Ask about this**.

Expected: an inline panel appears above the list reading `Ask mode · <that task's title>`, with
"The composer arrives in Phase 5; nothing was sent." and a × that closes it. No network request
leaves the page, and `git log` in the checkout gains no commit.

Not verifiable from here: nothing about it reaches a server, so there is no HTTP observation to
make. What *was* confirmed is that both strings are present in the shipped client chunk
(`.next/static/chunks/app/page.js`) after `npm run build`, which says the code is in the bundle and
nothing more.

### 3.3 Dragging a timeline block writes `scheduled` — **pending**

§10.1: *"Dragging a block's body changes the task's `scheduled` to a date-time and is logged as
`task.update`."*

Steps: give a task an estimate and put it in today's focus; press **Schedule**; drag the block's
body down by roughly an hour and release.

Expected: the block follows the pointer in five-minute steps while dragging, and on release the
list re-reads from the server with the block at its new time. `npm run history -- list` shows one
`task.update`, and the task file's `scheduled` is now `<today>T<HH:mm>`. `npm run history -- undo
<batch>` puts it back.

Also check the keyboard-and-mouse equivalent, which is the same write by a different route: the
`type="time"` input inside each block. That one is worth doing even if the drag is fine, because it
is the only accessible path to the same change.

Not verifiable from here: the write on release is the same `PATCH /api/tasks/[id]` the automated
checks exercise, but the pointer path itself has not been run.

### 3.4 Edge resize — **not built, deliberately**

Do not test it, and do not add it without reading AGENTS.md amendment `k` first: the semantics are
settled there (bottom edge writes `estimateMin`; top edge writes `estimateMin` and `scheduled`
together) precisely so that a future session builds that or nothing.

---

## Phase 4 — Calendar

Everything here needs a pointer or a rendering engine. What could be answered over HTTP already
was, in the Phase 4 checks: yesterday's cell carries the darkened class and the completed task's
title, today's carries the outline, a crowded cell renders five items and a `+3 more` line, and the
`PATCH` a drop fires writes the field, makes one commit and one `task.update`, and undoes cleanly.
None of that touches the drag itself.

Per the headless-browser paragraph in `AGENTS.md`, Phase 4 did not open that question; these rows
are the backlog Phase 6 weighs it against.

### 4.1 Dragging an item to another day writes `scheduled` — **pending**

§17: *"dragging to another day writes `scheduled` and one commit"*.

Steps: open Calendar, pick an item in any cell, drag it onto a different day and release.

Expected: the day under the pointer highlights while the item is over it and its corner reads
`schedule`. On release the grid re-reads from the server with the item in the new cell.
`npm run history -- list` shows one `task.update`, the task file's `scheduled` is the drop date,
and its `due` is untouched. `npm run history -- undo <batch>` puts it back.

Also check the drop that should do nothing: drag an item onto the day it is already on. Nothing is
written and no commit appears — the same-day case is skipped before the `PATCH`.

Not verifiable from here: the write on release is the same `PATCH /api/tasks/[id]` the automated
checks exercise, and they do. The `dragstart` → `dragover` → `drop` sequence itself has not been run.

### 4.2 Shift-drag writes `due`, and says so while the key is held — **pending**

§10.3: *"dropping an item on another day sets `scheduled` (or `due` when `Shift` is held, and the
drop hint says so)"*.

Steps: start dragging an item, hold `Shift` before releasing, and drop on another day.

Expected: the hint in the target cell changes from `schedule` to `set due` **while the key is
held**, and back if it is released before the drop. The write follows whatever the hint last said.

This is the row worth doing carefully: `shiftKey` is read on every `dragover` and again on the
drop, which is what makes the hint honest, and it is exactly the part no HTTP check can see.

### 4.3 A cell folds past five items and expands in place — **pending**

§10.3: *"A cell scrolls internally past five items with a '+N more' line that expands it."*

Steps: give one day eight items and open the calendar on it. Click `+3 more`.

Expected: the cell expands in place — the row grows, the rest of the grid does not reflow oddly —
and scrolls internally rather than running down the page. `Show less` folds it back.

Confirmed structurally: the served HTML for such a day has exactly five items and a `+3 more`
line. That the expanded cell scrolls rather than overflowing is a layout property and needs eyes.

### 4.4 The keys and the arrows move the view — **pending**

§10.3: *"scrolling by a week with ↑/↓ … Arrows move by the current unit; a Today button returns."*

Steps: on Rolling, press `↓` then `↑`. Then click the arrows in Month and in Week, and the Today
button from each.

Expected: `↓` moves the view forward a week, `↑` back. The arrows move a week in Rolling and Week
and a calendar month in Month. Today returns to the current period in whichever view is showing.
Then put the cursor in the toolbar's Reschedule date field and press `↑`: the field changes and
the view does **not** move.

Confirmed structurally: the arrows and the Today button are `<Link>`s, so their targets are in the
served HTML and were checked there; the keys are a `keydown` listener and were not.

### 4.5 Clicking an item selects it and the toolbar acts on it — **pending**

§10.3: *"Clicking an item selects it and shows the Today `⋯` menu actions in a small toolbar."*

Steps: click an item. Run each action in turn — Complete, Duplicate, Reschedule, Ask about this,
Delete — and then Edit.

Expected: the toolbar appears below the grid naming the item. Each action behaves as the Today
row menu does, including the toast on a failure. **Edit** replaces the toolbar with the same
`TaskEditForm` Today uses; a save containing a credential-shaped string is refused with the message
inline and every character still in the field (§11.5, Decision 50) — the amendment `j` case on a
second surface. The refusal itself was checked over HTTP; that the message lands in the form rather
than in a toast is what needs eyes.

---

## Phase 1 — carried forward

### 1.1 `Ctrl+C` on `npm run dev` from Git Bash (mintty) flushes the push — **pending**

Phase 1 verified this from PowerShell against a real console `CTRL_C_EVENT`. Phase 2 re-ran it
against a local bare remote and it pushed correctly, but by `CTRL_BREAK_EVENT`: Windows disables
`Ctrl+C` for a process group spawned with `CREATE_NEW_PROCESS_GROUP`, so a script cannot deliver
the real thing. mintty is a pty rather than a console, so this one needs a person at a terminal.

Steps: configure a local bare repository as `origin`, run `npm run dev` from Git Bash, make a
change that commits, then press `Ctrl+C` in that window.

Expected: `git rev-list --count @{u}..HEAD` is 0, and no `node` process from the dev tree survives.
Both signals enter the same handler in `scripts/dev.mjs`, so a pass here confirms the path Phase 2
could only reach by the other event.
