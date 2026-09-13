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

## Phase 5 — Composer

Stage A was checked over HTTP and is not repeated here: the context endpoint, one prompt becoming
one batch and one undo, the named refusals from `/api/agent/apply`, the key routes, the §7.2 undo
guard, uploads and their undo, and both halves of the key check — no key set, and a key the provider
rejected. What is left needs a pointer, a microphone, or a browser that can actually slide a sheet.

### 5.1 The + button, and where it is not — **settled by construction, 2026-09-06**

§15 and §17: *"The + button is absent on Chat, present on Today and Calendar."*

Established over HTTP, on the served HTML of all four pages: `data-composer="button"` appears once
on `/` and once on `/calendar`, and zero times on `/chat` and `/settings`. It is enforced by where
the component is mounted — `app/page.tsx` and `app/calendar/page.tsx` render it and no layout does —
so there is no runtime condition that could go wrong differently in a browser.

What still needs eyes: that it sits bottom-right at 24px, is a 56px circle, and floats above the
list rather than under it (z-tier 30). Then click it and watch it rotate 45° as the sheet opens.

### 5.2 The sheet opens, closes, and keeps a draft — **pending**

§9.1: *"Closes on `Esc`, on button click, and on outside click **only if the textarea is empty**. A
sheet with typed text stays open and its draft persists in `localStorage` under `composer.draft`."*

Steps, in this order, because the third is the one that is easy to get backwards:

1. Open the sheet, type nothing, click the page behind it. It closes.
2. Open it, type `pset 4`, click the page behind it. **It stays open.**
3. With that text still in it, press `Esc`. It closes — `Esc` is unconditional, an outside click is
   not. Reload the page and open the sheet: `pset 4` is still there.
4. Press the + button again while open. It closes, and the button is back to a plus.

Not verifiable from here: all four are pointer and key events against a rendered sheet.

### 5.3 The mode control, with Build off — **settled by construction, 2026-09-06**

§9.3 and the Phase 5 approval: all three segments render, Build is disabled with a tooltip naming
Phase 9, and Ask stays selectable.

Confirmed in the served HTML: `data-mode="tasks"` carries `aria-pressed="true"`, `data-mode="ask"`
is selectable, and `data-mode="build"` is `disabled` with `title="Build mode arrives in Phase 9."`.

What needs eyes: that the tooltip actually appears on hover, and that the selected segment is
legible in both themes. Also check the memory: pick Ask, reload, and the sheet reopens in Ask
(`composer.mode`).

### 5.4 Ask mode refuses inline, and carries the task — **superseded by 6a.3**

Phase 6a built §9.6, so the refusal this row describes is gone: a send in Ask mode now streams a
real reply. What remains true and still needs eyes — that the sheet opens in Ask mode naming the
task — is folded into 6a.3. Kept rather than deleted, because the reasoning below about *where* the
message lands is still the clearest statement of the §13.5 rule.

The original row:

§9.6 and the Phase 5 approval: *"Ask stays selectable because 'Ask about this' is a real caller that
needs it to open and show the context it would carry; a send there refuses inline."*

Steps: on Today, open the row menu on any task and choose **Ask about this**. Then press Send.

Expected: the sheet opens in Ask mode reading `about '<that task's title>'` beside the mode control.
A send puts a message *inline in the sheet*, naming Phase 6 and that task, and no network request
leaves the page. Repeat from the calendar's selection toolbar, which is the same call.

This is the row that pins the §13.5 rule down: the refusal is inline because the text that caused it
is on screen. Compare with 5.7, where the same sheet raises a toast instead.

### 5.5 A prompt becomes a preview, and a follow-up revises it — **pending**

§17: *"six tasks from one prompt → one batch → one undo removes all six; a follow-up revises the
preview in place; 'add these three movies to my watchlist' proposes a collection write; 'read Dune'
returns a question."*

Blocked on an API key, and named here rather than left to be discovered: the four checks in
this row are the only ones in Phase 5 that need a provider, and none of them can be run until one is
set. The batch half is verified: six drafts posted with a `prompt` made one commit
`task: add 6 tasks from prompt` with `meta.prompt`, and one undo removed all six. What no offline
check can do is turn a sentence into those six drafts.

Steps, once a key is set: type `pset 4 due friday, laundry, call mum, book flights, gym, groceries`
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

### 5.6 Attachments, drop, paste, and dictation — **pending**

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

### 5.7 A key error toasts; everything else stays inline — **settled by construction, 2026-09-06**

§13.5, as the Phase 5 approval settled it: *"the principle is not 'which surface' but 'where the
remedy is'."*

Verified over HTTP: with no key, `/api/agent/extract` answers 401 `code: "auth"` with the message
`No API key set. Add one in Settings → API keys.` and makes no provider call. With a garbage key in
`.env.local`, the same route answers 401 `code: "auth"` with `The API key was rejected.` — and in
both cases no task file, no log line and no commit appeared.

What needs eyes: that those two land as a **toast** in the corner and not inline in the sheet, while
5.4's Ask refusal and 5.8's credential refusal land **inline**. Same sheet, same session, different
destinations — that is the whole rule, and it is the one thing about it a browser has to show.

### 5.8 A credential in the prompt is refused, and the text survives — **settled by construction, 2026-09-06**

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

### 5.9 Add, and Discard — **pending**

§9.5 step 5. With a preview of several cards up: untick two, and the button reads **Add selected**
rather than **Add all**; tick them again and it changes back. Press it, and the sheet closes with the
new tasks in today's list. `npm run history -- list` shows one batch.

Then make another preview and press **Discard**: a confirmation appears, and on confirming the
preview is dropped. `npm run history -- list` gains **nothing** — nothing reached disk, so there is
nothing to undo, and §9.5 records that as a deliberate deviation from the brief.

### 5.10 The API keys section — **pending**

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

### 6a.1 The rail and its panel — **pending**

§10.2: *"a 44 px icon rail on the far left, a resizable panel (240–420 px, collapsible, width in
`localStorage`)"*.

Steps: drag the panel's right edge wider and narrower; release. Reload. Click the Chats icon.
Reload again.

Expected: the drag stops at 240 and at 420 rather than going past either. The width survives the
reload. The icon collapses the panel and the collapsed state survives too. Only the Chats icon is
present — Knowledge, Files and Graph arrive in Phase 8, and an empty rail slot would be worse than
a short rail.

### 6a.2 The composer grows, and the keys do what §16.7 says — **pending**

§9.2 and §16.7: an auto-growing textarea of 1–10 rows, `Enter` sends, `Shift+Enter` newlines.

Steps: type one line, then paste ten lines, then twenty. Press `Shift+Enter` twice and type. Press
`Enter`.

Expected: the box grows with the text and stops growing at ten rows, scrolling inside itself after
that. `Shift+Enter` makes a newline and does not send. `Enter` sends. This is measured layout, which
is why it is here and not in the browser checks: they can press the keys but not tell you the box
looks right at ten rows.

### 6a.3 Ask mode from the composer sheet — **pending**

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

### 6a.4 A conversation reads well in both themes — **pending**

Steps: with a reply on screen containing a heading, a list, a code block, a table, inline math and a
display equation, switch between the light and dark themes.

Expected: every element is legible in both, the code block and the table scroll inside themselves
rather than widening the column, and a display equation too wide for the pane scrolls rather than
stretching it. KaTeX ships its own stylesheet, which is the part most likely to disagree with a
theme, so this is worth doing deliberately.

### 6a.5 A long conversation scrolls sensibly — **pending**

Steps: send eight or ten messages, then scroll up and send another.

Expected: the newest message is brought into view as it streams, and the scroller does not fight a
person who has scrolled up to read something. §16.0 rule 6 says no virtualization in v1, so this is
also the check that a few hundred messages stay comfortable.

### 6a.6 What a crash leaves behind, and the sweep that repairs it — **pending**

Decision 63's invariant — a message on disk that is not in the log is always `status: streaming` —
is what lets `lib/history/streaming.ts` recognise an abandoned turn at startup, and Decision 64 is
the sweep that repairs one.

Steps: start a slow reply and kill the dev server with `Ctrl+C` while it is streaming. **Before
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
   recorded and committed like any other change, and `npm run history -- undo <batch>` puts the
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

### 6b.1 The `⋯` menu appears when it should, and reaches where it must — **pending**

§10.2's per-message actions, and the hover reveal added with them.

Steps: hover a prompt and a reply; tab to the menu button with the keyboard; open the menu on the
first message in a conversation and on the last; open it on a reply while the left panel is at its
widest (420 px) and at its narrowest (240 px).

Expected: the button fades in on hover and is reachable by keyboard without a mouse ever moving.
The menu opens *into* the row — leftward from a prompt, rightward from a reply — and is fully on
screen in every one of those four positions. This is the one the browser checks found the hard way:
a right-anchored menu on a left-aligned reply opened across the panel, which reads as a z-index
problem and is actually a menu opening the wrong way.

### 6b.2 The editor is a box you can leave — **pending**

§16.2's edit-and-resend and branch-from-here, which share `MessageEditor`.

Steps: open Edit on a long prompt; watch where the caret lands and whether the page moved. Type a
newline with `Shift+Enter`. Press `Esc`. Open it again, and press Enter on unchanged text.

Expected: focus arrives without the scroller jumping (`preventScroll`), with the caret at the end.
`Shift+Enter` makes a newline, `Enter` sends, `Esc` closes and discards. Resending unchanged text
is allowed and makes a genuine sibling — there is no "nothing changed" refusal, because two
identical prompts with different replies is a thing people do on purpose.

### 6b.3 A branch bar on a busy conversation still reads — **pending**

§16.2's `‹ k/n ›`, which the checks assert the text of but not the look of.

Steps: build a conversation with four branches at one point and two at another; switch through all
of them with the arrows; then switch with the keyboard alone.

Expected: the arrows disable at the ends rather than wrapping. The count is tabular, so it does not
jitter between `1/4` and `4/4`. Switching is one click, and the conversation under it re-renders to
the newest leaf of that branch rather than to the branch point.

### 6b.4 Branching, the gutter and the sidebar in both themes — **pending**

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

### 6b.6 The annotation composer where the pointer is — **pending**

§16.4's last bullet, which is about placement in a way no assertion captures.

Steps: select a phrase in the middle of a long reply and annotate it. Watch where the box opens and
whether the page moved. Type two lines, then click into the conversation. Then press `Esc`. Open it
again, type nothing, and click away.

Expected: the box opens beside the selection with the caret in it and the conversation does not
scroll (`preventScroll`). Clicking away with text in the box **keeps** it — the note is not
discarded because someone looked back at the sentence. `Esc` closes it. Clicking away while it is
empty closes it. When it becomes a card, the card is where the box was, in one frame.

### 6b.7 A picture actually arrives — **pending**

Amendment `o`. The browser checks confirm the file is uploaded, carried on the message, and refused
when it cannot be sent; none of them can confirm the model *saw* it, because the scripted provider
answers without looking and a real one needs a key (`5.5` is the same gap).

Steps: with an API key set, attach a screenshot with legible text and ask what it says. Then attach
a PDF and ask for its first heading.

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

**Every proposal in those checks comes from a scripted-provider directive**, which is the only
coverage the Phase 7 prompts get until a key exists. The four rows below are what the prompts are
*for*, and none of them can be run offline. They are listed as blocked rather than left out, the same
way `5.5` is.

### 7.1 A real model searches before it proposes a note — **blocked on an API key**

§6.3's second rule, which is prompt text in `lib/agent/prompts.ts` and nothing a check can enforce.

Steps, once a key is set: in a fresh conversation, tell it something note-shaped that the seed does
not hold ("my thesis uses Zotero with Better BibTeX exporting to the thesis folder"). Then, in another
conversation, say it again in different words.

Expected: the first turn calls `search_knowledge` (the debug view, or the server log) before any
`propose_knowledge_write`, and the card names a map. The second either proposes nothing or proposes an
append to the note the first created — never a second note. If it proposes a second note anyway,
`filterWrites` should still turn it into an append when the titles are close; the card says so.

### 7.2 A real model follows §6.4's heuristic — **blocked on an API key**

Steps: across a few turns, say one stable fact ("I'm taking MATH 221 this term"), one transient state
("I'm exhausted today"), and one thing to forget ("forget that I mentioned my landlord").

Expected: at most the first becomes a proposal. The transient state and the forgotten item produce
none. A stated habit ("I always plan tomorrow the evening before") of three lines or fewer applies
itself to `habits.md` with a toast and a marker; anything longer is a card.

### 7.3 A profile file over 150 lines makes the next turn propose a distillation — **blocked on an API key**

The instruction is checked (`lib/agent/context.test.ts`: it appears past 150 lines, not at 150, and sits
behind the cache breakpoint). Whether a model acts on it is not.

Steps: give `knowledge/profile/habits.md` 160 lines by hand, then ask anything in Chat.

Expected: the reply answers the question *and* the tray holds a `Rewrite` card for `habits.md`, shorter,
with notes proposed for the detail it moves out. Nothing applies itself: a replace is never auto-applied.

### 7.4 Distill gives a summary worth keeping — **blocked on an API key**

The menu item, the route and the tray are checked with the scripted provider, which answers the
request by echoing it. This row is whether the summary is any good.

Steps: distill a real conversation of a dozen turns that settled something.

Expected: under 200 words, what was decided first and what is open second, names and numbers exact,
no greetings. Add it, then distill again: the second card says Rewrite and replaces the first.

### 7.5 The toast, its Undo, and the marker in both themes — **pending**

Whether a click on Send reaches Send while a toast is up is no longer on this row:
`e2e/toast.spec.ts` checks it at four window sizes (Decision 84). What is left is what it looks like.

Steps: trigger an auto-apply (`[[propose-habit]]` with `ATTUNE_FAKE_PROVIDER=1` is enough). Leave
the pointer resting on the toast until it goes. Switch the theme with the marker on screen.

Expected: the toast has no buttons, says "Undo is under the reply", and leaves after its seven
seconds even under the pointer. The marker reads as a quiet note under the reply in both themes, in
Chat and under the sheet's Ask answer, and its Undo is visibly a control. The toast still covers Send
visually while it is up; a click there sends (Decision 84).

### 7.6 A tray full of cards does not bury the conversation — **pending**

Steps: send `[[propose-habit]] [[propose-note]] [[propose-collection]] [[propose-tasks]]` twice without
adding anything.

Expected: the tray scrolls inside its own 40vh rather than pushing the message list off screen, the
composer stays where it was, and each card's Add acts on that card alone.

### 7.7 The preview panel's collection Add, in Tasks mode — **blocked on an API key**

A known gap, listed so it is not mistaken for coverage (the Phase 7 close). The Add is wired through
the same `CollectionCard` the tray uses, and the tray's use of it is checked. The preview panel's use
is not, because Tasks mode's extraction is a `parse` call and the scripted provider refuses those.

Steps, once a key is set: in the sheet's Tasks mode, ask for something list-shaped ("films people
keep recommending: Stalker, Paris Texas, Close-Up"). Press the collection card's Add.

Expected: one batch and one commit, a `knowledge/collections/<slug>.md` with the items as unchecked
lines, the preview clearing, and no rows in any Today section.

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
