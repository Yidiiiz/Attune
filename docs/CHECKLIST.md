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

**Direct acceptance review, 2026-10-15.** Dated verification notes and status headings below
supersede phase-era “not verifiable” or “still needs eyes” prose retained as historical context.
The checks use the existing isolated Playwright checkout. Controlled extraction and scripted turns
prove UI and file behavior, not real model understanding. Provider, audio, microphone, native OS
drag and terminal residuals are kept explicit. Screenshot evidence is retained locally under
`.agent/acceptance-current-screenshots/`; the crash probe is `.agent/acceptance-crash-result.json`.

Run everything against a throwaway checkout, never the owner's `data/`:

```
git init /tmp/attune-manual && cp -r seed /tmp/attune-manual/data
ATTUNE_REPO_DIR=/tmp/attune-manual npm run dev
```

---

## Phase 3 — Today

### 3.1 The weather element arrives without moving the date — **verified in Chromium, 2026-10-15**

**Current evidence:** Controlled late weather arrival at 1280 and 360 px, then Settings Clear: date center stays within one pixel. The 47 px phone shift was reproduced and fixed with a second control row. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

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

### 3.2 Ask about this opens the real composer in Ask mode — **verified in Chromium, 2026-10-15**

The Phase 3 stub was replaced in Phases 5/6a. Today and Calendar open the real sheet in Ask
mode carrying the selected task. Today sends, streams and opens the same conversation in Chat;
a second question within the navigation session reuses it. See 6a.3 and the composer/planning specs.

### 3.3 Dragging a timeline block writes `scheduled` — **verified in Chromium, 2026-10-15**

**Current evidence:** Actual pointer drag follows the five-minute grid, writes one task.update on release, and Undo restores bytes. The accessible time input writes the new time too. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

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

### 4.1 Dragging an item to another day writes `scheduled` — **partially verified, 2026-10-15 — residual pending**

**Current evidence and limit:** HTML5 dragstart/dragover/drop events write scheduled, preserve due and Undo exactly; same-day drop issues no PATCH. Native mouse/dragTo attempts stalled inside Chromium input and timed out. A real OS pointer drag remains pending.

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

### 4.2 Shift-drag writes `due`, and says so while the key is held — **partially verified, 2026-10-15 — residual pending**

**Current evidence and limit:** Browser HTML5 events show schedule/set due changing in both directions and the final due write preserving scheduled. Actual OS drag with the physical Shift modifier remains pending with 4.1.

§10.3: *"dropping an item on another day sets `scheduled` (or `due` when `Shift` is held, and the
drop hint says so)"*.

Steps: start dragging an item, hold `Shift` before releasing, and drop on another day.

Expected: the hint in the target cell changes from `schedule` to `set due` **while the key is
held**, and back if it is released before the drop. The write follows whatever the hint last said.

This is the row worth doing carefully: `shiftKey` is read on every `dragover` and again on the
drop, which is what makes the hint honest, and it is exactly the part no HTTP check can see.

### 4.3 A cell folds past five items and expands in place — **verified in Chromium, 2026-10-15**

**Current evidence:** Eight items fold to five and expand in place; sixteen items demonstrate actual internal scrolling within the 220 px bound. Show less restores the fold. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§10.3: *"A cell scrolls internally past five items with a '+N more' line that expands it."*

Steps: give one day eight items and open the calendar on it. Click `+3 more`.

Expected: the cell expands in place — the row grows, the rest of the grid does not reflow oddly —
and scrolls internally rather than running down the page. `Show less` folds it back.

Confirmed structurally: the served HTML for such a day has exactly five items and a `+3 more`
line. That the expanded cell scrolls rather than overflowing is a layout property and needs eyes.

### 4.4 The keys and the arrows move the view — **verified in Chromium, 2026-10-15**

**Current evidence:** Rolling up/down keys, Month and Week arrows, Today reset, and up-arrow inside the Reschedule input were exercised against URL/state transitions. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§10.3: *"scrolling by a week with ↑/↓ … Arrows move by the current unit; a Today button returns."*

Steps: on Rolling, press `↓` then `↑`. Then click the arrows in Month and in Week, and the Today
button from each.

Expected: `↓` moves the view forward a week, `↑` back. The arrows move a week in Rolling and Week
and a calendar month in Month. Today returns to the current period in whichever view is showing.
Then put the cursor in the toolbar's Reschedule date field and press `↑`: the field changes and
the view does **not** move.

Confirmed structurally: the arrows and the Today button are `<Link>`s, so their targets are in the
served HTML and were checked there; the keys are a `keydown` listener and were not.

### 4.5 Clicking an item selects it and the toolbar acts on it — **verified in Chromium, 2026-10-15**

**Current evidence:** Toolbar Duplicate, Reschedule, Ask, Complete, Delete and Edit were exercised. A real credential-shaped save refusal stays inline without echoing the match or losing text. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

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

## Phase 5 — Composer

Stage A was checked over HTTP and is not repeated here: the context endpoint, one prompt becoming
one batch and one undo, the named refusals from `/api/agent/apply`, the key routes, the §7.2 undo
guard, uploads and their undo, and both halves of the key check — no key set, and a key the provider
rejected. What is left needs a pointer, a microphone, or a browser that can actually slide a sheet.

### 5.1 The + button, and where it is not — **verified in Chromium, 2026-10-15**

**Current evidence:** Measured 56 px layout circle, 24 px offsets and z-index 30; open/close state and screenshot inspected. Existing chat checks cover its absence on Chat/settings. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§15 and §17: *"The + button is absent on Chat, present on Today and Calendar."*

Established over HTTP, on the served HTML of all four pages: `data-composer="button"` appears once
on `/` and once on `/calendar`, and zero times on `/chat` and `/settings`. It is enforced by where
the component is mounted — `app/page.tsx` and `app/calendar/page.tsx` render it and no layout does —
so there is no runtime condition that could go wrong differently in a browser.

What still needs eyes: that it sits bottom-right at 24px, is a 56px circle, and floats above the
list rather than under it (z-tier 30). Then click it and watch it rotate 45° as the sheet opens.

### 5.2 The sheet opens, closes, and keeps a draft — **verified in Chromium, 2026-10-15**

**Current evidence:** Esc, close button, empty/non-empty outside click, draft reload and remembered mode all exercised. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§9.1: *"Closes on `Esc`, on button click, and on outside click **only if the textarea is empty**. A
sheet with typed text stays open and its draft persists in `localStorage` under `composer.draft`."*

Steps, in this order, because the third is the one that is easy to get backwards:

1. Open the sheet, type nothing, click the page behind it. It closes.
2. Open it, type `pset 4`, click the page behind it. **It stays open.**
3. With that text still in it, press `Esc`. It closes — `Esc` is unconditional, an outside click is
   not. Reload the page and open the sheet: `pset 4` is still there.
4. Press the + button again while open. It closes, and the button is back to a plus.

Not verifiable from here: all four are pointer and key events against a rendered sheet.

### 5.3 The mode control and remembered selection — **verified in Chromium, 2026-10-15**

Tasks, Ask and Build are now enabled. Tasks previews and Ask conversation reuse are exercised
in the acceptance specs; the existing Build checks exercise its two gates and Auto confirmation.
Selecting Ask survives reload. The old Phase 9 placeholder/tooltip is superseded.

### 5.4 Ask mode refusal stub — **superseded by verified 6a.3**

The temporary Phase 6 refusal was replaced by real streaming Ask. Task context and the current
sheet behavior were exercised from Today and Calendar on 2026-10-15; see 6a.3.

### 5.5 A prompt becomes a preview, and a follow-up revises it — **verified with live terminal provider and separate UI checks, 2026-10-15**

**Current evidence:** Real extraction returned six estimated drafts; a follow-up preserved titles/estimates and changed all deadlines to Friday. One ordinary batch added all six and one Undo removed them. Real Watchlist extraction/application/Undo and `read Dune` clarification passed. Existing controlled browser checks cover editable/inferred cards and in-flight merge; the real-provider check used HTTP, not a live-provider browser run. Evidence: `.agent/provider-http-acceptance-result.json`.

§17: *"six tasks from one prompt → one batch → one undo removes all six; a follow-up revises the
preview in place; 'add these three movies to my watchlist' proposes a collection write; 'read Dune'
returns a question."*

Steps, with terminal sign-in or API access: type `pset 4 due friday, laundry, call mum, book flights, gym, groceries`
and send. Then, with the cards up, type `make them all Friday` and send again.

Expected: six cards, each field editable. Fields the model filled in from context carry a dotted
underline and a tooltip reading `Inferred from: <field>`. The follow-up **replaces the cards in
place** — the same cards, revised — rather than starting a second list. Then the two shapes that are
not tasks: `add these three movies to my watchlist` shows a collection card whose Add writes the
collection (enabled in Phase 7; the same card is checked in the chat tray by `e2e/knowledge.spec.ts`),
and `read Dune` comes back as a question with the textarea inviting an answer.

**The case worth doing deliberately** (§9.5 step 4, `mergeDraft`): after sending the follow-up, edit
a card's title *while the spinner is still showing*. When the answer lands, that edit must survive —
the model did not touch the title, so the merge keeps what is on screen. This is unit-tested in
`components/composer/draft.test.ts`, but only the browser exercises the timing that makes it real.

### 5.6 Attachments, drop, paste, and dictation — **partially verified, 2026-10-15 — residual pending**

**Current evidence and limit:** Picker upload, controlled window Files drop and clipboard-image events attach real files; text paste is not intercepted, and chip removal preserves disk bytes/history. Actual microphone dictation and OS clipboard/drop gestures remain pending.

§9.2. Four ways in, one of which is absent on most browsers.

1. Click the paperclip and choose a file. A chip appears with its name.
2. Drag a file anywhere over the window with the sheet open: a full-window overlay reading
   `Drop to attach` appears on `dragenter`. Drop it; a chip appears.
3. Copy an image and paste into the textarea: it attaches rather than inserting text. Paste ordinary
   text into the same box: it inserts, and nothing is attached.
4. If the browser has `SpeechRecognition` (Chrome and Edge do; Firefox does not), a mic button is
   present — **absent**, not disabled, where it is not supported. Toggle it and speak; the words land
   in the textarea.

Then remove a chip and confirm the file is **still on disk** under `data/files/` — §9.2 says removing
a chip does not delete the file, and `npm run history -- list` still shows the `file.add`.

Confirmed over HTTP already: the upload itself stores by content hash, regenerates the manifest, and
undoes cleanly, and the `added` column now records the date in the settings timezone rather than in
UTC — checked at 02:26 UTC, which is the previous day in New York, and recorded as that previous day.

### 5.7 A key error toasts; everything else stays inline — **verified in Chromium, 2026-10-15**

**Current evidence:** A controlled auth response appears as a toast and keeps the prompt; the real Add secret rejection appears inline. This is UI routing evidence, not a real key rejection by a provider. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§13.5, as the Phase 5 approval settled it: *"the principle is not 'which surface' but 'where the
remedy is'."*

Verified over HTTP: with no key, `/api/agent/extract` answers 401 `code: "auth"` with the message
`No API key set. Add one in Settings → API keys.` and makes no provider call. With a garbage key in
`.env.local`, the same route answers 401 `code: "auth"` with `The API key was rejected.` — and in
both cases no task file, no log line and no commit appeared.

What needs eyes: that those two land as a **toast** in the corner and not inline in the sheet, while
5.4's Ask refusal and 5.8's credential refusal land **inline**. Same sheet, same session, different
destinations — that is the whole rule, and it is the one thing about it a browser has to show.

### 5.8 A credential in the prompt is refused, and the text survives — **verified in Chromium, 2026-10-15**

**Current evidence:** Controlled preview followed by real runBatch secret rejection: no log write, cards stay, match is not echoed, and the submitted prompt returns without replacing a newer draft. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

Amendment `j`, on its third surface. Phase 3 covered the inline task edit; Phase 8 covers the
document view; this is the composer, and it arrives by a different route than either — the prompt is
written into `meta.prompt`, which `runBatch` scans before a byte reaches the log (§7.1 step 3).

Verified over HTTP: `POST /api/tasks` carrying a credential-shaped string in `prompt` answers 422
`secret_rejected`, names the pattern (`anthropic key`) without echoing the match, writes no file and
makes no commit.

Steps that need a browser: put a key-shaped string into the composer prompt, get a preview, and press
**Add all**.

Expected: the message appears **inline in the sheet**, naming the file and the pattern and never the
matched text. Every card is still there, still holding its edits, and **the prompt still holds every
character that was typed**. Nothing is cleared on the user's behalf (Decision 50).

### 5.9 Add, and Discard — **verified in Chromium, 2026-10-15**

**Current evidence:** Controlled three-card extraction, selection label changes, one real batch for Add, and Discard dismissed/accepted with no write were exercised. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§9.5 step 5. With a preview of several cards up: untick two, and the button reads **Add selected**
rather than **Add all**; tick them again and it changes back. Press it, and the sheet closes with the
new tasks in today's list. `npm run history -- list` shows one batch.

Then make another preview and press **Discard**: a confirmation appears, and on confirming the
preview is dropped. `npm run history -- list` gains **nothing** — nothing reached disk, so there is
nothing to undo, and §9.5 records that as a deliberate deviation from the brief.

### 5.10 The API keys section — **verified in Chromium, 2026-10-15**

**Current evidence:** Dummy Set/Change/Remove values stay masked and clear from the field; unrelated .env.local lines survive. Name-only history excludes values, and both HTTP and the History UI refuse Undo with the reason. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§11.5. Settings, then API keys.

Steps: the row reads `not set`. Press **Set**, paste a key, press Save. The row reads the mask and
the last four, and the field is empty. Press **Change**, save a different key, and confirm the mask
changed. Press **Remove** and confirm the dialog.

Expected at each step: the value is never displayed, `.env.local` in the checkout holds it and any
unrelated lines are untouched, and `npm run history -- list` shows `settings · set ANTHROPIC_API_KEY`
with **no commit** — `.env.local` is git-ignored. Then try to undo that entry: it is refused, and the
message says a key change records only the name, so there is nothing to restore.

The refusal and the log shape were checked over HTTP. What needs eyes is the section itself: the
field is a password input, it clears on success, and an error lands inline beside it rather than as
a toast — the remedy for a bad key typed *here* is right here.

---

## Phase 6a — Chat: tree, store, linear chat

**Most of this phase is checked automatically, and that is new.** `npm run check:ui` runs nine
browser checks against a throwaway checkout with `ATTUNE_FAKE_PROVIDER` set (Playwright, chromium,
deliberately outside `npm test`). They cover, as of 2026-09-07: the `+` button's absence on Chat and
presence on Today and Calendar; a send streaming and finishing and naming its conversation; markdown
and KaTeX rendering with the HTML sanitized; a rejected key toasting while the composer keeps the
text and no message file survives; a failure after deltas leaving a `failed` message with a working
Retry; Stop keeping the partial reply; navigating away mid-stream ending the turn instead of leaving
it running; a credential refused inline with every character kept and the match never echoed; and
rename, pin and delete from the panel.

Rows below are what those cannot answer.

### 6a.1 The rail and its panel — **verified in Chromium, 2026-10-15**

**Current evidence:** Pointer resize clamps to 240/420; width and collapsed state survive reload. The current rail includes Chats, Knowledge, Files and Graph. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§10.2: *"a 44 px icon rail on the far left, a resizable panel (240–420 px, collapsible, width in
`localStorage`)"*.

Steps: drag the panel's right edge wider and narrower; release. Reload. Click the Chats icon.
Reload again.

Expected: the drag stops at 240 and at 420 rather than going past either. The width survives the
reload. The icon collapses the panel and the collapsed state survives too. Chats, Knowledge, Files and Graph are present now; the Phase 6 single-icon placeholder is superseded.

### 6a.2 The composer grows, and the keys do what §16.7 says — **verified in Chromium, 2026-10-15**

**Current evidence:** Measured one/ten/twenty-line growth and internal scroll cap; Shift+Enter inserts a newline without sending, Enter sends. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§9.2 and §16.7: an auto-growing textarea of 1–10 rows, `Enter` sends, `Shift+Enter` newlines.

Steps: type one line, then paste ten lines, then twenty. Press `Shift+Enter` twice and type. Press
`Enter`.

Expected: the box grows with the text and stops growing at ten rows, scrolling inside itself after
that. `Shift+Enter` makes a newline and does not send. `Enter` sends. This is measured layout, which
is why it is here and not in the browser checks: they can press the keys but not tell you the box
looks right at ten rows.

### 6a.3 Ask mode from the composer sheet — **verified in Chromium, 2026-10-15**

**Current evidence:** Today Ask carries the task, streams a scripted response in the sheet, opens the real conversation, and a second question after client navigation reuses it. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§9.6, and the row Phase 5 left as 5.4 saying "a send there refuses inline, naming Phase 6". It does
not refuse any more.

Steps: on Today, open a row's `⋯` menu and choose **Ask about this**. Pick Ask if it is not already
selected, type a question and send. Then press **Open in Chat**. Then come back to Today and ask a
second question about the same task.

Expected: the reply streams inside the sheet, under a heading naming the task. **Open in Chat** goes
to `/chat?c=…` with that conversation open and the exchange in it, and the Chats panel lists it like
any other conversation (Decision 37). The second question about the same task continues the same
conversation rather than starting a second one — within this browser session, which is what §9.6
means by "the same task within the session".

### 6a.4 A conversation reads well in both themes — **verified in Chromium, 2026-10-15**

**Current evidence:** Heading, list, wide code, table and KaTeX were rendered, measured for pane containment and inspected in both themes. Responses are scripted. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

Steps: with a reply on screen containing a heading, a list, a code block, a table, inline math and a
display equation, switch between the light and dark themes.

Expected: every element is legible in both, the code block and the table scroll inside themselves
rather than widening the column, and a display equation too wide for the pane scrolls rather than
stretching it. KaTeX ships its own stylesheet, which is the part most likely to disagree with a
theme, so this is worth doing deliberately.

### 6a.5 A long conversation scrolls sensibly — **verified in Chromium, 2026-10-15**

**Current evidence:** Eight live scripted turns plus a slow reply show that scrolling upward is respected across later deltas. A separately logged 200-message fixture is navigable; long mid-conversation editor focus preserves a nonzero scroll position. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

Steps: send eight or ten messages, then scroll up and send another.

Expected: the newest message is brought into view as it streams, and the scroller does not fight a
person who has scrolled up to read something. §16.0 rule 6 says no virtualization in v1, so this is
also the check that a few hundred messages stay comfortable.

### 6a.6 What a crash leaves behind, and the sweep that repairs it — **verified in Chromium, 2026-10-15**

**Current evidence:** Real abrupt owned-server termination left two unlogged streaming files. scripts/dev.mjs repaired two messages plus the saved leaf in one batch; failed/Retry UI is visible. Clean restart announces nothing; Undo restores all message and metadata bytes. This is not a mintty Ctrl+C observation. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

Decision 63's invariant — a message on disk that is not in the log is always `status: streaming` —
is what lets `lib/history/streaming.ts` recognise an abandoned turn at startup, and Decision 64 is
the sweep that repairs one.

Steps: start a slow reply and abruptly stop its owned dev-server process tree while it is streaming. **Before
restarting**, look at `data/chats/<id>/messages/` and at `npm run history -- list`. Then
`npm run dev` again and open the conversation.

Expected, in that order:

1. Before the restart: both files of that turn are on disk with `status: streaming`, and the log has
   **no** entry for them. That is the wound — and on its own it is invisible, because a `streaming`
   message renders exactly like a reply that is still arriving.
2. The restart prints one line naming how many interrupted messages it repaired, in the same place
   `dev` reports a stale index lock.
3. The conversation now shows the prompt as an ordinary message and the reply as **unfinished, with
   a Retry** — the state §16.3 would have left had the process survived long enough to finalize.
4. `npm run history -- list` gains one `chat.update` batch whose summary names the repair, and
   `git status --porcelain -- data` is clean: the sweep went through `runBatch`, so the repair is
   recorded and undoable while personal data stays ignored by git, and `npm run history -- undo <batch>` puts the
   files back to `streaming` if you want to see the before state again.

Also worth doing once: start the dev server with no interrupted messages anywhere and confirm it
prints **nothing**. A repair that announces itself when it did nothing is a line people learn to
ignore.

---

## Phase 6b — Chat: branching, sidebar, annotations

**Most of Phase 6b is checked automatically.** `npm run check:ui` now runs **32 browser checks in
about 2 minutes 30** — inside Decision 67's five minutes, so the whole suite still runs every time.
Four spec files carry them: `branching.spec.ts` (six), `sidebar.spec.ts` (six), `annotations.spec.ts`
(eight) and `attachments.spec.ts` (three), beside `chat.spec.ts`'s nine from Phase 6a.

Two things about that number are worth keeping. It has been observed at **7 to 8 minutes** on the
same machine with a stray `next dev` competing for the disk — the timings, not the failures, are the
tell, which is what `scripts/check-ui.mjs` refuses a busy port over. And `expect.timeout` is 15
seconds rather than 10 because a single `runBatch` commit has been seen taking eight; that is a
failure guard, not a measurement, and a correct run never spends it.

**Stage A (branching) is checked automatically.** `e2e/branching.spec.ts` adds six browser checks to
`npm run check:ui`. They cover: editing a prompt producing a sibling
with the original still reachable; regenerating producing a reply sibling under the same prompt;
branch-from-here forking the tail, with the switch surviving a reload; branching from the first
message producing a second root (§15); three branches producing one commit per finalized turn, read
from the sandbox's `git log` (§15); and a delete refused for having replies under it, landing in a
toast with the message still on screen.

Rows below are what those cannot answer.

### 6b.1 The `⋯` menu appears when it should, and reaches where it must — **verified in Chromium, 2026-10-15**

**Current evidence:** Hover reveal and native Shift+Tab/Tab/Enter reach; prompt/reply menus at 240 and 420 panel widths stay in the viewport in both themes. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§10.2's per-message actions, and the hover reveal added with them.

Steps: hover a prompt and a reply; tab to the menu button with the keyboard; open the menu on the
first message in a conversation and on the last; open it on a reply while the left panel is at its
widest (420 px) and at its narrowest (240 px).

Expected: the button fades in on hover and is reachable by keyboard without a mouse ever moving.
The menu opens *into* the row — leftward from a prompt, rightward from a reply — and is fully on
screen in every one of those four positions. This is the one the browser checks found the hard way:
a right-anchored menu on a left-aligned reply opened across the panel, which reads as a z-index
problem and is actually a menu opening the wrong way.

### 6b.2 The editor is a box you can leave — **verified in Chromium, 2026-10-15**

**Current evidence:** Long mid-conversation focus keeps scroll and places caret at end; Shift+Enter, Esc and unchanged resend producing a sibling were exercised. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§16.2's edit-and-resend and branch-from-here, which share `MessageEditor`.

Steps: open Edit on a long prompt; watch where the caret lands and whether the page moved. Type a
newline with `Shift+Enter`. Press `Esc`. Open it again, and press Enter on unchanged text.

Expected: focus arrives without the scroller jumping (`preventScroll`), with the caret at the end.
`Shift+Enter` makes a newline, `Enter` sends, `Esc` closes and discards. Resending unchanged text
is allowed and makes a genuine sibling — there is no "nothing changed" refusal, because two
identical prompts with different replies is a thing people do on purpose.

### 6b.3 A branch bar on a busy conversation still reads — **verified in Chromium, 2026-10-15**

**Current evidence:** Four reply alternatives and two root prompt alternatives; keyboard arrows, disabled ends and constant count width were exercised. Existing branch checks cover newest-leaf navigation. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§16.2's `‹ k/n ›`, which the checks assert the text of but not the look of.

Steps: build a conversation with four branches at one point and two at another; switch through all
of them with the arrows; then switch with the keyboard alone.

Expected: the arrows disable at the ends rather than wrapping. The count is tabular, so it does not
jitter between `1/4` and `4/4`. Switching is one click, and the conversation under it re-renders to
the newest leaf of that branch rather than to the branch point.

### 6b.4 Branching, the gutter and the sidebar in both themes — **verified in Chromium, 2026-10-15**

**Current evidence:** Both themes inspected with branch/menu/sidebar controls, focused editors, gutter notes and the explicit moved-anchor flag. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

Steps: with a branched, annotated conversation open, switch the theme.

Expected: the branch bar, the `⋯` button and the open menu all keep their contrast in both; the
editor's focused border is visible against both grounds; a gutter card and its "anchor moved" flag
read against both; the sidebar's current row stays distinguishable from its neighbours.

### 6b.5 Read aloud actually makes a sound — **pending**

§10.2's `speechSynthesis` control. The browser checks assert the observable half — the button is
there, it flips to Stop and back, and it is *absent* where the browser has no speech synthesis — and
that is genuinely all a headless run can claim. This row is the other half, and it is here rather
than pretended at (Phase 6b approval, answer 4).

Steps: press ▶ on a reply with sound on. Press ◼ before it finishes. Press ▶ on a second reply while
the first is still speaking. Navigate to another conversation mid-sentence.

Expected: it speaks the reply's words. Stop is immediate, not at the end of the sentence. Starting a
second cancels the first rather than overlapping it. Navigating away stops it — the utterance
belongs to the message, and the message is gone.

### 6b.6 The annotation composer where the pointer is — **verified in Chromium, 2026-10-15**

**Current evidence:** Measured first-line selection placement, focus without scrolling, retained two-line draft on outside click, empty/Esc dismissal, and saved card at the draft position. The initial 25 px displacement was reproduced and fixed. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§16.4's last bullet, which is about placement in a way no assertion captures.

Steps: select a phrase in the middle of a long reply and annotate it. Watch where the box opens and
whether the page moved. Type two lines, then click into the conversation. Then press `Esc`. Open it
again, type nothing, and click away.

Expected: the box opens beside the selection with the caret in it and the conversation does not
scroll (`preventScroll`). Clicking away with text in the box **keeps** it — the note is not
discarded because someone looked back at the sentence. `Esc` closes it. Clicking away while it is
empty closes it. When it becomes a card, the card is where the box was, in one frame.

### 6b.7 A picture actually arrives — **supported terminal attachments verified; API PDF inference pending, 2026-10-15**

**Current evidence and limit:** GPT-6.1 Sol and Claude Opus 5.5 both transcribed text visible only in a synthetic PNG through actual attachment loading. Claude read a synthetic PDF heading. Codex terminal PDF returned explicit `unsupported` without dropping the file; it requires API mode. API PDF inference remains unverified. The four capability checks passed; the original cleanup assertion hit the shared-manifest Undo guard, then sandbox-only cleanup verified exact manifest bytes before Undo. The original run is not called clean. See `.agent/provider-attachment-acceptance-result.json` and `.agent/provider-attachment-cleanup-result.json`.

Amendment `o`. Repeat with terminal sign-in or API access, using a supported image/PDF transport.

Expected: the answer quotes something only visible in the file. If it does not, the attachment is
being dropped somewhere between `loadAttachments` and the provider — and the whole point of the
refusal path is that this should never be a silent failure.

---

## Phase 7 — Knowledge base and collections

**The write paths and the surfaces are checked automatically.** `e2e/knowledge.spec.ts` adds eight
browser checks to `npm run check:ui`: the auto-apply toast, with no buttons, and the marker's Undo
restoring `habits.md` by SHA-256; the transcript marker surviving a reload and its own Undo; the same
marker under the sheet's Ask answer, with its Undo; a note card's Add writing the note
and its map link, and the same note proposed again arriving as an append that says why; a note with no
map refused on its card with the edited text kept; a collection card starting a collection; Distill to
knowledge proposing the summary in the conversation's tray, with Discard asking first only for a
distill; and Ask mode's task proposals drawn and added in the sheet. `e2e/toast.spec.ts` adds four
more, one per window size: with a toast held on screen, it asks the page what is on top at fifteen
points on Send, then clicks by coordinate. The library half is `lib/agent/auto-apply.test.ts` and
`lib/agent/distill.test.ts`. §17's other Phase 7 checks were run over HTTP and the CLI at Stage A
(AGENTS.md).

**Amendment `u`'s Stop check is a known flake** (Decision 83): `check:ui` runs it after the rest,
under its own heading, and its result never sets the exit code. A clean run reads `clean`.

**Those browser proposals use the scripted provider.** The dated rows below now add actual terminal-provider evidence with synthetic sandbox data; they do not claim owner-context inference.

### 7.1 A real model searches before it proposes a note — **verified in synthetic live terminal scenarios, 2026-10-15**

**Current evidence:** Actual search preceded a valid mapped thesis note proposal. After applying it, a new conversation repeating the synthetic fact proposed no duplicate or write. The first probe exposed an invalid note directory; Decision 127 now validates canonical paths before proposal emission. See `.agent/provider-knowledge-acceptance-result.json` and `.agent/provider-readback-acceptance-result.json`.

§6.3's second rule, which is prompt text in `lib/agent/prompts.ts` and nothing a check can enforce.

Steps, with terminal sign-in or API access: in a fresh conversation, tell it something note-shaped that the seed does
not hold ("my thesis uses Zotero with Better BibTeX exporting to the thesis folder"). Then, in another
conversation, say it again in different words.

Expected: the first turn calls `search_knowledge` (the debug view, or the server log) before any
`propose_knowledge_write`, and the card names a map. The second either proposes nothing or proposes an
append to the note the first created — never a second note. If it proposes a second note anyway,
`filterWrites` should still turn it into an append when the titles are close; the card says so.

### 7.2 A real model follows §6.4's heuristic — **verified in synthetic live terminal scenarios, 2026-10-15**

**Current evidence:** The synthetic stable course fact was remembered; transient exhaustion and a forget request produced no proposals or automatic writes. A short evening-planning habit automatically appended with its marker. Prior browser evidence covers toast/Undo. See `.agent/provider-knowledge-acceptance-result.json` and `.agent/provider-readback-acceptance-result.json`.

Steps: across a few turns, say one stable fact ("I'm taking MATH 221 this term"), one transient state
("I'm exhausted today"), and one thing to forget ("forget that I mentioned my landlord").

Expected: at most the first becomes a proposal. The transient state and the forgotten item produce
none. A stated habit ("I always plan tomorrow the evening before") of three lines or fewer applies
itself to `habits.md` with a toast and a marker; anything longer is a card.

### 7.3 A profile file over 150 lines makes the next turn propose a distillation — **verified in synthetic live terminal scenarios, 2026-10-15**

**Current evidence:** A history-written synthetic 160-line habits profile triggered a shorter Rewrite plus one detail note while still answering the question. Original profile bytes remained unchanged; neither proposal auto-applied. See `.agent/provider-knowledge-acceptance-result.json` and `.agent/provider-readback-acceptance-result.json`.

The instruction is checked (`lib/agent/context.test.ts`: it appears past 150 lines, not at 150, and sits
behind the cache breakpoint). Actual model behavior is now exercised above.

Steps: in an isolated sandbox, give `knowledge/profile/habits.md` 160 lines through history, then ask anything in Chat.

Expected: the reply answers the question *and* the tray holds a `Rewrite` card for `habits.md`, shorter,
with notes proposed for the detail it moves out. Nothing applies itself: a replace is never auto-applied.

### 7.4 Distill gives a summary worth keeping — **verified in synthetic live terminal scenarios, 2026-10-15**

**Current evidence:** A seeded 24-message / 12-exchange synthetic decision transcript was distilled by the real model. The final 73-word summary preserved names, numbers and decisions, listed open venue/facilitator questions last, and omitted greetings. Add and a second real distillation replaced the same session path. This was a seeded transcript, not 12 live chat exchanges. The original body-versus-frontmatter readback assertion failed; corrected retained-result readback passed without another model call. See `.agent/provider-knowledge-acceptance-result.json` and `.agent/provider-readback-acceptance-result.json`.

The menu item, the route and the tray are checked with the scripted provider, which answers the
request by echoing it. This row is whether the summary is any good.

Steps: distill a real conversation of a dozen turns that settled something.

Expected: under 200 words, what was decided first and what is open second, names and numbers exact,
no greetings. Add it, then distill again: the second card says Rewrite and replaces the first.

### 7.5 The toast, its Undo, and the marker in both themes — **verified in Chromium, 2026-10-15**

**Current evidence:** Buttonless toast leaves even with pointer resting over it. Chat and Ask markers plus visible Undo controls were inspected in light and dark themes. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

Whether a click on Send reaches Send while a toast is up is no longer on this row:
`e2e/toast.spec.ts` checks it at four window sizes (Decision 84). What is left is what it looks like.

Steps: trigger an auto-apply (`[[propose-habit]]` with `ATTUNE_FAKE_PROVIDER=1` is enough). Leave
the pointer resting on the toast until it goes. Switch the theme with the marker on screen.

Expected: the toast has no buttons, says "Undo is under the reply", and leaves after its seven
seconds even under the pointer. The marker reads as a quiet note under the reply in both themes, in
Chat and under the sheet's Ask answer, and its Undo is visibly a control. The toast still covers Send
visually while it is up; a click there sends (Decision 84).

### 7.6 A tray full of cards does not bury the conversation — **verified in Chromium, 2026-10-15**

**Current evidence:** Two multi-proposal turns produce a scrollable tray bounded at 40vh; Send stays at its previous y position. Adding one card removes only that card. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

Steps: send `[[propose-habit]] [[propose-note]] [[propose-collection]] [[propose-tasks]]` twice without
adding anything.

Expected: the tray scrolls inside its own 40vh rather than pushing the message list off screen, the
composer stays where it was, and each card's Add acts on that card alone.

### 7.7 The preview panel's collection Add, in Tasks mode — **verified with live extraction and separate collection UI checks, 2026-10-15**

**Current evidence:** Actual terminal extraction proposed Arrival, Dune and Sicario as a Watchlist collection. Ordinary apply wrote unchecked lines; Undo removed the collection and no Today tasks appeared. Existing controlled browser checks exercise collection Add, preview clearing and unchanged Today sections. These are complementary checks, not a claim of one live-provider browser run. See `.agent/provider-http-acceptance-result.json`.

Steps, with terminal sign-in or API access: in the sheet's Tasks mode, ask for something list-shaped ("films people
keep recommending: Stalker, Paris Texas, Close-Up"). Press the collection card's Add.

Expected: one batch and one commit, a `knowledge/collections/<slug>.md` with the items as unchecked
lines, the preview clearing, and no rows in any Today section.

---

## Phase 8 — Knowledge browser

§17's own five checks are automated and pass from `npm run check:ui`: edit-save-undo restoring a
file by SHA-256, a LaTeX sheet through the editor unchanged, a checkbox click saving one action,
backlinks listing the linking files, and the open document appearing in the next turn's context.
What is left here needs an eye, a pointer, or a real browser dialog.

### 8.1 The tab-close warning as a person meets it — **verified in Chromium, 2026-10-15**

**Current evidence:** Chromium raised actual beforeunload events on reload and close; dismissing retained the complete draft. This checks browser behavior, not a human observation of another browser or its native wording. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

§10.2, as the Phase 8 close amended it: navigation warns when dirty, and the toggle does not, because
Preview now shows the draft (Decision 102). The in-app warning is checked — "← Back to chat", with the
dialog dismissed and accepted, and the typed text still there after the dismissal
(`e2e/browser-write.spec.ts`). `beforeunload` is not: the browser decides whether to show its own
dialog, and a headless run cannot answer for a real one.

Steps: open a note, type into the editor without saving, then close the tab (and, separately, press
reload).

Expected: the browser asks whether to leave. Cancelling keeps every character in the editor.

### 8.2 The document view in both themes — **verified in Chromium, 2026-10-15**

**Current evidence:** Note, collection and task previews/editors, fields, unsaved state, save controls and inline refusal inspected in both themes. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

The editor, the frontmatter inputs, the strip's Edit/Save buttons, the "unsaved" mark, the
collection items list, and a refused save's message, in light and dark. The inputs are borderless
until hovered or focused, which is the thing most likely to read as "not editable" in one theme and
not the other.

Steps: open a note, a collection and a task with `data-theme` light and dark.

Expected: every control is legible and reads as a control; nothing relies on colour alone.

### 8.3 The editor takes focus without jumping the page — **verified in Chromium, 2026-10-15**

**Current evidence:** Edit of a long note keeps the parent scroll position within one pixel and focuses its textarea. Preserving preview body height fixes the reproduced 277 px clamp. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

`DocumentEditor` focuses with `preventScroll`, the same care §16.4's annotation composer needed. A
headless check sees focus land but not whether the page moved under it.

Steps: open a long document, scroll to the middle, press Edit.

Expected: the caret is in the textarea and the document has not scrolled to the top.

### 8.4 The search panel over each page — **verified in Chromium, 2026-10-15**

**Current evidence:** Search results for all four kinds sit below the input at z-index 30 over Today, Calendar and Chat; a coordinate click outside still reaches Settings. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

`Ctrl/Cmd+K` reaching the box and a hit opening a document are checked. What is not: where the panel
lands over Today's list, the calendar grid and a conversation, and whether it covers anything a
person was about to click (Decision 84's lesson, from the toast that sat on Send).

Steps: search for something with results from all four kinds on each of the three tabs.

Expected: the panel is above the page (z 30), does not cover the box it hangs from, and takes no
click meant for the page behind it.

### 8.5 A PDF and an SVG in a real browser — **verified in Chromium, 2026-10-15**

**Current evidence:** PDF and SVG raw download links triggered actual Chromium download events; saved files have expected names and no download failure. Ordinary internal text links still open the document view; no inline-PDF-viewer claim for other browsers. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

Decision 88 serves both as `application/octet-stream` attachments with `nosniff` and
`Content-Security-Policy: sandbox`, and the browser checks assert the SVG is a download link with no
`<img>` and that its script did not run. What a browser does with those headers for a PDF — whether
it downloads or opens a viewer — was never the app's to promise, and the residual is that one
observation.

Steps: upload a PDF and an SVG, then open each from a document's link.

Expected: both download. If a browser shows the PDF inline anyway, that is the observation
Decision 93 says would reopen the question.

### 8.6 The Files panel's menu at the panel's narrowest — **verified in Chromium, 2026-10-15**

**Current evidence:** At panel width 240, note and folder menus and wrapped policy reasons remain fully within the viewport in both themes. File creation/rename regression checks pin the row positioning context and reachability. See `e2e/acceptance-*.spec.ts` and `docs/progress.md`.

The rail's panel is resizable from 240 to 420 px, and the row menu opens to the right of a `⋯` that
sits at the row's end. At 240 px with a deeply nested path the menu may reach past the panel. Since the
Phase 8 close a disabled entry also carries the policy's own sentence under its label (Decision 105),
which is the widest thing in the menu and wraps at 260 px — so this row now asks two questions.

Steps: narrow the panel to its minimum, expand `knowledge/notes/`, open a note's `⋯` (which has the
longest of the reasons) and a folder's.

Expected: the menu is fully readable and inside the window, and a disabled entry reads as one — its
label and its reason both legible, in both themes.

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


## Phase 9 — Build

### 9.1 Live Agent SDK behavior — **unverified**

The scripted browser loop and mocked SDK tests pass (2026-10-14). A real signed SDK
plan/edit turn, including its mandatory hook refusals, has not been exercised.
The separate signed supervisor transport probe passed after explicit approval. It does not
verify application SDK planning/editing. This direct acceptance pass launches no Claude or additional
workers, as requested; the real application SDK row remains unverified.


## Phase 10 — Settings

### 10.1 Settings, themes and History — **verified by browser checks and screenshots, 2026-10-14**

Protected bases; duplicate/edit/delete with dark inheritance and persistent colors;
unsaved scripted generation; focus-size ranking; controlled browser geolocation and Clear;
masked keys with name-only logs; History Undo/Redo and inline conflicts; narrow layout.
Full regression 93/93 gating, and subsequent Settings checks 9/9. Light/dark and 400 px
screenshots inspected. The delayed-read guard was mutation-checked: removing it loses
a newly typed name, restoring it passes. No real generated aesthetic is claimed.

### 10.2 Real generated palette — **one actual generated palette verified, 2026-10-15**

**Current evidence:** A real terminal provider generated an unsaved neutral moonlit palette. Both base modes were inspected in screenshots; 29 saved tokens matched editor readback, Save and reload. Decision 128 fixes immediate visual application of validated unsaved drafts. Original standalone readback used the wrong test-id attribute; corrected retained-result readback passed without another model call. This verifies one palette, not every possible generated aesthetic. See `.agent/provider-generated-light.png`, `.agent/provider-generated-dark.png` and `.agent/provider-readback-acceptance-result.json`.

Use a real provider with a palette request, inspect the unsaved result in both base modes,
save and reload. The scripted map checks UI behavior; it cannot verify prompt adherence.

## Phase 11 — Release readiness

### 11.1 Technical release checks — **verified locally, 2026-10-14**

788/788 deterministic tests, TypeScript, exact export and canonical seed, approved LICENSE,
shared secrets and historical source scans, scoped identity and attribution audits, LF checks.
A sanitized one-commit orphan export installs locked dependencies offline, initializes, passes
knowledge checks, builds production and starts with empty tasks; its process tree is stopped
and temporary checkout removed. Independent browser regression: 94/94 gating in 4.3 minutes;
Stop passed separately. Whole-tree dependency audit reports zero findings. No remote push.

### 11.2 Remaining acceptance — **pending**

Earlier pending manual/provider rows retain their status. Real model behavior, generated palette
quality and signed Agent SDK inference are not established by scripted fixtures. The live
supervisor transport probe passed after explicit approval (see 11.3). A local prepared export does not authorize remote publication or satisfy these rows.

### 11.3 Signed supervisor transport — **verified, 2026-10-14**

Two no-edit Codex workers dispatched through the runner, linked by accepted predecessor,
returned strict results and passed independent library checks. Claude reviewed both in one
resumed conversation. Budget 2/6 used; no resets, worker tools, source edits or active processes.
The initial launcher permission omission and same-session recovery are recorded in progress.
This does not establish real application SDK plan/edit behavior or model prompt adherence.


### 11.4 Direct acceptance follow-up — **exercised locally, 2026-10-15**

Twenty-seven new isolated Chromium checks passed in the expanded regression run.
They cover responsive layout, keyboard and pointer interactions, preview merging and
refusals, attachments UI, branch bars, long conversations, scroll preservation,
annotation placement, document navigation, downloads, menu bounds and masked keys.
Light/dark and narrow screenshots were inspected. An actual isolated process crash,
restart recovery with visible Retry, clean restart and exact-byte Undo also passed.

The full browser run was 120/121 in 6.7 minutes, with Stop passing separately.
The remaining policy-menu test clicked a covered row beneath an open overlay; after
explicit toggle dismissal it passed 1/1 in 12.3 seconds. A preceding Files/browser
subset passed 26/27 while that correction was still being made. These are separate
results, not a clean full regression claim. See docs/progress.md for retained logs,
selective-run commands and final deterministic/build verification. Pending provider,
device, mintty and native Calendar drag residuals above remain pending.


Source 4577695: 789/789 deterministic checks in 70 files, TypeScript and library
boundaries passed. The source commit hook scanned all 19 staged files clean.


Fresh sanitized snapshot 8f2e482 also passed static/historical/shared-secret audits,
offline locked installation, canonical initialization, knowledge checks, production
build and empty-app startup; its server and temporary directory were cleaned.
Evidence: .agent/fresh-acceptance.log. No publication occurred.


### 11.5 Owner-directed UI/provider refresh — **verified locally, 2026-10-15**

Source fb82167: 796/796 deterministic checks in 71 files, TypeScript, library loading
and production build passed. Forty distinct affected browser checks passed across
file-selective runs; the final 20-case selection and three direct-ref regression
checks were clean. Light/dark and phone screenshots inspected. Top-bar visibility,
composer/rail/chat-menu second-click closing, SVG icons, shared palettes and both
masked provider key editors were exercised. See docs/DESIGN.md for the visual system.

GPT-6.1 Sol is the effective default for new chat/extraction, and Claude Opus 5.5 is
available. Responses transport/tool continuation/schema/cancellation are verified
with mocked network events. Real provider inference remains unverified. The app is
running locally in production mode; all four main pages returned HTTP 200.


### 11.6 Neutral palette, control rhythm and hourly timeline — **verified locally, 2026-10-15**

Source d19c04e: grayscale base surfaces/accents, quiet Schedule/Add, consistent 32 px
controls and 40 px composer controls, 24 px chat/document gutters, centered folder
SVG and phone Calendar wrapping were exercised. Empty schedules show hourly guides;
actual timeline dragging, time edits and Undo still pass. A newly created sandbox
conversation persisted gpt-6.1-sol. Closed sheets do not paint off-screen.

Forty-nine distinct affected checks passed across file-selective runs; final groups
were 24/24 in 2.0 minutes and 13/13 in 54.9 seconds. The initial 26/27 run caught a
real two-pixel composer mismatch and is retained as negative evidence. Light/dark,
Settings, Chat, schedule and phone screenshots inspected. Full deterministic checks:
796/796 in 71 files, TypeScript, library loads and production build passed. No real
provider behavior is inferred from these fixtures; earlier manual/provider residuals
remain pending. The app was restarted for the owner's local review.


### 11.7 Compact surfaces and untimed deadlines — **verified locally, 2026-10-15**

Slim selected tabs, smaller neutral shadows, aligned conversation empty state,
compact composer without a duplicate close control, phone Send hit target,
conversation model at the input, centered Calendar period, adjacent-month muting
and rounded current-date highlight passed existing isolated browser checks.
Configured untimed cutoffs save on blur, and renaming preserves exact explicit
due timestamps. Midnight ends the listed due date; DST, custom cutoff precedence,
invalid settings and settings Undo passed deterministic checks.

Affected browser runs: 37/37 in 2.4 minutes and final 12/12 in 1.1 minutes (44
distinct checks). Screenshots inspected in both themes and at phone width.
Full deterministic suite: 800/800 in 71 files; TypeScript and library boundaries
passed. Earlier live provider, native-pointer, audio and terminal residuals remain
explicitly pending. These local checks do not close those rows.


### 11.8 Terminal chat, simple Files and rolling weeks — **verified locally, 2026-10-15**

Terminal sign-in is the default connection, with explicit API selection. Both
GPT-6.1 Sol and Claude Opus 5.5 answered synthetic structured prompts and completed
synthetic app-tool rounds without repository/owner context. Local process stdin,
failure, cancellation, structured schemas, offered-tool confinement and disposable
artifact cleanup are deterministic checks. Terminal image/PDF behavior and full
owner-context provider workflows are not inferred from those probes; Codex PDFs
explicitly require API mode. Existing Build/audio/native-pointer residuals remain.

Rolling is four complete Sun–Sat weeks with the current week on top. Distinct past
surfaces, muted neighboring-month text, rounded grid-edge cells, proportional shell
selection, Search/Sync spacing, compact toggle and composer model selection passed
browser checks. Simple Files hides raw metadata/paths, uses readable task titles
and chevrons and aligns its content column; the Settings technical toggle restores
metadata editing and repository browsing. Existing technical edits/Undo still pass.
Missing durations receive editable estimates in created tasks and proposal previews.

Final Files/new-UI run: 42/42 in 1.7 minutes. Seventy-nine distinct affected cases
passed across selective groups; earlier 39/40 and 40/42 groups retain their stale
selector/label failures in docs/progress.md. Screenshots inspected. Full final
suite: 810/810 in 74 files; TypeScript and 90 library loads passed. No broad manual
or provider acceptance close is claimed by these local checks.


### 11.9 Live provider acceptance and targeted repairs — **verified locally, 2026-10-15**

Source `7a255e8` validates canonical knowledge proposal paths and immediately previews
validated unsaved theme edits. Final deterministic suite: 811/811 in 74 files
(63.03 seconds); TypeScript, 90 plain-Node module loads and production build passed.
Affected browser group: 15/15 in 42.3 seconds. Earlier negative preview check and
14/15 selector failure are retained, not described as clean runs.

Real terminal task/chat, knowledge, distillation, supported attachment and palette
scenarios used only synthetic isolated data. Both requested chat models completed
actual HTTP streaming turns and persisted complete replies. No owner-data write,
supervisor, extra worker, push, publication or budget reset occurred; budget stays 2/6.
Native OS pointer/Shift, actual audio/microphone, mintty Ctrl+C, live Build SDK and
API-provider-specific inference remain explicit residuals. See docs/progress.md.


### 11.10 Ask edits existing tasks — **verified locally and with terminal models, 2026-10-15**

Decision 129/source ec0dbc9 adds exact-ID, field-level task update proposals with
before/after review and Apply through existing history. Both actual terminal models
proposed a synthetic appointment priority change; Apply preserved time, estimate
and notes, and Undo restored original state. Claude's initial mismatched fixture
caused a correct clarification; corrected fixture passed. Browser group 12/12 and
final edit case 1/1 cover Apply, Undo, stale conflict/error retention and Discard.
No owner appointment edit or native model filesystem permission is implied.
See docs/progress.md for retained failures, final suite and app restart evidence.


### 11.11 Quick approval, keyboard, Ask and deadline refinement — **verified locally, 2026-10-15**

Decision 130 adds the off-by-default per-device Approve for me switch next to model
selection in both surfaces. Successful proposals/Tasks results use ordinary guarded
apply/history/Undo once; failed/interrupted turns and refused writes do not retry
automatically. Build uses its existing Auto path through the same switch. Slash or
Enter outside controls opens the bottom prompt; Tab/Shift+Tab from its input cycles
modes, and outside controls with it closed cycles main pages. Chat's floating button
remains absent when closed. Native control/dialog navigation remains available.

Ask spacing, Apply-card separation, prefetched/scroll-preserving Chat navigation,
file glyph, theme-aware favicon and equal selected-tab outer insets were checked.
Today puts due-today items first, earliest deadline first, including beyond focus
size; live countdowns and effective untimed 23:59 were exercised with a controlled
clock. Explicit due timestamps and custom cutoffs remain supported. Legacy factory
midnight resolves in memory; owner task files were not rewritten.

Stable affected group 18/18, shared streaming/knowledge 16/17, its rejected-key
case separately passed in a 2/2 targeted group; Stop passed separately. All 35
distinct affected gating cases passed across groups; the 16/17 and earlier 11/13,
17/18 groups retain failures in docs/progress.md and are not called clean.
Screenshots inspected at desktop/phone widths and both themes. Final deterministic,
TypeScript/library/build and running-app details are recorded in docs/progress.md.
No live provider inference or owner-data write occurred for this refinement.


11.11 final source c5bb22d: 818/818 deterministic checks in 75 files, TypeScript,
92 plain-Node library loads and production build passed. The final two convention-
corrected UI cases passed 2/2 separately. Production is running at localhost:3000,
PID 46212; four complete page responses returned 200. See docs/progress.md for
exact logs and the unchanged manual/provider residuals.


11.11 follow-up acceptance (ab1737b): bottom Ask automatic priority Apply exactly
once/Undo and opting out during a held write are now covered. Existing affected
chat/editor/annotation/bounded-tray, composer and Settings cases exercised: 30/33
initially, all four targeted cases passed in the final 4/4 group. All 33 distinct
cases passed across groups. Initial editor scroll jump and two incorrect fixture
assumptions remain documented; no speculative application fix or threshold change.
TypeScript passed. See docs/progress.md for the intermediate fixture error and
production restart; existing physical/manual/provider residuals remain unchanged.


### 11.12 Stationary controls and collapsible Done — **verified locally, 2026-10-16**

Decision 131: Done has mouse/keyboard expand/collapse, initializes from the existing
completed preference and keeps the count. A completed synthetic task appears only
in Done and not in open ranked sections. Read-only inspection of the owner's
reported appointment confirmed it was already complete; no record was changed.

The bottom toggle has identical position/40px dimensions open/closed at desktop,
tablet and phone widths, with only glyph rotation and reachable input/send controls.
AutoApprove retains its saved opt-in, uses a quiet off state and clear focused/on
state. Icon sends retain accessible Send/Resend names. File bounds center at 12,12;
moon logo at 16,16. Screenshots inspected at 1280/780/400px and desktop Chat.

Affected browser group 28/29, its old attachment selector corrected to scope Chat;
final visual group 5/5 in 35.5s, final icon check 1/1 in 20.4s. All 29 distinct
affected cases passed across selective groups. The initial group remains recorded
as failed, no threshold/retry/quarantine changed. See docs/progress.md for final
TypeScript/library/deterministic/build/startup evidence and unchanged residuals.


11.12 final source d2e2854: 818/818 in 75 files (99.85s), TypeScript, 92 library
loads and production build passed; final icon check 1/1. App runs localhost:3000,
PID 46548, four main pages returned complete HTTP 200 responses. The reported
appointment remains completed, only in Done; no personal data was changed.


### 11.13 Crescent and task separators — **verified locally, 2026-10-16**

Source 5dfbff1/Decision 132: recognizable centered narrow crescent, theme-aware colors,
no task bottom borders, straight inset line only between adjacent tasks. Focused
browser 4/4 in 31.3s, TypeScript passed; light/dark screenshots inspected. No data
changes. Production rebuild/startup and unchanged residuals: docs/progress.md.


### 11.14 Collapsed Done and Today emphasis ? verified locally, 2026-10-19

Decision 133/source 97a534a: Done starts collapsed, stays manually expandable;
later/undated tasks dim until every viewed-day deadline is complete, then restore
full opacity in Focus and Also possible. Earlier overdue tasks stay emphasized.
Final browser group 5/5 (38.2s), focused rank/component checks 33/33, TypeScript
and 92 library loads passed. Initial 4/5 test-assumption failure is retained in
docs/progress.md alongside production/startup evidence. No personal data changed.
