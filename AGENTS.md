# AGENTS.md — working rules for this repo

Read `PROJECT.md` first; it is the specification. This file is how to work, not what to build.

## Phase status

Build phases are `PROJECT.md` §17, one chat per phase. This block is how a fresh session finds the current position; the phase that finishes updates it in its own commit.

| Phase | State | Commit |
|---|---|---|
| 1 — Skeleton | complete | `47be387` |
| 2 — Store, history, git | complete | `b931994` |
| 2 follow-up — Decision 47 + amendments `c`–`f` | complete | `4ff884a`, `2cf20cf`, `492c035` |
| 2 follow-up — amendment `h`, the write-path secret scan | complete | `4682fab` |
| 3 — Today | complete | `ec54cd4`, `9c1939a`, `78bd6b9` |
| 4 — Calendar | complete | `91b0f70` |
| 5 — Composer | complete | `03e2b4b`, `5470063`, `5b812a7`, `6111b28` |
| 6a — Chat: tree, store, linear chat | complete | `58ac40d`, `c79d151`, `a63cb8d`, `ff4b277`, `475298e` |
| 6b — Chat: branching, sidebar, annotations | complete | `8b27de1`, `fcc5ad6`, `747cb52`, `b2c89e1`, `8c638ea`, `2dca761`, `4bd7578`, `2825980`, `fa3a853`, `54f7b1a`, `c2fde54`, `688cd17`, `2cfea96`, `93c9782` |
| 7 — Knowledge base and collections | complete | splits `309b6bf`, streaming-commit fix `5d8efb6`, git containment `131b5a2`, ownership `0f88cea`, Stage A `22ce5ec`, validation fix `3d879bb`, Stage B `12d3cd1`, toast fix `f5018e5`, close `594f705`, `7e1f569` |
| 8 — Knowledge browser | complete — Stage A, B1 and B2 accepted, and the close's two items taken. The graph is Phase 8b's | conditions `a2a84e4`, Step 0 `61676db`, `{ git: true }` fix `103c6f4`, Stage A `2ec0219`, review items `6dfdb8a`, B1 `0e55c3c`, B2 first commit `1c18334`, failure evidence `e80e6da`, data-* refs `ecbaed3`, the rest of B2 `c00929b`, the toggle `c9ff374`, the policy-aware menu `eb9c14b` |
| 8b — Graph view | not started — split out of Phase 8 at the plan's approval, its own session, planned fresh. Two things are waiting for it: the load diagnosis below, and `check:ui` past Decision 67's five-minute threshold | — |
| 9–10 | not started | — |
| 11 — Publish | not started — amendments `n` and `r` are constraints on `publish-check` and are binding before a line of it is written | — |

The follow-up carries four `code:` commits rather than rule 4's one: the owner split it into stages that stop for review, and both the §11.5 fix and amendment `h` came out of those reviews. Rule 4's stage clause is what makes that correct rather than a violation; a phase built in one pass still gets one commit.

Phase 3 carries three for the same reason — Stage A (`ec54cd4`), the three corrections its review asked for (`9c1939a`), and Stages B and C together (`78bd6b9`) — each preceded by the `docs:` commit recording what was approved. Its closing review added a fourth round, spec-only apart from two comments: §10.1's edge-drag semantics corrected, §13.5's inline-versus-toast rule generalised, and `docs/CHECKLIST.md` started.

Phase 5 carries four `code:` commits and four `docs:`, and the shape is rule 4's stage clause plus two rounds of review. `f38c809` recorded the approval's six answers; `03e2b4b` built Stage A — the agent layer and its routes, with nothing rendering — and stopped for review; `032d36f` and `5470063` carried that review's six items; `5b812a7` built Stage B, the composer itself; `74a5ffd` recorded the phase result; `f5c59a4` and `6111b28` carried the closing review's two, correcting the `messages.parse` drift across Decision 27, §13.2 and §11.3 and adding the split rule to Conventions. Spec and source were kept in separate commits at each of those points, which is rule 4's prefix rule taken literally: a comment-only change to a `.ts` file is still `code:`.

**What Phase 5 leaves unverified.** The four provider-dependent checks of §17 — a prompt becoming six drafts, a follow-up revising the preview in place, a collection proposal, and "read Dune" returning a question — need an API key, and none is set in this checkout. They are `docs/CHECKLIST.md` row 5.5, named there as blocked rather than left to be discovered. Both halves of the fifth check *are* done: no key set, and a key the provider rejected, both answer 401 `code: "auth"` with no file, no log line and no commit. Rows 5.2, 5.4, 5.6, 5.9 and 5.10 need a pointer or a microphone; 5.1, 5.3, 5.7 and 5.8 are settled by construction — checked over HTTP with the visual half outstanding. Per the headless-browser paragraph below, Phase 5 did not open that question; Phase 6's plan weighs it against this backlog, which is now ten rows longer.

**Three things Phase 5 changed that later phases inherit.** `BatchResult` carries `targets`, and `lib/history/batch.ts` sits at 330 with its split named in advance (Decision 56). `messages.parse` is not usable at §13.2's `max_tokens`: the SDK refuses a non-streaming request client-side above 128000/6 ≈ 21333, so structured output runs over `messages.stream` — Decision 27, §13.2 and §11.3 were corrected in the closing review, because the code and the spec had drifted apart and the spec was the one that read like the truth. It was found only by running a request against the live API with a deliberately bad key; every offline check passed while it was broken. And the split rule in Conventions below was written from this phase's own composer, which is the first file the cap and rule 7 pulled in opposite directions on.

Phase 4 is one build commit, `91b0f70`: the approval collapsed the two proposed stages into one pass, because `calendar.ts` is a leaf and rule 5's default checkpoint is about foundational risk. Around it, the two `docs:` commits rule 4 now names outright — `7cf66a7` carrying the approval's conditions and its three spec consequences ahead of the code, and `004d5a4` carrying the result. Rule 4 described two commits while rules 4 and 9 together required three; its closing review amended the text rather than leaving each phase to explain the third.

That review made two other amendments, both spec-only. Hard rule 5's ~300 line cap is now about coupling, so it applies to modules containing logic and not to CSS modules or test files, which are bounded by their subject (Decision 56) — this resolves `TaskList.module.css` at 360, which had been a standing violation, as well as Phase 4's two long files; `batch.ts` at 317 stays in scope and stays watched. And `data-*` test hooks are now a sanctioned pattern with a naming convention in Conventions, settled here so Phase 6's message rows and Phase 8's graph nodes do not each invent one or fall back to fragile selectors.

Deferred out of Phase 2 into the phase that first uses each: `/api/tasks/[id]/complete` with repeat materialization (**landed in Phase 3**), `/api/tasks/[id]/promote` (Phase 7, which has collections), and `history.streamingWrite()` (Phase 6, its only caller). `GET /api/tasks` returned the unranked list until `lib/schedule/rank.ts` existed; it now returns the four §10.1 sections and nothing else.

Left unverified by Phase 3, and now written down where they can actually be run: **`docs/CHECKLIST.md`**, started in Phase 3 rather than Phase 11 because Phase 3 was the first phase to produce checks no HTTP client can answer. Three items — the weather element arriving without moving the date (settled by construction: the weather sits in a **side** column, so the grid is `1fr auto 1fr` with the date in the `auto` middle, which is what makes the centre independent of it; the residual is a narrow window, where a side column can outgrow its share), the Ask panel opening, and dragging a timeline block. The Phase 1 mintty `Ctrl+C` item moved there too, rather than living in this paragraph forever.

**Whether to add a headless browser is a decision for Phase 6's plan, not before.** Phase 3 wanted one and did not add it: jsdom was refused by the owner for having no layout engine, and Playwright or Puppeteer is a real dependency — a browser download, a second test runner, and a CI story — which is not something a phase adds mid-build to close three checklist rows. Phase 6 is where the question is actually forced: it is the largest phase, its checks are streaming, stop, retry, and branch-switching, and none of those can be observed over HTTP either, so its backlog is the one that makes the trade legible. Deciding it at plan time means it is weighed against `docs/CHECKLIST.md` as it stands then, in the open, rather than being reached for by whichever phase next finds itself unable to verify something. Phases 4 and 5 add their unverifiable checks to the checklist and do not open this; a phase that thinks it cannot wait says so in its plan and asks. Phase 4 did exactly that: rows `4.1`–`4.5` in `docs/CHECKLIST.md`, all pending, all needing a pointer or a rendering engine — the drag, the Shift hint that has to change while the key is held, the `+N more` expansion, the ↑/↓ keys, and the toolbar including a refused edit landing inline on a second surface. Phase 5 adds to the same list. **Phase 6a's plan decided it: yes, Playwright, landing in Stage B with the first UI.** The question is closed and is not reopened by a later phase; the terms are the first of the Phase 6a conditions below. What tipped it was not the backlog's size but Stage D: §16.4's gutter cards are collision-pushed and aligned to `getClientRects()[0]`, and there is no price at which that is verifiable without a layout engine.

**Phase 6b carries four `code:` commits and three `docs:`, which is rule 4's stage clause plus one
review.** `8b27de1` recorded the approval's five answers and the three spec calls they settle;
`fcc5ad6` built Stage A and stopped for review; `747cb52` and `b2c89e1` carried that review's three
items; `8c638ea`, `2dca761` and `4bd7578` built Stages B, C and D, which the review pre-approved to
run together.

**Six defects the browser checks found, five of them in code that was already committed.** Three
are the same shape and it is worth naming the shape rather than the three: *a later write undone by
an earlier read arriving after it*. `useConversation` adopted every server payload, so a
`router.refresh()` from one send could revert the next (Decision 69); `reload` adopted every re-read
whenever it resolved, so switching a branch could be undone by the send's own re-read landing after
it; and a branch switch made *during* a turn is undone by that turn's own leaf write, which is the
server behaving correctly and a check racing it. Reads are now ordered by issue, and the check waits
for the turn to finalize. The other three: the annotation anchoring filter matched `[data-ui]`
through `closest`, which walks past the message root to the scroller and rejected every text node;
removing the last note unmounted the gutter and the restore tray with it; and "Annotate selection"
read the selection when the menu entry fired, but opening that menu is a click and a click collapses
the selection — it worked only when the browser had not got round to clearing it.

**And one that is not this project's.** An atomic write's rename fails intermittently on Windows
with `EPERM` when another process — a scanner, an indexer — holds the file for a moment. It appeared
once in about thirty checks as a chat turn that rolled back for no reason. `renameAtomic` in
`lib/store/files.ts` retries it a bounded number of times; in the running app the same failure loses
the message being written, so this is a fix for the app and not for the harness. **The closing review
asked where the retry lived and that question found the rest of it:** it covered `writeText`,
`writeBinary` and `rename`, which is every markdown record and every upload, but `writeJsonAtomic` in
`lib/store/settings.ts` and the `.env.local` write in `lib/store/env.ts` renamed themselves. It is
now exported and every atomic write in the project goes through it (Decision 71).

**What Phase 6b leaves unverified.** `docs/CHECKLIST.md` rows `6b.1`–`6b.7`, all pending: the `⋯`
menu's reveal and reach at both panel extremes, the editor's `preventScroll` focus, a four-branch
bar, all three surfaces in both themes, whether read aloud makes a sound, where the annotation
composer opens and what keeps it open, and whether an attached picture actually reaches the model.
The last needs an API key, which is row `5.5`'s gap; the rest need a pointer or an eye. Two branches
of amendment `o`'s refusal exist and only one is reachable from a browser — every model in `MODELS`
allows both images and PDFs today, so "this model cannot read this kind" is
`lib/agent/attachments.test.ts` against a model the registry does not know.

**Three things Phase 6b changed that later phases inherit.** `lib/chat/pane-layout.ts` is the single
answer to how the chat main pane divides itself, and Decision 66 is the reasoning; anything that
wants width in that pane goes through it. `FeatureBoundary` is §16.7's degrade-one-feature rule as a
component, and it is the only class component in the project. And two files crossed the ~300 cap
during the build — `lib/agent/turn.ts` at 312 and `components/chat/useConversation.ts` at 310 — and
were left over it rather than split at the end of a long build. That is the right call in that
direction and the wrong one to leave standing, which is what the paragraph below is for.

**Phase 7's first task, before any of its own work: take the three named seams.** The cap is eroding
— `lib/history/batch.ts` 334, `lib/agent/turn.ts` 312, `components/chat/useConversation.ts` 310,
`lib/history/actions.ts` 299 — and the reason not to split at the *end* of a build applies in reverse
at the *start* of one: nothing is half-finished, so the move is mechanical. Every seam is already
named, so this is not a design session:

| File | Lines | The cut, named in advance |
|---|---|---|
| `lib/history/batch.ts` | 334 | `scanBatch` with its `snapshotText` and `Rejection` helpers move to `lib/history/scan.ts` (Decision 56). They are the one part not in the ordered transaction — a pure predicate over a batch and its snapshots, sharing no state with the rollback. `applySnapshot` is the tempting alternative and is the wrong cut, because undo calls it and moving it splits the rollback across two files |
| `lib/agent/turn.ts` | 312 | `finalizeTurn` plus the discard path, named at the Phase 6a close. That is §16.3's finality contract, which is one subject and reads as one |
| `components/chat/useConversation.ts` | 310 | The turn versus the one-field writes. The thinnest of the three: the streaming send and its ticket-ordered reads on one side, the title/model/leaf writes on the other |

`lib/history/actions.ts` at 299 is not in the list because it is not over, but its seam is named too
and is the fourth if it moves: by domain — task builders, file builders, settings builders — never by
layer, because it is a flat list of independent closures that never call one another (Decision 56).
Do these first, in their own `code:` commit, before Phase 7 writes a line of its own.

**Done in `309b6bf`**, as motion: `--color-moved` marks every line of every moved body, and the 72
lines it does not mark are the three the approval allowed, three new-file headers, imports, `export`
on five moved declarations, and the two-line hook wrapper. `git diff -M` cannot show an extraction —
a third of a file never pairs as a rename — which the owner accepted.

**Phase 7 Stage A — built, checked, stopped for review.** Five `code:` commits and three `docs:` so
far, which is rule 4's stage clause plus two fixes the build found before its own work began:

- `5d8efb6` — **a batch committed mid-turn swept the streaming reply into its commit.** Reproduced as a
  failing test first (`lib/history/batch-commit.test.ts`); fixed by excluding held paths from every
  commit (Decision 76).
- `131b5a2` — **git's discovery could climb out of `REPO_DIR`**, which is how `chat-actions.test.ts`
  put 232 commits into a repository in the home folder. A ceiling, a positive check on both the
  work-tree top and the git directory, a throw outside production, one sandbox helper for every
  committing test (Decision 75). The home repository was left untouched, held at 232 commits
  across every suite run after the fix, and is the owner's to handle outside this project.
- `0f88cea` — the streaming exclusion **keyed to ownership, not declaration**, per the approval's
  question: a batch declaring a held path it does not own is refused (Decision 76).
- `22ce5ec` — Stage A: `lib/store/knowledge.ts`, `lib/knowledge/{links,items,index,check}.ts`,
  `scripts/kb-check.mjs` and `npm run kb:check`, `lib/history/knowledge-actions.ts`, §6.3's rule in
  `scan.ts`, `lib/agent/memory.ts`, the filter in `tools.ts`, `/api/agent/apply` for all three kinds,
  and `POST /api/collections/[slug]/promote`. Nothing renders yet.

**Checked, and how.** `npm test` 500/500 across 39 files; `tsc` clean; `check:ui` 32/32 in 2.5 min on
the Stage A tree. Over HTTP and the CLI against a throwaway checkout, every §17 check and every one
the approval added: a note without a map link refused with no file, no log line and no commit; a
note with one landing as one batch and one commit, and one undo restoring note, map and index by
SHA-256; a three-line habits append logged `knowledge.write` with `actor: agent`; a 200-item
collection giving zero rows in all four Today sections; promote linking task and item both ways in
one batch and one commit, a second promote 409, an unknown item 404, and undo restoring both halves
by SHA-256; `kb:check` exit 0 on the clean seed, exit 1 naming a hand-written orphan, exit 2 with no
orphan named when `courses.md`'s frontmatter is broken. `npm run kb:check` on the owner's own `data/`,
read-only: clean.

**Not verified, and why.** Whether a real model searches before proposing, follows §6.4's heuristic,
or proposes a distillation past 150 lines — Stage B puts those in the prompt, and no key is set in
this checkout (row `5.5`'s gap). Auto-apply is classified here (`autoApplicable`, `pickAutoApply`) and
not yet wired into a turn; that and its toast, transcript marker and Undo are Stage B.

**Three things for the review.** (1) **Amendment `u`**: the Stop check fails about one run in five,
before the git work as well as after; instrumented, the client adopts the finalized reply and the
screen still shows the pre-send empty conversation. User-facing, unexplained, not fixed. (2) **Every
route answers a zod parse failure with 500** and the raw zod message — `handle` in `app/api/respond.ts`
maps `StoreError` and `AgentError` only. Predates Phase 7; the promote route inherits it; not changed.
(3) The **staged-set comparison has one standing source of reports**: a `commit: false` batch's writes
are swept into the next committing batch as "staged but not declared". That is the evidence the
condition asked for, and it says staging only declared targets would leave those writes uncommitted.

**The review's answers.** (1) Amendment `u` deferred with conditions, below. (2) Taken before Stage B
and closed in `3d879bb`: a request failing its schema is a 400 with a fixed message, the dump goes to
the server's console and never the body, and a `ZodError` from the store is a 500 (Decision 78).
`npm test` 510/510, `tsc` clean; `check:ui` could not start, because the owner's own `npm run dev`
held port 3000. Once the port was free it ran on that tree: 31/32, the one failure amendment `u`'s own
Stop check, whose disk state was checked and is recorded in the amendment. (3) Accepted as reported.

**Phase 7 Stage B — built, checked, stopped for review.** Two `code:` commits — the stage, `12d3cd1`,
and a toast fix it found, `f5018e5` — and the `docs:` commit after them (Decisions 79–81,
`docs/CHECKLIST.md`'s Phase 7 rows, amendment `u`).

- **Auto-apply, its toast, its Undo and the marker all landed**, which is the one story the approval
  asked to hear about early if any part did not. A turn's knowledge proposals are held until it is
  finalized; only for a completed turn is the one write `pickAutoApply` allows applied, as its own
  `actor: agent` batch after the reply's. The toast's Undo and the marker's Undo are one function. The
  marker is read from the log by `meta.autoApplied` and batch id, never by position, and resolves
  through a later write, an undo and a redo. An undone batch is not drawn. An unreadable log, a torn
  line or an entry missing a field renders nothing and warns (Decision 79).
- **The tray**, above the chat composer and in the sheet's Ask mode: one card per knowledge write, a
  rewritten write shown as the append it became, with why; refusals on the card with the edits kept.
  `PreviewPanel`'s collection Add is enabled through the shared `CollectionCard` (Decision 80).
- **Distill** from the Chats menu lands a session-summary card in that conversation's tray; nothing is
  written until Add. **The prompts** carry §6.4's heuristic, the search before a new note, and a
  distillation request past 150 lines in the uncached Instructions block.

**Checked, and how.** `npm test` 526/526 across 42 files; `tsc` clean; `check:ui` 39/39 in 2.5 minutes,
twice on `12d3cd1`, and 38/39 on `f5018e5`, where the one failure was amendment `u`'s Stop check with its
disk state verified again. Seven of the 39 are new in `e2e/knowledge.spec.ts` — the toast's Undo restoring `habits.md` by SHA-256, the
marker surviving a reload with its own Undo, a note's Add writing note and map link and the same note
again arriving as an append, the map refusal on the card with the text kept, a collection's Add,
distill, and Ask-mode task proposals added from the sheet. `lib/agent/auto-apply.test.ts` covers the
library half. A mutation that auto-applies on a stopped turn fails one of its ten tests. A marker reader
that ignores undo fails two.

**What a look at the screen found that the checks did not.** A screenshot pass left the pointer
resting on the toast, and the next Send click never landed. Stage B had made toasts pause on hover.
A pause that lands in the fade-out holds the toast at zero opacity, an invisible layer over the chat
composer's Send button that never leaves while the pointer stays. `f5018e5` removes the pause. The
toast keeps its seven seconds, and the transcript marker is where Undo has no time limit. The
screenshots show the marker, the rewritten card and the inline refusal reading cleanly in both themes.

**Not verified, and why.** Rows 7.1–7.4 need a real model and no key is set: the scripted directives
are the only coverage the prompts get, as the approval said, and the rows stay listed as blocked.
`PreviewPanel`'s collection Add is wired but not browser-checked, because Tasks mode's extraction
is a `parse` call and the scripted provider refuses those; the same card is checked in the tray.
Rows 7.5 and 7.6 are visual.

**Six things for the review.**
1. **A fifth directive, `[[propose-tasks]]`**, beyond the plan's four. The Ask-mode task check could
   not be made without it.
2. **Knowledge proposals now arrive at the end of a turn** instead of as the tool returns. Task and
   collection proposals still arrive mid-turn.
3. **`applied` and the held `proposal` follow the model's `done` in the stream.** No client treats
   `done` as the end, and one must not start to.
4. **A tray card's Discard does not confirm**, unlike the preview panel's. A discarded distill costs a
   model call; say if it should ask.
5. **The marker's type moved to `lib/chat/types.ts`** so no component imports `lib/history/` (§3).
   Thirteen type-only imports across eleven components (`Task`, `Settings`) already stood against
   the same §3 sentence; this said "thirteen components" when written. That was not changed here.
6. **The toast host sits over the chat composer's Send button.** It is the stylesheet's bottom-right
   corner, unchanged (§10.0 names no corner, though this said it did). For seven seconds after any
   toast, a click on Send lands on the toast; Enter still sends. That predates this phase, but an
   auto-apply now puts a toast there after an ordinary reply. Not changed.

**Phase 7 close — complete.** Stage B was accepted with two items to take and four decisions; they
are recorded verbatim below, with the one question they raised and its answer. There were three
commits after that, and one history rewrite before them.

- **The history rewrite came first**, as the approval asked: nothing landed on top of the commit
  until it was done. One paragraph was dropped from AGENTS.md in the commit that added it, and in
  the five snapshots after it that carried it; nothing else changed. Each rewritten tree differs from
  its original by exactly that paragraph, and HEAD's tree is byte-identical to what it was. Authors,
  dates and every other message were kept. The old objects were expired and pruned, along with ten
  superseded leftovers: amend drafts, two probes, and a dropped stash. `7ff6a68` repointed every
  citation of a rewritten hash in this file. It did the same for the three chat batches in
  `data/history/`, whose commit fields undo reads only for a `{ git: true }` snapshot, and none of
  them has one.
- **Item 1, the toast over Send** (`7e1f569`, Decision 84). `pointer-events: none` went in as asked,
  and the hit-testing check went in with it. Its first run found that `pointer-events` could not
  finish the job: at 800–1100 px the toast's own Undo sat on Send. That went to the owner as the
  corner question, with a survey showing no corner clear on every page. The answer was that toasts
  lose their buttons. The marker is now the only Undo. The sheet draws one under its Ask answer,
  because otherwise an auto-apply from the sheet could be undone only by finding the conversation in
  Chat. With `pointer-events` removed, every point on Send fails at every size, so the check would
  have caught the dead-Send bug.
- **Item 2, amendment `u`'s check quarantined** (`594f705`, Decision 83). It is tagged
  `@known-flake`, runs after the rest under its own heading, and never sets the exit code. Two
  deliberate breaks confirmed both ways: with `u` alone broken the run is clean and exits 0, and with
  gating checks broken it exits 1 and `u` is still reported apart.
- **Decisions 1–4.** The five directives are Decision 80's list, which says it is the record and
  not the plan's count. A distill card's Discard confirms and no other card's does. §3 permits
  `import type` from `lib/store/` and keeps `lib/history/` closed (Decision 82).

**Found at the close, and fixed.**
- **A second Distill in the same open conversation did nothing.** `useDistill`'s guard ran once per
  mount, and the view is keyed by conversation, so it outlives the flag. The check for decision 3
  distilled twice and failed. The guard now re-arms when the flag leaves the address. Stage B's
  distill check distilled once, which is why it passed.
- **`app/chat/page.tsx` read `autoAppliedIn` from `lib/history/`**, and §3's read exemption for
  route-level files named `lib/store` only. Stage B did not record it. §3 now names both.

**Beyond what was asked.** `components/imports.test.ts` holds the amended §3 rule for components, so
the next import against it fails `npm test` instead of waiting for someone to notice.

**Checked, and how.** `npm test` 528/528 across 43 files, and `tsc` clean. The full `check:ui`
exits 0: 43/43 gating, and the known flake passed this run, reported apart.

**Known gaps, not coverage.** `PreviewPanel`'s collection Add is wired and not browser-checked; it is
row 7.7, blocked on a key, because Tasks mode's extraction is a `parse` call the scripted provider
refuses. Rows 7.1–7.4 stay blocked on a key. Rows 7.5 and 7.6 are visual. A toast still covers Send
visually for its seven seconds; clicks pass through it. One more, in the runner itself, which Phase
8 fixed before its own work: `check:ui`'s arguments went through a shell on Windows. A `-g` pattern
with a space was split in two, and one with `|` or `&` ran what followed as a command. They now reach
Playwright with no shell on any platform (`61676db`, Decision 91), and any pattern works as typed.

**Phase 8 Stage A — built, checked, stopped for review.** Five commits so far, three `code:` and two
`docs:` before this one. `a2a84e4` recorded the approval. `61676db` is Step 0. `56c6f43` recorded a
question the stage had to ask, and `103c6f4` is its answer. `2ec0219` is the stage itself.

- **Step 0.** `check:ui` runs `process.execPath` with `@playwright/test`'s own CLI, resolved from its
  `exports`, and never a shell. The runner moved to `scripts/playwright-run.ts` so a fake CLI can
  drive it. Seven new tests cover `a|b`, `Stop leaves` and `x&y`, each arriving as one argv entry,
  and a marker file that a shell would have created. A mutation that put the shell back, with the
  executable quoted so only the arguments differed, failed the five cases carrying a space, `|` or
  `&`, and the marker file appeared. A real run with `-g "Stop leaves|a rejected key toasts"`
  matched both checks. `addFile` moved to `lib/history/file-actions.ts` as motion: `--color-moved`
  marks 75 lines, and the 10 it does not are the route's import swap, the new file's seven-line
  header and its one import.
- **The `{ git: true }` defects, found before any Stage A code** and taken first at the owner's
  direction (the conditions above). The secret scan read a `{ git: true }` snapshot as empty text, so
  a key in an uploaded text file was logged and committed, and the hook then refused every commit.
  Rollback could not restore such a snapshot. Undo and redo handed git a path without `data/`, and
  redo checked out the wrong revision. The fix went in failing tests first: six of seven failed
  before it, and all seven stay in the suite (Decision 89).
- **Stage A.** The nine routes (`/api/files/{tree,read,raw,write,op}`, `/api/search`,
  `/api/knowledge/{tree,graph,backlinks}`) and the builders behind them: saves by path, a checkbox
  click, New folder, Rename, Delete (Decision 86). Search (87). The browser's security rules (88).
  The link index checking the disk, with backlinks and the graph as one reading of it (90). The
  open document capped (85). `items.ts` made genuinely pure, with the import rule for components
  now followed through `lib/`. Nothing renders yet.

**Checked, and how.** `npm test` passes 649/649 across 53 files, and `tsc` is clean.
`check:ui` exits 0: 43/43 gating, and the known flake passed, reported apart. Every one of these ran
over HTTP against a throwaway checkout served by `next dev`, all passing:

- **§17's own checks:**
  - Edit, save and undo restores a note by SHA-256.
  - The LaTeX sheet saved unchanged keeps its SHA-256 with no log line and no commit, whether the
    table is untouched or sent back whole.
  - A body edit writes exactly the typed body.
  - A checkbox click is one `knowledge.write` that flips exactly its line.
  - Backlinks list the linking files, including a collection naming a task by `[[t_…]]`.
  - The graph's edges into each of 16 nodes equal that node's backlinks.
  - The context endpoint carries the open document's block.
- **The approval's conditions:**
  - A click on a line that changed since it was drawn is 409, with nothing written.
  - A save against a file edited elsewhere is 409, and the other edit is kept.
  - A credential in a save is 422, naming the file and the pattern without echoing the match, and
    the file is untouched.
  - The raw route serves the `.html`, `.svg` and HTML-named-`.png` fixtures as octet-stream
    attachments with `nosniff` and `sandbox`, and a real PNG inline.
  - `.env.local` is refused by path five ways, with no byte of it in any answer, and is absent from
    both trees.
- **Stage A's own behavior:**
  - A link added by hand shows in backlinks with no store write to announce it.
  - An uploaded text file holding a key is 422, while a clean one uploads.
  - Deleting an upload and undoing restores the same bytes.
  - Rename refuses a note, and refuses a linked collection saying why.
  - Rename lets through a map that only the generated index lists.
  - Search ranks a title match first.
  - `kb:check` exits 0 on the checkout. On the owner's own `data/`, read-only, it is clean.

**Mutations, each failing exactly the case written for it:**
- Dropping the no-op path, the stale check, the toggle's line check, the link-index signature, the
  read's containment check or the tracked-file check.
- Loosening the search bound by one character.
- Counting the generated index as a linker.
- Dropping task-id links from backlinks.
- Restoring `items.ts`'s old import.

**Amendment `u`, the running tally the approval asked for:** two runs this phase with the flake in
them, one full `check:ui` and Step 0's filtered run, and no failure. No new form has appeared, and no
surface that could show one renders yet. **Carried, unchanged:** rows 7.1–7.4, 7.7, 5.5 and 6b.7 stay
blocked on a key.

**Not verified, and why.** Nothing in Stage A draws anything, so every visible condition belongs to
B1 and B2. That includes the checkbox's disabled state being visible and explained, the handover's
kept text, and `q`'s focus refetch. The raw route's headers were checked; what a browser does with a
PDF under them was not, which is why PDF downloads (Decision 88).

**Ten things for the review.**
1. **Two files are over the cap and were not split.** `lib/history/batch.ts` is at 328 lines, two
   under the 330 Decision 56 once accepted: the held bytes belong with `snapshotContent` and the
   rollback that reads them. `lib/store/files.ts` is at 303. Decision 56 named one seam for
   `batch.ts`, which Phase 7 took. Inventing another is a stop-and-ask, so both are here instead.
2. **§4.8's `used-by` column is an obligation neither the plan nor the approval covered.** §4.8 says
   it "is filled from the link index on regeneration", and `manifest.ts` says it stays empty "until
   the link index exists (Phase 8)". Filling it at regeneration makes it wrong between regenerations,
   because a note that starts linking an upload does not regenerate the manifest. My recommendation
   is to amend §4.8 instead: an upload's backlinks now answer "who uses this" live, and `kb:check`'s
   notice already names the unused ones. Not changed.
3. **A hole the approval did not name, closed.** A symlink in `data/`, or a tracked one in the
   checkout, could lead to `.env.local` past both the name rule and the tracked rule. A read now
   resolves the real path, refuses one outside its tree, and applies the name rule to it too.
4. **The generated listings do not count as linkers for Rename.** `knowledge/index.md` links every map
   and collection, and `files/index.md` every upload. Counted, they would refuse every such rename,
   and my first test missed that because its map had never been indexed. The rename regenerates both.
5. **A task linked only by `[[t_…]]` can be renamed.** An id link survives a rename and a path link
   does not, so only path links refuse it.
6. **A body-only save of a task or a knowledge file re-serializes its frontmatter** through the file's
   own writer, which stamps `updatedAt`. A file under `files/` and a profile file keep an untouched
   block byte for byte. §17's byte-for-byte checks hold because an unchanged save writes nothing and
   undo restores whole content.
7. **PDF downloads and an SVG does not render in a document** (Decision 88, the approval's fallback).
   Showing PDF inline needs the viewer shown safe first.
8. **A new `StoreError` code, `conflict`, answers 409** for a stale save and a stale click.
9. **`listTree` lost its `wholeRepo` option**, the directory walk that would have listed `.env.local`,
   and the store's `rename` is now `moveFile` so the rename rule's own check stops flagging it.
10. **Three small known gaps.**
    - Undo of New folder removes its `.gitkeep` but leaves the empty folder on disk; git never had it.
    - A renamed upload's manifest row loses a hand-written description, because rows are keyed by path.
    - Redo of an uploaded text file with CRLF line endings restores it with LF, because
      `.gitattributes` normalizes what git stores.

**Phase 8 B1 — built, checked, stopped for review.** The rail's two new panels, the tree they share,
and the document view read-only. Nothing here writes except a checkbox click, which was Stage A's
route; Edit, Save, the file operations and the docked composer are B2's.

- **The rail** takes its panels as a prop (`components/chat/Rail.tsx:35`), which is what let two be
  added without touching the drag, the width or the fold. One panel shows at a time; choosing the one
  already shown folds it. Graph has no icon, and gets one when Phase 8b builds the view behind it.
- **The tree** is one component for both panels (`components/browser/Tree.tsx`), fed
  `/api/knowledge/tree` or `/api/files/tree`. Expanded folders, the active panel, "Whole repo" and
  each tree's scroll position are `localStorage` (`remember.ts`), read after mount so the server and
  the first client render agree.
- **The document view** is handed a path and reads the file itself, ordered by ticket
  (`useDocument.ts:56`), and is keyed by the path so another file is a remount. Decisions 96–98 record
  the three things in it worth a decision: the file list and the missing Graph icon, the reload rule
  and why the surface has no `router.refresh()`, and the checkbox line matching with the React 19
  consequence below.

**Checked, and how.** `npm test` passes 691/691 across 57 files, and `tsc` is clean. The full
`check:ui` exits 0: **54 checks decide the result**, up from 43, and the known flake passed this run
and is reported apart. `e2e/browser.spec.ts` is the 11 new ones, each judging by the
bytes on disk and the log's line count rather than by what the page says. Its fixtures are written
straight into the sandbox and prefixed `b1-`, so no other spec's files are touched.
- The rail switches between all three panels, remembers the choice across a reload, and folds the open
  one.
- The Knowledge tree lists a map by its title, hides the notes it links until the map is expanded,
  shows them when it is, and remembers that across a reload.
- A note opens from the tree with its path, its frontmatter rows, its KaTeX rendered and its row marked
  `aria-current`; "← Back to chat" returns to the conversation it was opened from, with `?c=` intact
  and `?open=` gone.
- A link to another `data/` file opens it in place: a marker set on `window` before the click is still
  there after it, which is what "without loading the page again" means.
- A real PNG shows inline from the raw route with `naturalWidth` 1; the SVG beside it is a download
  link, no `<img>`, and the page title proves its script did not run.
- "Linked from" lists the map that links the note, with no read errors.
- A checkbox click writes exactly one `knowledge.write` and flips exactly its own line, leaving every
  other line of the file byte-identical.
- A box whose line was edited on disk after the page was drawn is refused *in place* — the reason is
  above the body, not a toast — the outside edit is kept, and the re-read shows it.
- A file with a box inside a quote disables every box in the file, with the reason above the body, the
  reason on each box as its `title`, a computed opacity below 1, and a forced click that writes nothing.
- A generated index opens read-only and says why.
- "Whole repo" lists `README.md` but neither the untracked `scratch.txt` nor the credential-shaped
  `config/id_ed25519`, opens `README.md` read-only with "Outside data/" and no backlinks, and
  unchecking it puts the `data/` tree back.

**Found in the browser, after every node test passed: the checkboxes were dead.** `marked` renders a
task box with `disabled`, and a layout effect clears it. React 19 compares `dangerouslySetInnerHTML`
by object identity (`react-dom` 19.2's `updateProperties`, read in `node_modules`) and assigns
`innerHTML` whenever the object differs, whatever `__html` holds, so a fresh `{ __html }` per render
re-set the HTML and put `disabled` back. The object is now memoized on the HTML string
(`components/browser/DocumentBody.tsx:60`). `components/markdown/Markdown.tsx` has the same shape and
is reported below, not changed.

**A mutation run left a mutation in the tree, and two results were read against it before I noticed.**
The run the owner interrupted was killed inside its fourth mutation, so the `finally` that restores
the file never ran, and `router.push(href)` stayed replaced by `window.location.assign(href)` — a full
page load where the view navigates in place. The tree then *was* the mutation, and everything run
after it read that as the source. It surfaced because two mutations with nothing to do with links both
failed the link check; what settled it was the transcript under `.claude/projects/`, not a
recollection of what the line had been (rule 10). The file is restored, a clean run of the browser
checks passes 11/11 as the baseline the mutations below are read against, and `mutate-ui.mjs` now
writes the bytes it holds to `mutation-in-flight.json` before it edits and deletes that file after it
restores, so a killed run leaves a breadcrumb instead of a silent edit. **Nothing was committed from
the bad window**; the two results it produced are discarded, not reported.

**Mutations, each failing exactly the check written for it**, and all read against a baseline run of
the same 11 checks with no mutation applied, which passed 11/11.
- The `{ __html }` object built fresh per render → the two checkbox-click checks. This is the real
  defect above, and the two checks that catch it are the ones that click a box.
- Boxes enabled whatever the plan says → the disabled-box check.
- The reason not shown above the body → the disabled-box check.
- A link navigating by `window.location.assign` instead of the router → the in-place link check.
- Every image inline, SVG included → the image check.
- The rail not reading its remembered panel → the rail check **and** the Knowledge-tree check, which
  reloads the page and needs the rail to come back on Knowledge to find the tree at all.
- The tree not reading its remembered expansion → the Knowledge-tree check.
- `documentHref` dropping the conversation → the Back check.

**Reported, not fixed.** None is B1's to change, and each is written here so it is not rediscovered.
- `components/markdown/Markdown.tsx:57` builds its `dangerouslySetInnerHTML` object in the render
  body, the shape that killed the checkboxes. Nothing in a chat message depends on the DOM being left
  alone today, so it is a latent cost, not a bug; the fix is one `useMemo` and belongs with whoever
  next touches that file.
- `components/chat/useSidebar.ts:64` reads `element.dataset.message`, which the `data-*` convention
  forbids: application code marks an element, it does not read one back.
- **The test suite leaves its temporary checkouts behind.** 228 had piled up under `%TEMP%` by the
  Stage A check, and this stage's runs added more. Reported in the Stage A live-repo check and still
  true.

**Amendment `u`, the running tally, and the thing the owner asked B1 to watch for.** Three runs this
phase with the flake in them — Stage A's two and this stage's full `check:ui` — and no failure. No new
form has appeared. The owner's specific worry was a third form of `u` on the document view, and that
surface now exists and has been exercised: ten runs of `e2e/browser.spec.ts` this stage (the baseline,
the eight mutations, and the full suite) open documents, navigate between them in place, click
checkboxes and re-read after each click, and no stale render appeared in any of them. Decisions 69 and
70 are why, and Decision 97 writes down the two properties that carry it: nothing is server-rendered
into the view's state, and the one way in is ordered by ticket so an older read cannot overwrite a
newer one. **Carried, unchanged:** rows 7.1–7.4, 7.7, 5.5 and 6b.7 stay blocked on a key.

**Not verified, and why.** The document view's read-only half is what B1 built, so every condition
about editing — the Edit/Preview toggle, Save, the dirty warning, the docked composer's `sessionStorage`
handover and its kept text, amendment `q`'s focus refetch — belongs to B2 and none of it is claimed
here. `FrontmatterTable` shows values and does not take them back yet. The checkbox's disabled state
*is* verified, visibly: that was the approval's B1 condition and it has its own check.

**Three things for the review.**
1. **The interrupted mutation run above.** The defect is mine and the window is closed, but the
   general shape is worth a ruling: a tool that edits the working tree to measure it can leave the
   tree changed, and every later reading is then of the wrong thing. The breadcrumb file is what I
   changed; whether mutation runs should instead work in a copy of the checkout is a Decision I have
   not made.
2. **`components/chat/Rail.tsx` grew from a rail with one icon to one with three**, which is the only
   Phase 6b file B1 changed. Its prop went from `children` to a `panels` record keyed by panel name;
   the page owned the Chats panel before and still does, so nothing was re-homed. Phase 6b built the
   geometry for exactly this: the drag and the width are untouched, and the fold now does for three
   icons what it did for one — clicking the panel you are already on puts it away.
3. **No B1 file is over hard rule 5's cap.** The largest is `Browser.module.css` at 272 lines, which
   Decision 56 puts out of scope, and the largest module is `Panels.tsx` at 133.

**Phase 8 B2 — built, checked, stopped for review.** Four `code:` commits and four `docs:` across
the whole of B2, which is rule 4's stage clause plus the three the owner split out by name: the B1
review's three items (`1c18334`), the failure-evidence runner (`e80e6da`), the `data-*` refs
(`ecbaed3`), and the rest of B2 (`c00929b`).

- **The document view writes** (Decision 102). An Edit/Preview toggle over a monospace textarea
  holding the file's bytes, a frontmatter table whose values are editable in the shape they came in
  as, and one Save that sends both. `base` is the version the editor opened, not the latest read.
  Unsaved work is guarded by `beforeunload`, by Back, and by the toggle, and a checkbox stops taking
  clicks while a draft is open.
- **The composer stays docked under a document** (Decision 103). A send makes the conversation carry
  the file as its context, hands the text over through `sessionStorage` rather than the URL, and
  navigates. Three ways it could have lost the text are closed, and the turn waits a render before
  it starts — see below.
- **The Files panel's rows have the Chats panel's `⋯`**: New file, New folder, Rename, Delete, each
  one batch and each undoable, with the builder's own refusal shown where §13.5 puts it. Outside
  `data/` the menu says the tree is read-only.
- **The shell has §10.0's search**: `Ctrl/Cmd+K`, a debounced scan whose late answers are dropped,
  and hits that carry the address they open at.
- **Four amendments landed with the surfaces they were waiting for** — `s`, `l`, `q` and `m`
  (Decision 104 for what `m` moved, and why two things moved with it that it did not name).

**Found by running it, and invisible in production would have been worse.** The handover's first
check left the reply stuck at `streaming` with **no `POST /api/chats/<id>/messages` in the server log
at all**, and `settle()`'s re-read in it — which `send` runs only on the abort path. `useConversation`
aborts its request when the view unmounts (§16.8's leak), React's development remount runs that
cleanup on the way in, and the app only ever runs under `next dev`. The handover now waits one
render, which is a state change rather than a timer.

**Checked, and how.** `tsc` clean; `check-lib-imports`: 68 modules load. The full `check:ui` exits 0:
**75 checks decide the result**, up from 56, and the known flake passed and is reported apart.
`e2e/browser-write.spec.ts` is 19 new ones, split from `browser.spec.ts` as read versus write rather
than by length: edit-save-undo by SHA-256, a body written character for character, the LaTeX sheet
through the editor with no log line and then a real round trip undone by SHA-256, a frontmatter value
saved with the body untouched, a text file edited as itself, the three unsaved-work guards, a 409
that keeps both sides, a read-only file with no Edit, the handover both ways, New folder and New
file, Rename and its refusal on a note, Delete asked and answered, the read-only menu outside
`data/`, a collection item becoming a task, a task's Complete and menu, Today's title link, the
focus re-read, and the search box.

**Mutations, each against a clean tree restored byte for byte, each failing exactly the check written
for it** (baseline: 19/19):

| Mutation | What failed |
|---|---|
| `base` taken at save time rather than when the editor opened | the 409 check |
| the dirty comparison always true | the LaTeX unchanged check |
| the unsaved-work confirm always allowed | the guards check |
| boxes not blocked while a draft is open | the guards check |
| the handover not stored before navigating | the send-from-a-document check |
| the missing-handover warning removed | the empty-handover check |
| the handover sent during the mount cycle | the send-from-a-document check |
| the tree not re-read after an operation | the three file-operation checks |
| Delete not honouring the dialog | the Delete check |
| the focus refetch removed | the focus check, and the 409 check |
| a promote not re-reading the document | the collection-items check |
| Today's title not a link | the Today title check |
| Complete not wired | the task document check |
| a frontmatter cell always giving back text | the values test's list case |

**Two of those mutations passed first and the checks were wrong, not the code.** A `base` taken at
save time survived, because nothing re-read the file between opening and saving — the check now makes
the window focus in the middle, which is what makes the two versions differ. And a Delete that
ignored its dialog survived, because "the row is still there" was already true when it was asserted:
the conventions' own trap, and the cancel case now proves itself through a reload.

**Amendment `u`, the running tally:** nine runs this stage with the flake in them, all passed, no new
form. **Twenty since the phase began, no failure.** **Carried, unchanged:** rows 7.1–7.4, 7.7, 5.5
and 6b.7 stay blocked on a key.

**The load fragility, recorded rather than papered over.** Medal is encoding again, and the unit
suite's best run this stage was **712/713**, its worst 693/713. Every failure is in the git-heavy
files already named, as 5 s timeouts, `EBUSY`/`EEXIST` on a temp checkout, or `git add -A` failing;
each file passes on its own. No timeout was raised, in the config or on a command line that counts.
Three full `check:ui` runs failed the same way before a clean one, and each failure's evidence folder
shows the dev server answering in 15–40 s, one `POST /api/chats` taking 44.5 s — including in specs
this stage never touched. The evidence commit is what makes that readable rather than a mystery.

**Not verified, and why.** `docs/CHECKLIST.md` rows 8.1–8.6: the `beforeunload` dialog, the document
view in both themes, the editor's `preventScroll` focus, where the search panel lands over each page,
what a real browser does with a PDF under Decision 88's headers, and the row menu at the panel's
narrowest. Each needs an eye, a pointer, or a dialog a headless run cannot answer for.

**Five things for the review.**
1. **The Edit/Preview toggle discards, because §10.2 says the toggle warns when dirty.** Taken
   literally, so the warning guards something real. The better behaviour is to preview the draft and
   warn only where work can be lost — one line, and a spec sentence to change. Reported rather than
   taken (Decision 102).
2. **The Files panel's menu is not policy-aware.** The tree route reports names and kinds, so the
   menu offers the same entries everywhere under `data/` and the refusal arrives from the builder as
   a sentence. That is narrower than Decision 86's "the view shows only what will work", which the
   read route makes true for the open document alone. Making the tree carry a policy per node is a
   route change, so it is reported.
3. **One B1 check changed, and only its reading.** `browser.spec.ts` asserted the frontmatter row's
   *text*; the value is now an input's, so the assertion reads `toHaveValue`. The rows are unchanged.
4. **Amendment `p` did not fire.** The docked composer under a document is `ChatComposer` itself, so
   `components/composer/Attachments.tsx` still has two importers rather than three.
5. **`TaskList.module.css` moved with the components that share it** and is now
   `components/tasks/TaskList.module.css` at 337 lines — a move plus §10.1's title link, not growth.
   Decision 56 puts a stylesheet out of hard rule 5's scope; it is named here so that stays a
   decision rather than an oversight. The largest modules this stage added are `DocumentView.tsx` at
   237 lines and `Search.tsx` at 144, both under the cap, and `Browser.module.css` is at 418.

**Phase 8 closes — the two items taken, the tally given, the load diagnosed.** Two `code:` commits and
two `docs:`: the conditions (`50fa624`), the toggle (`c9ff374`), the menu (`eb9c14b`), and this one.

**1. The Edit/Preview toggle shows the draft** (`c9ff374`, Decision 102 rewritten). Preview renders
what was typed rather than what is on disk, so Edit and Preview are two views of one draft and
switching between them cannot lose a character — which is why the toggle now asks nothing. Only
leaving warns: `beforeunload` and the confirm on "← Back to chat". §10.2 says this now.

It was one line, and two more came with it rather than after it. Showing the draft makes it obvious
that **a control writing the file by another route must not fire while a draft is unsaved** — the
checkbox rule the owner accepted in B2, which applies word for word to a task's Complete and `⋯`
menu and to a collection item's "Make this a task". Both were reachable in a dirty preview in B2 as
well, because the frontmatter table has always been editable there; previewing the draft made it
visible rather than made it true. All three now take one reason, `draftOpen`, and say it.

**2. The Files panel's menu shows the policy** (`eb9c14b`, Decision 105). `rowPolicy` reads the same
table the builders enforce and `GET /api/files/tree` calls it per node, so the menu disables what
will not work and shows the policy's own sentence. The table was reachable without breaking §3
because the *route* can import `lib/history/` — the component never does; it gets four nullable
strings. `lib/history/write-policy.test.ts` asserts each answer is the **same string** the primitive
gives, so a sentence written into `rowPolicy` fails a test rather than drifting in a menu. Server-side
enforcement is untouched, and the browser check proves it by renaming a note over HTTP after finding
the entry greyed out. A folder's Rename moved out of `renameAction` into `folderPolicy` on the way, so
the greyed entry and the thrown error are one string; the builder now has a test for that refusal too.

**Two cases the menu still offers and the writer still refuses**, reported rather than half-closed: a
new file under `knowledge/notes/` (a note needs the map §6.3 requires, and this menu cannot ask for
one) and under `knowledge/maps/` or `collections/` (a record needs frontmatter an empty file has
none of). Both rules live in the record writers, not in the table, so a sentence for them in
`write-policy.ts` would be the second copy the condition ruled out. They are pinned in the unit test
so they read as a known edge.

**Mutations, each against a clean tree restored byte for byte, each killed by the check written for
it** (baselines: `browser-write` 20/20, `write-policy.test.ts` 27/27):

| Mutation | What failed |
|---|---|
| the preview renders the file rather than the draft | the toggle check, and the 409 check |
| the plain-text preview renders the file rather than the draft | the text-file check |
| the toggle warns and discards again | the toggle check, and the text-file check |
| a collection's items stay live while a draft is open | the collection-items check |
| a task's controls stay live while a draft is open | the task document check |
| the tree route sends no policy | the menu check, and the three file-operation checks |
| the menu ignores the policy and enables every entry | the menu check |
| `rowPolicy` answers a file's rename with a sentence of its own | 8 of `write-policy.test.ts`'s cases |
| the folder-rename sentence changes | `write-policy.test.ts`'s wording pin, and only that — `file-actions.test.ts` asserts against `folderPolicy` itself, so it follows the change. The wording is pinned once, on purpose |

**And the mutation runner itself was wrong first, which is this report's own instance of the owner's
point.** Its first version spawned the checker as `npm.cmd`, which Node refuses to spawn without a
shell (`EINVAL`); the catch read that refusal as "the check failed", so the first two mutations were
reported killed having run nothing at all. Found by noticing that a failing run printed no failing
test. The runner now spawns `process.execPath` with the CLI's own entry, the way `check:ui` does
(Decision 91), and refuses to treat a spawn failure as a result. The nine rows above are from the
fixed runner. Nothing was committed from the bad window and the tree was restored either way; the
breadcrumb file did its job in that it was absent every time, because the `finally` ran.

**A check of mine was wrong too, and the suite caught it.** The first full run after item 2 failed
three checks. One was my new menu check asserting Delete enabled on `files` itself — which the policy
refuses, because `files/` is one of the folders the app keeps, a fact the unit test had told me an
hour earlier. One was the 409 check, whose way of observing the re-read was "the other program's text
appears in the preview": true before this commit and false after it, since the preview is now the
draft. It waits on the read's own response instead, which cannot have already happened. The third was
a 15-second server response and is in the load section below.

**Mutations test the checks, not the code, and in B2 they did it visibly for the first time.** Two of
B2's fourteen passed against mutated code because the checks were wrong — a `base` taken at save time
survived a check that never re-read the file in between, and a Delete ignoring its dialog survived
"the row is still there", which was already true when it was asserted. Both checks were rewritten to
prove themselves. That is what the mutation pass is for: a check that a deliberate break walks through
is a check that was measuring the run's history rather than its own action, and nothing else in this
project finds one. The same thing happened again in this commit, twice, above.

**Amendment `u`, the tally the B2 report owed.** Three full `check:ui` runs this stage carried the
flake: it passed in all three, reported apart, and no failure. **Twenty-three since the phase began,
no failure, and no third form.** The owner's specific worry was a new form on the document view, and
that surface got the most exercise it has had: the write spec ran eighteen times this stage — four
filtered baselines, three inside a full run, eleven under a mutation — opening documents, editing,
saving, previewing drafts, clicking checkboxes and re-reading after each write, with no stale render
in any of them. **The one thing that looked like a
candidate was not.** In the first full run the handover check failed with no conversation on screen;
the evidence names the cause, `POST /api/chats 200 in 15103ms` against the check's 15-second wait,
with `GET /chat` taking 15.5 s in the same run. That is the load, not a render.

**Carried, unchanged:** rows 7.1–7.4, 7.7, 5.5 and 6b.7 stay blocked on a key.

**Checked, and how.** `tsc` clean; `check-lib-imports` 68 modules. The full `check:ui` exits 0:
**76 checks decide the result**, up from 75, and the known flake passed and is reported apart
(evidence `check-ui-evidence/2026-09-27T20-31-18-468Z`). The unit suite is **741/741** — see the load
section for why that number needs a flag to be reproducible, and what the suite as configured gives.

**Not verified, and why.** `docs/CHECKLIST.md` rows 8.1–8.6, with two of them changed by this commit:
8.1 is now one in-app warning rather than two, since the toggle no longer warns; 8.6 gained a second
question, because a disabled menu entry carries the policy's sentence under its label and that is the
widest thing in the menu.

### The load, diagnosed and not fixed (the Phase 8 close, item 3)

The owner asked for a diagnosis before 8b and explicitly not for an implementation. Nothing here was
changed in the repository; the one config used to measure a candidate was written outside it or
deleted, and `git status` was clean before each commit.

**Reproduced.** Three runs of the suite exactly as `vitest.config.ts` has it, on this machine today:
727/740, 730/740 and 738/741. The spread the owner called unreliable is real and it is not about which
tests run.

**It is contention, and the errors say so rather than a timeout implying it.** The failures name
themselves: `ENOTEMPTY: directory not empty, rmdir '…\attune-turn-…\data'`, `EEXIST: file already
exists, mkdir '…\data'`, `EBUSY: resource busy or locked, unlink '…\data\chats\…\messages\….md'`
and `Command failed: git add -A`. Every one is inside `Checkout.reset()` in `lib/testing/checkout.ts`
— `rm -rf data`, then `cp seed → data`, then `git add -A`, then a commit — which runs once per test in
twelve files. A recursive delete failing with ENOTEMPTY on Windows is another process holding a handle
inside the tree, not a slow disk.

**Proven both ways, on the same twelve files.**

| How | Result | Wall | Slowest file |
|---|---|---|---|
| parallel, as configured | 4 failures, then 5 | 41 s, 51 s | 47 s |
| `--no-file-parallelism` | **0 failures, twice** | 109 s, 110 s | 15 s |

The files are not slow. Each one takes three to four times longer when twenty forks are churning the
same disk, and the 5-second default timeout is what that inflation runs into. On the whole suite:
parallel 40–50 s with 3–13 failures; **fully serial 741/741 in 111 s**; and the hybrid — the twelve git
files in one fork, the other fifty parallel — 740/740 twice, in 115 s and 119 s.

**The owner's second guess is ruled out.** A private, empty temp root for the whole run changed
nothing: the same three failures with the same ENOTEMPTY and EEXIST. So "a tmpdir root each" would not
help; the contention is over the disk and the files themselves, not over `%TEMP%`'s directory index.
Bounded parallelism helps and does not close it: `maxForks` 4 and 8 both removed every filesystem
error and left one 5-second timeout in the heaviest test.

**Two things to decide, neither taken.**
1. **`reset()`'s `rm` and `cp` have no retries**, while the removal in `createTempDir` has
   `maxRetries: 30, retryDelay: 200` — the `REMOVE` constant in the same file. Node's `rm` retries
   EBUSY, EMFILE, ENOTEMPTY and EPERM only when asked to, and those are exactly the errors above. This
   is a line each and it is orthogonal to the scheduling question.
2. **Scheduling.** `--no-file-parallelism` costs about 70 seconds and is a flag, not a restructure.
   Per-project `poolOptions.forks.singleFork` for the twelve files costs about the same and keeps the
   other fifty parallel. One thing to know before writing that: **`fileParallelism` cannot be set per
   project in vitest 3.2** — it is in the type's `NonProjectOptions` — so the project route has to use
   `singleFork`, which is what the measurement above used.

**The dev server's 15–40 seconds is the same machine, and it is not git.** In the one failing full
`check:ui` this session, `GET /chat` took 15,536 ms and `POST /api/chats` 15,103 ms; the second is
what failed the handover check, whose wait is 15 s. On a clean run twenty minutes later the slowest
response of the whole suite was 5,313 ms. A `/chat` page render has no git in it, so these are
machine-wide stalls rather than a git problem, which fits the unit-suite finding being about disk
contention rather than about git specifically. The number worth keeping: **`playwright.config.ts:49` gives an
expectation 15 s and the worst stall observed was 15.5 s**, so one stall is a failed check rather than
a slow one.

**And one the owner has not seen yet, in the same neighbourhood and directly about 8b.**
`check:ui` now takes **5.8 and 7.0 minutes for its 76 gating checks** in this session's two clean
runs — 6.2 and 7.4 minutes of wall clock with the flake run after them — which is past the
five-minute threshold Decision 67 named for itself. The rule there says to shard across workers — which needs a sandbox per
worker first, because `fullyParallel: false` is there for the one data directory and one git
repository — or to run by spec file. Not taken here; reported, because 8b adds a canvas spec to it.

### Approved conditions — Phase 2 follow-up (rule 9)

Written before the build, verbatim from the approval, so they survive compaction.

**Split.** Stage A stops for review. Stage B is pre-approved: run it after Stage A's review without a separate plan round, since its four items are independent and fully specified. Report both.

**Stage A — Decision 47 amendment, spec and code landing together.**

- Step order in `runBatch`: apply → backfill the *previous* batch's hash → append this batch's entries with `commit: null` → regenerate the mirror → `git add -A -- data` / `git commit -- data` → schedule the push. Nothing writes under `data/` after a successful commit, so the tree stays clean.
- Backfill: group the trailing `commit: null` entries by batch id, take **only the last group**, and stamp it only when `git log -1` shows HEAD's subject equal to that batch's `<prefix>: <summary>`. Any older null-commit batch stays null forever, correctly. One git call per batch, never one per line.
- `meta.noCommit: true` on a batch run with `commit: false`, and `meta.commitFailed: true` written at the moment a commit fails. With both markers every null in the log explains itself — pending, never-committing, or failed — so §7.5's history UI reads the reason instead of inferring it.
- `undoBatch` resolves a null commit from HEAD with the same subject guard, closing the `{ git: true }` / `code.change` gap on the newest batch.

**Stage A checks.** The Phase 2 undo/redo/git acceptance checks, re-run; `git status --porcelain -- data` empty after every successful batch; plus:

- **The `noCommit` path end to end**: run a `commit: false` batch, then a normal batch, and assert the `noCommit` entry is still null while the normal one got stamped. This tests the new marker rather than the guard that used to stand in for it.
- **The failed-commit case in both directions**: after batch N fails, N+1 succeeds, and N+2 backfills — assert N+2's group is unstamped, N+1's is stamped with its own hash, and N's is **still null**. The older-group regression is the specific thing last-group-only exists to prevent, so it needs an assertion, not just a passing run.

**Between the stages — §11.5 hardening**, from the Stage A review.

- a. Confirm `scripts/check-secrets.mjs` reports file and line only and never echoes the matched text. §11.5 implies this; verify it rather than assume, and add a test asserting the match does not appear in output.
- b. Cap `commitError` length and scrub it before writing: strip anything matching a credentialed URL (`://user:token@`) and run the check-secrets patterns over it, replacing hits with `[redacted]`. A hook can print anything, so the log should not trust it.
- Check: induce a check-secrets failure through `runBatch` and assert the secret does not appear anywhere in `actions.jsonl`, and that the next commit succeeds once the offending file is fixed.

**Stage B — amendments `c`–`f`**, independent of Stage A and of each other. `dates.test.ts` covers only the six functions `dates.ts` has now; `daysBetween`/`daysUntil` are not built early (amendment `g`).

### Approved conditions — amendment `h` (rule 9)

Written before the build, verbatim from the approval. This session had already compacted once when
they were given, which is the case rule 9 exists for.

**Amendment `h` approved. Three constraints.**

1. **INVARIANT, and write it into AGENTS.md as a rule, not just as code**: the `runBatch` write-path
   scan and the pre-commit hook use exactly the same pattern set, from `lib/security/secrets.ts`.
   Anything the hook would refuse, the write path refuses first. The obvious future fix for false
   positives is to relax the write path and leave the hook strict — that reopens the deadlock exactly
   as it was, so it must be a stated rule.
2. **On refusal, the user's text is preserved wherever they typed it** — the same principle as
   §13.5's provider-error handling. A rejected save must never lose what someone wrote. The error
   names the file and the pattern name and never echoes the match, same rule as check-secrets.
3. **No `force` in v1.** Record it as deferred with the reason: a force has to exempt the pre-commit
   hook as well, or the block just moves one step later, and that is more machinery than the case has
   earned. Note it so a future session doesn't add half of it.

**Also:** rule 4 needs a clause for stages — one build commit per phase, or one per approved stage
within a phase. Three `code:` commits for a three-stage follow-up is correct behavior that currently
reads as a violation.

**Then:** build `h`, run its checks, update the status block, and **stop**. Phase 3 starts in a new
session.

### Approved conditions — Phase 3 (rule 9)

Written before the build, verbatim from the approval. The plan proposed three stages; the approval
kept the split and pre-approved two of them together.

**Both calls answered, plus one clarification. Approved with the split: Stage A stops for review;
Stages B and C are pre-approved to run together after that review, without a separate plan round.
Report B and C together.**

**1. GEOCODING** — your diagnosis is confirmed; I checked the docs. Open-Meteo is forward-only
(`/v1/search` by name, `/v1/get` by id), reverse is an open upstream request. Your fix is right in
direction but would turn weather off as written: §10.1 renders the element only when
`settings.weather.query` is non-empty, and §4.9 says empty query means off.

Correct it properly: the off-condition becomes **"no lat/lon"**. `lat`/`lon` is what the forecast
needs; `query` is only how they were found; `label` is what is displayed. Geolocation sets
`lat`/`lon` + label `"My location"` + empty `query`. Text search sets all four. Clear wipes all four.
Update §4.9, §10.1 and §11.2, and record it as a Decision — this is a spec correction, not an
implementation choice. No second geocoding provider; "My location" is an honest label.

**2. COMPOSER STUB** — smaller than you proposed. Do not build the bottom sheet. §9.1 specifies its
geometry, transition, max height, z-tier and close semantics, and Phase 5 owns it together with the
`+` button; building that chrome now means Phase 5 either discards it or inherits decisions made
outside its own plan. A toast or a small inline panel showing `"Ask mode · <task title>"` satisfies
§17's "opens the composer stub in Ask mode" without pre-committing any Phase 5 design. No provider
call, nothing written, as you said.

**3. CLARIFY §3** rather than relying on the `layout.tsx` precedent. State the rule outright:
route-level server files (`app/**/page.tsx`, `app/**/layout.tsx`) may call `lib/store` read functions
directly; everything under `components/` goes through API routes; all mutations go through API routes
regardless of caller. Right now §3 says components never import `lib/store`, and `page.tsx` reading
it is justified only by precedent — write the rule so it stops eroding.

**Also approved as proposed:** `advanceDate` in `dates.ts` rather than a new file; `Toast.tsx`
arriving in Stage B; and **Refine with AI** absent rather than stubbed.

**Then:** write the conditions into the status block first, then build Stage A.

**Stage A — the pure layer and the API.** `daysBetween` / `daysUntil` / `minutesFromMidnight` /
`advanceDate` in `lib/schedule/dates.ts`; `rank.ts` and `timeline.ts` with tests; `completeTask` in
`lib/history/actions.ts` materializing a repeat in the same batch; `/api/tasks/[id]/complete`;
`GET /api/tasks?date=` wired to `rankDay`. Nothing renders.

**Stage A checks.** The §10.1 worked example as a passing test; `rankDay` twice on shuffled input
byte-identical; complete/undo round-trips through the history CLI; a repeating task completes,
materializes the next instance under the **same batch id**, and `history undo <batch>` removes both —
run under `ATTUNE_REPO_DIR` against a throwaway checkout. Amendment `g` lands here, with the
functions it tests.

**Stages B and C — the Today list, then weather, first run, and the Schedule toggle.** Reported
together. Amendment `j` lands in B: an inline task edit containing a credential-shaped string is
refused, the form keeps what was typed, and the error names the file and the pattern without echoing
the match.

### Approved conditions — Phase 3 Stage A review (rule 9)

Verbatim from the review that approved Stage A. Three corrections land before Stages B and C.

**Stage A approved. Three corrections first, then build B and C together.**

**1. REPEAT WITHOUT AN ANCHOR** — your refusal is right, but make it visible. Reject at write time: a
task with `repeat` set and both `due` and `scheduled` null does not save, with an error saying a
repeat needs a date to advance. At write rather than in the form, so Phase 5's agent-created tasks
are covered by the same rule. Record completion-anchored repeat as a deliberately-not-built
alternative with your reasoning — it is a second recurrence model, not a missing feature, and a
future session should not add it by accident.

**2. `nextInstance`** — drop `collection` on the new instance, keep `source`. `collection` is a
one-to-one pointer to the list item that became a task, and the collection's `tasks` array only
holds the first one; two tasks claiming the same item is a broken backlink. `source` records
provenance, not identity, so it carries forward as §4.1 says.

**3. `GET /api/tasks?date=`** — drop the unranked `tasks` key. It was a Phase 2 placeholder until
`rank.ts` existed, and that reason is gone. Nothing consumes it: Today reads the store directly under
the §3 rule, and Phase 4 has its own calendar route. Return the four sections only; a flat list is a
concatenation if anyone ever needs one. Update §14 to match.

**Then Stages B and C as pre-approved. Report them together.**

### Approved conditions — Phase 4 (rule 9)

Written before the build, verbatim from the approval. The plan proposed two stages; the approval
collapsed them, with the reasoning recorded because it qualifies rule 5 rather than waiving it.

**Plan approved with three answers. Collapse the stages — build it in one pass, one `code:` commit
plus the trailing `docs:` commit.**

**Reason for collapsing: `calendar.ts` is a leaf. The calendar page consumes it and no later phase
builds on it, unlike `rank.ts` or `lib/history`. Rule 5's default checkpoint is about foundational
risk, and you were right that this one is thin.**

**1. `writes.ts` — APPROVED at the second use.** Your argument is the right one: those are §13.5
semantics, not conveniences, and two hand-copied versions drift into disagreeing about where an
error appears, which is a correctness divergence rather than duplication. There is also a real third
use coming (Phase 5's preview panel, Phase 8's document view).

Two conditions. Keep it narrow — `send`, busy id, toast-vs-inline routing per §13.5,
`router.refresh()`, and nothing else; if it starts accumulating unrelated helpers, that is hard
rule 1 reasserting itself. And record it as a Decision naming it a deliberate exception to hard
rule 1 with this reasoning, so the rule does not quietly erode into "abstract at two."

**2. PAST CELLS — reversing your call.** Show overdue items in their due-date cell, with the same
overdue treatment Today uses, alongside completed. A task due last Tuesday and still open otherwise
appears nowhere on the calendar, so an empty Tuesday reads as "nothing was due" when something was
due and was missed. "What did I miss" is a question you open a calendar to answer. This does not
create a second inbox: the SelectionBar already makes cell items actionable, so this fills a hole
rather than adding an affordance. Correct §10.3 and record it as a Decision.

**3. §3 ADDITIONS — approved, recorded like Decision 46.** Leave `TaskEditForm.tsx` and `format.ts`
in `components/today/` and import across, as you proposed; a move is churn. Note the trigger though:
if a third surface imports from `components/today/`, that is the signal to move the shared pieces
into `components/tasks/`.

**Write the conditions into the status block first, then build.**

**Scope, as planned and approved.** `lib/schedule/calendar.ts` + `calendar.test.ts` (the grid for
Rolling / Month / Week and the day grouping, pure); `GET /api/calendar?from&to`;
`components/tasks/writes.ts`; `app/calendar/page.tsx` replacing the stub; `components/calendar/`
— `CalendarView`, `CalendarGrid`, `DayCell`, `SelectionBar` — with native HTML5 drag writing
`scheduled`, or `due` with `Shift`, one `task.update` batch per drop; and the Phase 4 rows in
`docs/CHECKLIST.md`. Per the headless-browser paragraph above, Phase 4 does not open that question:
what needs a pointer goes to the checklist.

### Approved conditions — Phase 5 (rule 9)

Written before the build, verbatim from the approval. The plan proposed two stages and six open
calls; the approval kept the split, answered all six, and refined the first two.

**Plan approved with the split. Six answers.**

**1. MODE SELECTOR** — approved, with one refinement. Render all three segments; the geometry
argument is right and rebuilding the control twice is worse. But do not build a refusal path for
Build: nothing routes to it, so make that segment disabled with a tooltip naming Phase 9. Ask stays
selectable because "Ask about this" is a real caller that needs it to open and show the context it
would carry; a send there refuses inline as you proposed. Build's approval toggle lands in Phase 9
with the mode it gates.

**2. `/api/agent/apply`** — approved exactly as proposed. Phase 7 owns `lib/store/knowledge.ts`, so
a named refusal for knowledge and collection is the honest shape. Collection card renders with its
Add disabled, same pattern as Build's segment.

**3. KEY ERRORS** — your reading is right, and tighten the rule so it is not re-litigated. The
principle is not "which surface" but "where the remedy is": authentication and configuration errors
toast, because the fix is on another screen and the composer text did not cause them; every other
error raised while a surface is open goes inline on that surface. That explains both §17's check and
§13.5's rule rather than reconciling them case by case. Write it into §13.5.

**4. `.env.local` SCOPE** — approved as `user`. Reword §12's rule to say what it means rather than
leaving an exception outside it: user scope is anything personal to the owner — everything under
`data/`, plus `.env.local`; project is code, `seed/` and docs. Record as a Decision.

**5. THE UNDO HAZARD** — good catch, and your fix is right. `undoBatch` refuses a batch whose
`{fields}` or `{content}` targets are not `data/`-relative. It is correctly narrow: `code.change`
uses `{git: true}` and takes the revert path, so today this bites only the key batch. Two
conditions: it lands in Stage A with the code that creates the case, and the refusal message says
WHY — a key change records only the name, never the value, so there is nothing to restore — rather
than reading as a path error.

**6. LIVE CHECKS** — build Stage A without a key; nothing in it needs one. The four
provider-dependent checks move to the Stage A/B boundary: report at the end of Stage A which of them
are blocked, and I will decide about a key then. Do not defer them silently into the checklist —
name them as blocked so the decision is explicit.

If a key does arrive: record results as observations with date and model id, in the three-state
checklist convention, and do NOT wire them into `npm test`. A non-deterministic check inside the
suite is one you stop trusting.

**Both pre-checks noted:** amendment `m` correctly does not fire, and amendment `j` getting
`meta.prompt` as a third surface is the right catch.

**Conditions into the status block first, then Stage A, then stop.**

**Scope, as planned and approved.** *Stage A — the agent layer and its routes, stopping for review;
nothing renders.* `@anthropic-ai/sdk` installed with its resolved version recorded in the table
below; `lib/agent/registry.ts`, `anthropic.ts`, `prompts.ts`, `context.ts`, `tools.ts`, and
`chat.ts` (the §13.2 loop over an in-memory message array — the conversation-persisting half is
Phase 6's, which is what §17 means by "Tasks mode path" — with an injectable provider so the routing
is testable without a key); `lib/store/env.ts`; `/api/agent/extract`, `/api/agent/apply`,
`/api/agent/context`, `/api/files/upload` with a `file.add` builder in `lib/history/actions.ts`, and
`/api/settings/keys`; `POST /api/tasks` extended with `prompt` → `meta.prompt` and the §9.5 summary;
the §7.2 undo guard of answer 5; tests for context assembly, the tool executors, and the three-way
`ExtractResult` routing against a scripted fake provider. *Stage B — the composer UI:*
`components/composer/` (`ComposerButton`, `ComposerSheet`, `ModeSelector`, `PreviewPanel`,
`TaskCard`, one CSS module), mounted from Today and Calendar only; `components/settings/ApiKeys.tsx`
in the settings page; the Phase 3 stub panel in `TodayView` replaced by the real sheet in Ask mode;
and the Phase 5 rows in `docs/CHECKLIST.md`. Per the headless-browser paragraph above, Phase 5 does
not open that question.

### Approved conditions — Phase 5 Stage A review (rule 9)

Stage A approved at `03e2b4b`. Six items before Stage B, verbatim.

**1. §13.1 CACHE PREFIX** — fix it, and the fix is a spec change I'm making. Split the settings
preamble in two: stable settings (name, timezone, day shape) stay in position 1 and remain
cacheable; the current local time moves to a new uncached block AFTER the cache breakpoint,
immediately before the view-tasks table. Caching is prefix-based, so volatile content ahead of the
breakpoint invalidates everything behind it on every call — you are currently paying the 1.25x
cache-write premium for zero hits. Update §13.1's block order and record it as a Decision citing
your finding.

**2. `batch.ts`** — keep `targets` on `BatchResult` and accept 330. `runBatch` already computes
targets for the log, so returning them exposes an existing fact; any alternative re-derives what
`runBatch` knows. But name the seam NOW, while you have the file in your head: if it passes 350,
what comes out? Write that into the Decision 56 watch note so the split is decided in advance
rather than under pressure in Phase 6.

**3. `actions.ts` at 299** — no action, but record that it splits by domain (task builders / file
builders / settings builders) rather than by layer. It is a flat list of independent builders, so
the coupling hard rule 5 guards against is low and the seam is obvious.

**4. BOTH DEVIATIONS APPROVED.** `TurnEvent.error` carrying `code` is right — pattern-matching
§13.5's routing on error prose would break the first time a message is reworded. The flat-object
extract schema is right too: strict structured output over `anyOf` is exactly where these go wrong.
Record the second as a Decision, since `ExtractResult` stays a discriminated union in TypeScript
while the wire schema is flat — that difference should be written down, not discovered.

**5. `manifest.ts` UTC bug** — fix it in Stage B. It picks the `YYYY-MM` directory and the `added`
column from UTC while everything else in the app goes through `dates.ts`. Stage B exercises uploads
from the composer, so it is the right moment. One call to the existing timezone helper.

**6. RUN THE BAD-KEY HALF NOW.** You are right that it needs a live call but not a valid key — put a
garbage string in `.env.local` in the throwaway checkout and confirm the 401 path produces one toast
and no files. That closes half of §17's fifth check for free.

Then Stage B as approved, including the amendment `j` surface and the Phase 5 checklist rows.

**What item 6 actually found.** The rejected-key run failed on something else first: the SDK refuses
a *non-streaming* request client-side, before any network call, once `max_tokens` exceeds
128000/6 ≈ 21333 (`calculateNonstreamingTimeout` in the installed client). `messages.parse` is
non-streaming, so `runExtract` at §13.2's `max_tokens: 64000` threw every time — with a valid key
too. `parse` now runs over `messages.stream`, which carries the same `output_config.format` and
returns the same `parsed_output` with no ceiling. The bad-key check passes on the second run: 401,
`code: auth`, no task, no log line, no commit. This is the argument for insisting on the live half.

### Approved conditions — Phase 6a (rule 9)

Written before the build, verbatim from the approval. The plan proposed the 6a/6b split §17
anticipates, two stages inside 6a, and seven open calls; the approval kept the split, answered all
seven, and added two.

**Plan approved with the 6a/6b split. Stage A stops for review. Seven answers plus two additions.**

**1. PLAYWRIGHT** — yes, in Stage B, on your terms: dev dependency outside the §1 runtime budget
with the same standing as vitest, separate `npm run check:ui`, not wired into `npm test`, no CI
story (Phase 11 owns it). Your reason is the right one — Stage D's collision layout has no price at
which it is verifiable without a layout engine, and landing the harness with the first UI beats
retrofitting it.

Two conditions. `npm run check:ui` must fail with a readable message naming
`npx playwright install chromium` when the browser is absent, not a cryptic launch error. And
`publish-check`'s fresh-clone test must not invoke it.

**2. `ATTUNE_FAKE_PROVIDER`** — approved, shaped like Decision 45, and it is what makes call 1
worth anything: the §15 chat checks become verifiable on the surface a person uses rather than only
in the library. One added guard: **ignore the flag entirely when `NODE_ENV` is production, and say
so in the announcement.** A flag that silently replaces the model with a script must be structurally
incapable of being on in a real session, not merely loud.

A visible in-app indicator while it is active is your call — worth it if it is cheap.

**3. MARKDOWN** — build all of Decision 31 now, including the KaTeX pre-pass. The dependency
arrives in Phase 8 regardless; the only question is whether you build the pipeline once or twice,
and Decision 31's NUL-placeholder stashing is precisely the part that cannot be retrofitted cleanly.
Math in a chat answer is the expected case for this user, not an edge one.

**4. RAIL** — approved as proposed, Chats icon only, Distill disabled with a Phase 7 tooltip. This
does not contradict the Phase 3 composer ruling: the sheet was not needed then, the list is needed
now, and building a needed thing in its final geometry is what stops Phase 8 re-homing it.

**5. KEY** — I will get one, and I was wrong last turn about why. Your point stands: the injected
provider covers every §15 chat item. What a key buys is knowing the SDK stream, tool rounds and
finalize path work against the real client at all — the `messages.parse` lesson. It also unblocks
row 5.5.

**6. `runChatTurn`** — approved. §13.2's name belongs to the function §13.2 describes; rename Phase
5's in-memory loop to `streamModelTurn`.

**7. BOTH DEVIATIONS** — approved, recorded. `assembleContext` taking `openFile` and `taskIds`
rather than a `Conversation` is the narrower and better signature. On derived titles: **name the
fallback explicitly** for a first message that is empty, attachment-only, or rejected before it is
written.

**ADDITIONS:**

**8.** Stage B must check **stream-buffer cleanup on every terminal path AND on client
navigate-away**. §16.8 lists leaking buffers among the five non-goals, and it is the one of the five
that leaves no visible trace when it happens.

**9.** `lib/history/chat-actions.ts` as a fourth domain is the correct use of the Conventions rule —
the seam was named in the Phase 5 review, so building it and reporting is right. Noted, no action.

**Conditions into the status block first, then Stage A, then stop.**

**Scope, as planned and approved.** *Phase 6a is §17's steps (a), (b) and (c); Phase 6b is (d), (e)
and (f) and gets its own plan round.* *Stage A — the pure layer and the store, stopping for review;
nothing renders.* `lib/chat/uuid.ts`, `tree.ts`, `text-match.ts`, `anchoring.ts`, `refs.ts` and
`quotes.ts` with their §16.10 tests, ported from `HANDOFF-CHAT.md` Parts B, D, E and J with §16.2's
three substitutions; `lib/store/chats.ts` with a temp-directory round-trip test;
`lib/history/chat-actions.ts` as the fourth builder domain; and `lib/history/streaming.ts` carrying
§8's one sanctioned logging bypass, guarded to `chats/*/messages/*.md` with `status: streaming`.
*Stage B — linear chat:* `lib/agent/turn.ts` (§13.2's persisting `runChatTurn`, with the Phase 5
loop renamed `streamModelTurn`); the four `/api/chats` routes; `components/markdown/Markdown.tsx`
with all of Decision 31; `app/chat/page.tsx` with the rail's Chats panel; `components/chat/` for the
linear conversation; §9.6's Ask mode replacing Phase 5's inline refusal; Playwright and
`ATTUNE_FAKE_PROVIDER` on the terms above; and the Phase 6a rows in `docs/CHECKLIST.md`.

**Phase 6a's build carries three `code:` commits and three `docs:`**; the two rounds after it, which
take the totals to five and four, are the paragraphs below. `c06ed47` recorded the approval's
nine conditions; `58ac40d` built Stage A — the pure layer, the conversation store, the chat builders
and §8's streaming bypass, with nothing rendering — and stopped for review; `27e5e7f` and `c79d151`
carried that review's two items, Decisions 61 and 62 and the cross-references to them; `a63cb8d`
built Stage B; and this commit records the result. Rule 4's stage clause, plus one review round.

**What Stage A found.** The UUIDv7 ported from the handoff was not ordered within a millisecond,
which silently breaks the chain Decision 9 depends on — no message index, so `readConversation` takes
its order from a sorted directory listing, which is a timeline only if the ids sort. Fixed in the
generator rather than documented as a limitation, and Decision 61 says explicitly that a failure of
the creation-order test means the generator regressed and the test must not be relaxed.

**What Stage B found, all three from checks rather than from reading.** A client disconnect
abandoned the turn's generator mid-stream: the route stopped iterating, so `finalizeTurn` never ran
and the message stayed `status: streaming` on disk **forever**, with nothing in the log and nothing
committed. `request.signal` and the response stream's `cancel` are now joined into one controller
and the turn is drained to its end, so it takes its own abort path and writes the partial reply down
as `stopped`. This is exactly the class of leak condition 8 asked for a check on, and it was found
by writing that check. Second: a failure routed to a toast returned "no error" to the composer,
which cleared the box — losing the text §15 says a rejected send keeps. Third: an empty conversation
title round-tripped through YAML as `null` and failed its own schema on the first send.

**The Phase 6a close added a fourth `code:` commit, `ff4b277`, for the orphan sweep** (Decision 64).
Draining on client disconnect closed the case the browser checks found; process death is the same
wound with no in-flight fix available, and Decision 63's invariant is what makes the result
invisible — a `streaming` message reads exactly like a live one. `sweepInterruptedMessages()` in
`lib/history/streaming.ts` runs from `scripts/dev.mjs` at startup beside `clearStaleIndexLock`, and
repairs anything `streaming` that no log entry names: the prompt to `complete`, the reply to
`failed` with an interrupted reason, through `runBatch` so the repair is itself logged, committed
and undoable.

**What the sweep's own checks found.** `readActions` skips a torn line and keeps going — right for
the history view, wrong as this function's only input, because the line it drops could be the entry
naming the message about to be "repaired", and a log that fails to parse entirely reads as an empty
one, which would make every message look orphaned. The sweep now counts parsed entries against
non-empty lines and does nothing at all on a mismatch. Verified end to end against a throwaway
checkout as well as in `lib/history/sweep.test.ts`: two files left `streaming` with an empty log,
one startup, and afterwards `status: complete` and `status: failed` with the reason, two
`chat.update` entries, one commit `chat: recover 2 messages left by an interrupted run`, a clean
`git status --porcelain -- data`, and a second run reporting nothing.

**Two additions after that, a fifth `code:` commit and a fourth `docs:` — `f235db1` and `475298e`.**
The first promotes the finding above from one function's comment to a rule in Conventions: a reader
that tolerates malformed input is safe for display and unsafe as an authority, so anything making a
destructive or repairing decision counts what it parsed against what is there and refuses on a
mismatch. `sweepInterruptedMessages` is named as the first case with its trap spelled out;
`listTasks` is named as having the same shape and no destructive caller, so the first one that
appears owes the check; Phase 7's `kb:check` and Phase 8's link index are named as the next two
places it applies, both being scans that decide what is orphaned or broken. The second closes the
hole that made this phase's one flaky-looking run a mystery: `npm run check:ui` now refuses to start
when something is listening on the harness's port or on the app's dev port and the two Next walks to
when 3000 is taken, and it names the pid and the command to kill it. The ports live once, in
`e2e/ports.ts`, because a guard watching a port nothing runs on would pass silently. The scan runs
*before* the browser check on purpose — placed after, it could only ever be exercised on a machine
with the Chromium download, and `scripts/check-ui.test.ts` covers it in three cases from `npm test`.

**What that guard does not claim.** The suite ran 9 passed in 41.2s afterwards against 5.3 minutes
before, and the guard is not the reason — nothing was listening either time, so it never fired; the
warm `.next` cache is the likelier explanation and this is not evidence either way. What the guard
buys is a refusal instead of a slow, plausible-looking failure. The Phase 6a run that failed on a
10-second `expect` under contention is still the only sighting; if it recurs on a machine the guard
has cleared, that timeout is the thing to look at rather than the environment.

**Three things Phase 6b inherits.** `lib/agent/turn.ts` is at 297 lines, which is the cap; its
obvious seam if branching pushes it over is `finalizeTurn` plus the discard path, which is §16.3's
own paragraph rather than an invented one. `runChatTurn` already takes `parentId` and an optional
`userMessage`, so edit, regenerate and branch-from-here are three callers of what is there rather
than new machinery — Retry in `ChatView` is already the regenerate case. And the invariant to keep:
**a message on disk that is not in the log is always `status: streaming`**, which is what makes
`streamingWrite` and `streamingDiscard` safe to have at all.

**What Phase 6a leaves unverified.** `docs/CHECKLIST.md` rows 6a.1–6a.5: the rail's drag and its
persisted width, the composer's ten-row ceiling, §9.6's Ask mode end to end, both themes against
KaTeX, and long-conversation scrolling. Row 6a.6 has an expected result now and its mechanism has
been run, but the `Ctrl+C`-at-a-real-terminal half of it is still a person's job. Nine browser checks
cover the rest and run from `npm run check:ui`; row 5.4 is superseded by 6a.3, since Ask mode no
longer refuses. The Phase 5 provider-dependent row 5.5 is still blocked on the key.

### Approved conditions — Phase 6a close (rule 9)

Verbatim from the approval that closed Phase 6a. Three items, then 6b in a new session.

**Phase 6a approved. Three things, then stop — 6b in a new session.**

**1. THE ORPHAN SWEEP.** Draining on client disconnect fixes the case you found; process death
still leaves a permanently-streaming file, and Decision 63's invariant is what makes it
indistinguishable from a live stream. Add a startup sweep, same shape and same placement as
`clearStaleIndexLock`: any `messages/*.md` with `status: streaming` that is not in the action log is
an orphan — at startup there are no live streams from this process and this is a single-user local
app — so mark it failed with an interrupted reason and log once. Record it as a Decision citing bug
1 and Decision 63 together, since the invariant is both what makes the sweep safe and what makes the
orphan invisible without it. Checklist row 6a.6 then has an expected result rather than an open
question.

**2. §15 WORDING.** "One commit per finalized message" contradicts §16.3's "commit both files as one
`chat.message` batch". §16.3 is the specific one and your reading is right; change §15 to "one commit
per finalized turn" so the two stop disagreeing.

**3. AMENDMENT `o` NEEDS A TARGET PHASE.** Attachments stored but never sent to a provider is a real
half-feature — §9.2 uploads them, §13.2 says they go as image or document blocks. Target it at 6b:
that is the last chat phase, and an untargeted amendment on the last chat phase lands nowhere.

**Then update the status block and stop.**

### Approved conditions — Phase 6a close, two additions (rule 9)

Verbatim from the approval that followed the close. Both are conventions rather than features; the
first outlives this phase and is why it is in Conventions rather than only in a comment.

**Two small additions, then stop — 6b in a new session.**

**1. CONVENTION, from your `readActions` finding:** a reader that tolerates malformed input is safe
for display and unsafe as an authority. Any function making a destructive or repairing decision must
verify it read everything — count parsed records against raw records and refuse on a mismatch —
rather than trusting a lenient reader's silence. Name `sweepInterruptedMessages` as the first case
and the specific trap: a log that fails to parse entirely reads as an empty one, which makes every
message look orphaned. Note that `listTasks` has the same shape today with no destructive caller,
and Phase 7's `kb:check` and Phase 8's link index are the next places it applies.

**2. `npm run check:ui` should refuse to start when something is already listening on the dev port,
naming what to kill.** Stray servers from timed-out invocations are what turned a clear failure into
a 9.9-minute mystery, and a tool invocation that times out never runs `dev.mjs`'s shutdown, so they
accumulate.

**Then update the status block and stop.**

### Approved conditions — Phase 6b (rule 9)

Verbatim from the approval. Five answers to the plan's five open calls, then two additions and the
stage terms. The plan proposed four stages — A branching, B sidebar and conversation header, C
annotations and quote replies, D amendment `o` — with A stopping for review.

**Plan approved. Five answers, two additions.**

**1. LAYOUT.** The gutter is BESIDE the 640, not inside it — §16.5's figure is the message column
alone. As written the two specs don't compose: a 300px gutter inside 640 leaves a 340px reading
column. State the cascade explicitly in §16.5 rather than leaving it to emerge from two independent
rules: message column reserved first, then the gutter (300/200/hidden), then the sidebar
(280/strip), with the left panel's collapse as the release valve the user already controls.

Your yield order stands — gutter before the sidebar drops — but when the gutter hides it owes a
count, "N notes hidden", for the same reason §16.4 refuses to let off-path annotations vanish
silently. Record as a Decision.

**2. AMENDMENT `o`'S ON-RAMP — approved.** Attach, paste and drop on ChatComposer reusing
`components/composer/Attachments.tsx`. Your amendment `m` reading is right: the trigger named
`components/today/`, not this. But note the same pattern is now forming — Attachments has two
importers; if a third arrives, it moves to a shared home under the same reasoning `m` used.

**3. ONE HOME, `data/files/` — approved**, correct §4.7 as a Decision, and name the consequence in
it: deleting a conversation no longer deletes its attachments, because content-hash dedup means
another message may reference the same file. The manifest's `used-by` going empty is the visible
signal and `kb:check` is where it surfaces. Garbage collection is not this phase's problem, but it
should be a known trade rather than a surprise. `attachmentsDir()` and §4.7's tree entry go.

**4. READ ALOUD — approved exactly as proposed.** Build it, assert the observable half including the
unmount-when-absent path, and put "did you hear it" in the checklist rather than pretending.

**5. SPEC SPLIT — correct under the Conventions rule, build and report.** Add a threshold while you
are there, the same way Decision 56 named 350 for `batch.ts`: name the `check:ui` runtime past which
the suite needs sharding or selective running. Five minutes is my suggestion. Below it, always run
everything.

**Stage A stops for review; B, C and D are pre-approved to follow, reported together. Conditions
into the status block first.**

### Approved conditions — Phase 6b Stage A review (rule 9)

Verbatim from the review. Stage A approved, three items, then B, C and D under the pre-approval
already given.

**Stage A approved. Three things, then B, C and D under the pre-approval.**

**1. VERIFY THE FOCUS REFETCH.** Adopting `initial` only when the conversation id changed stops a
same-conversation refresh landing at all. Decision 20 says external file edits arrive on the next
request plus a refetch on window focus — confirm that path does not run through `initial`. If it
does, the gate has to be "server data newer than the last local change" rather than "different
conversation", because otherwise a hand-edited message file never appears in an open conversation.
Report which it is before building on it.

**2. CORRECT §16.2.** Your reading is right: Edit on prompts (parent = `edited.parentId`), Branch on
replies (parent = this message, forking the tail). The literal "same call with a new prompt" makes a
user message sibling to an assistant message. Record it as a Decision with your reasoning — the
argument belongs in the spec, not in a ChatView header.

**3. CONVENTION, from the two checks that passed too early:** a browser check must wait on a state
transition only the action under test can produce, never on a condition that may already hold. "The
newest reply is complete" was true of the previous turn; "the composer cleared" happens only after
`finalizeTurn`. Name both as the example. Stages B, C and D add roughly fifteen more checks, and
this is the failure that makes a suite pass while testing nothing.

Then B, C and D, reported together.

**Item 1's answer was neither branch of its conditional**, and the finding is Decision 69: the focus
path does not run through `initial` because *there is no focus path* — the app's only window `focus`
listener is the sync indicator. The id gate was also dead code, since `app/chat/page.tsx` keys
`ChatView` by conversation id and a navigation is therefore a remount. So the effect is deleted
rather than re-gated, and amendment `q` carries the unbuilt half of Decision 20.

### Approved conditions — Phase 6b close (rule 9)

Verbatim from the closing review. Phase 6b approved, three items, then stop — Phase 7 opens in a new
session.

**Phase 6b approved. Three things, then stop — Phase 7 in a new session.**

**1. CONFIRM WHERE THE EPERM RETRY LIVES.** If `renameAtomic` is in `lib/store/io.ts` then every
atomic write in the app is covered, which is what you want — a scanner holding a task file loses a
task the same way a held message file loses a message. If the retry went in only on the message
path, move it. Say which it is.

**2. THE CAP IS ERODING — schedule the splits, don't take them now.** `turn.ts` 312,
`useConversation.ts` 310, `batch.ts` 334, `actions.ts` near 299. Your reason for not splitting at the
end of a long build is right, so apply it in the other direction: take the three named seams at the
START of Phase 7, before its own work begins, when nothing is half-finished. Record that in the
status block as Phase 7's first task, with the seams already named so it is mechanical rather than a
design session.

**3. AMENDMENT `q` NEEDS A TARGET PHASE, same as `o` did.** Decision 20 claims a window-focus refetch
that does not exist. Target it at Phase 8: the document view is where "I edited this file in VS Code
and came back" is most likely, and you have already worked out that it goes through `reload()` rather
than `initial`, because `reload` is ordered against sends and can be skipped mid-stream. Record that
reasoning with the amendment so Phase 8 inherits it rather than re-deriving it.

Then update the status block and stop.

**Item 1's answer is "neither, and it was incomplete".** There is no `lib/store/io.ts`; the retry is
`renameAtomic` in `lib/store/files.ts`, which is more than the message path — `writeText`,
`writeBinary` and `rename` all go through it, so every markdown record (conversations, messages,
annotations, tasks, the file manifest) and every upload were already covered. But two writers had
their own `node:fs/promises` rename and were not: `writeJsonAtomic` in `lib/store/settings.ts`, which
is every JSON record the store owns and is what Phase 10's themes will use, along with the same
file's corrupt-settings quarantine rename; and `lib/store/env.ts`, which writes `.env.local`. The
condition's own reasoning covers all three — a scanner holding `settings.json` loses a setting the
same way — so `renameAtomic` is now exported and those three call sites use it.

### Approved conditions — Phase 6b close, one addition (rule 9)

Verbatim from the approval that followed the close. Same shape as the Phase 6a close's two additions:
a convention that outlives the phase rather than a feature.

**One addition, then stop — Phase 7 in a new session.**

Convert Decision 71 into a check, the same way `check-lib-imports` and the `SECRET_PATTERNS` sample
table did for their invariants. A test that greps the project for direct `fs.rename` / `renameSync` /
`fs.promises.rename` and fails on any occurrence outside `renameAtomic`'s own implementation in
`files.ts`.

Three writers drifted past a rule stated in prose; the fourth should not be able to. Wording the
Decision as "every atomic write in the project" is right and still only prose — the check is what
makes it true. Name the quarantine rename in the test's failure message as the reason it exists,
since that is the one where the cost is losing the evidence of a problem you already have.

Then update the status block and stop.

**Where it goes.** `lib/store/files.test.ts`. The invariant belongs to `renameAtomic`, and the one
place it cannot be enforced from is inside `renameAtomic` itself — a function cannot see who declined
to call it. It takes after the `SECRET_PATTERNS` table rather than `check-lib-imports` in the respect
that matters here: the samples there are assembled from fragments at runtime so the file does not
trip the scanner that reads it, and the forbidden forms here are assembled the same way for the same
reason, since this file is inside its own scan.

**Two rules, because the forms divide in two.** An fs import that brings a rename binding in under
*any* name catches the aliased case a text search for a member call would miss; a member call catches
`fs.rename`, `fs.promises.rename` and a namespace import under any name. Together they cover the
three forms the condition names. The scan is over `git ls-files` rather than a directory walk,
because the things to leave out are not a fixed list — `.e2e-sandbox/` is a whole second checkout of
this repo and `test-results/` comes and goes — and because a directory added later is then covered
without anyone remembering to add it. Forgetting is the failure mode being closed.

**The exemption is narrow on purpose.** `files.ts` is allowed to hold the import; the test then
asserts its single call site sits inside `renameAtomic`'s body. An import `files.ts` is permitted to
have and calls from somewhere else fails, because "outside `renameAtomic`'s own implementation" is
what the condition says and the file is not the implementation.

**What it found: nothing, and that is the result.** The three writers had already been moved, so the
scan was green the moment it existed — which is exactly the state in which a check proves nothing
until it has been made to fail. Each of the five forms was introduced into a tracked file and each
was caught: a member call on an fs default import, a `renameSync` named import, `fs.promises.rename`,
an aliased `rename as mv`, and the `require` destructuring. A call to `renameAtomic` itself, bare and
as a member, was not flagged. The exemption boundary was probed the same way — a second `fsRename`
call added to `files.ts` outside `renameAtomic` fails the third test by line number.

**And then it caught its own doc comment**, which is worth recording because of *when*. The forms
in the pattern list were assembled from fragments for exactly this reason; a comment spelling the
same forms out in prose was not, and it passed every run before the commit — because `git ls-files`
is what "the project" means here, so a file enters its own scan only once it is in the repository.
The first green run after `c2fde54` was the first honest one. Fixed in `2cfea96`; the comment now
describes the forms instead of quoting them.

**One thing it does not do**, named rather than left to be discovered: it reads text, so a rename
reached through a computed property or a dynamic `import()` resolved at runtime passes it. That is
the same limit `check-secrets` has and the same reason neither is the only defence — but the forms
that actually occur in a file someone writes by hand are the five above.

`npm run check:ui` was not re-run for this commit: nothing outside a test file changed, and Decision
67's five-minute run answers questions about the browser, which this does not touch.

### Approved conditions — Phase 6b close, one deferred amendment (rule 9)

Verbatim from the approval that followed the addition above. Recorded here rather than only in the
table because the table row is the amendment; this is why it is worded the way it is.

**One deferred amendment, then stop — Phase 7 in a new session.**

Add amendment `r`, targeted at Phase 11: publish-check greps the repo for AI-authorship strings, and
§12's skip list does not include `scripts/publish-check.mjs` — which must contain all four strings
literally in order to search for them, so it will fail on itself.

Record the fix rather than the symptom: assemble the patterns from fragments at runtime, the same as
`SECRET_PATTERNS` and `lib/store/files.test.ts`, rather than adding the script to the skip list. A
skip list is a rule scoped to an address, which is the shape that let three writers drift past
Decision 71.

Cite the self-scan blind spot you found here as the general case: a check that scans the project
cannot see itself until it is tracked, so its first green run proves nothing about its own text.

Then update the status block and stop.

**Confirmed before it was recorded, rather than reasoned about.** §12's grep is four literal strings
over the published file set with five skips, and `scripts/publish-check.mjs` is not among them —
read at `PROJECT.md` §12, not recalled. Running that grep over the published set as it stands today
returns one hit: `lib/store/env.ts:25`, `label: "Anthropic"` in `KNOWN_KEYS`. So the amendment covers
two cases and not one, and the second is the better argument for the fix, because nobody would call
it an authorship string.

**`PROJECT.md` §12 carries a pointer, because that is the sentence Phase 11 builds from.** The
amendment table is where the reasoning lives and the spec is where the requirement has to be, or a
phase reads §12, writes the four literals, and meets the wall the amendment exists to remove.

Nothing outside the written spec changed here, so `npm test`, `tsc` and `check:ui` answer questions
this commit does not raise. `check-secrets` runs on the commit regardless, via the hook.

### Approved conditions — Phase 7 (rule 9)

Verbatim from the approval. The plan proposed the three named splits in their own `code:` commit
with no review stop, then Stage A — the pure layer, the store, the builders, the §6.3 rule in
`runBatch`, `memory.ts`, the apply and promote routes and `kb:check`, with nothing rendering — stopping
for review, then Stage B, the surfaces. It named five findings (a batch committed mid-stream sweeps the
streaming message file into its commit; Ask-mode proposals have no surface; `index.md`'s links are
knowledge-relative while the tools take `data/`-relative paths; `/api/tasks/[id]/promote` has no
referent for `[id]`; `KnowledgeWrite` carries no title or type) and eight open calls.

Phase 7 plan reviewed. Approved to start, with conditions below. Keep the review
stop at the end of Stage A as you proposed.

ORDER
1. Conditions into the status block (docs: commit)
2. The three splits
3. Streaming-commit fix
4. Rest of Stage A
5. Stop for review

STEP 0 — SPLITS
No review stop. Condition: the split commit must be reviewable as motion only.
If `git diff -M` doesn't show the moved blocks at near-total similarity, the
edited part goes in a separate commit. The two comment updates (secrets.ts:36,
chats/route.ts:6) and the turn.test.ts import may ride along, but should be the
only non-motion lines in the diff.

STREAMING-COMMIT DEFECT
Own commit, after the splits so it lands in the post-split layout. Reproduce
first: the repro is a failing test that stays in the suite, not a manual
demonstration.
- Keep the :(exclude) pathspec approach. Do not switch to staging declared
  targets explicitly: over-staging is visible and recoverable, under-staging is
  silent and desyncs the tree from history, which breaks undo's SHA checks
  against bytes history never had.
- In test/dev builds, assert the staged set matches the batch's declared
  targets and warn on mismatch. Cheap, and tells us later whether explicit
  staging is viable.
- Give the in-flight path set a lifetime. Clear on abort and error, not just
  normal completion. A stale entry must be loud, not silent — otherwise a path
  is excluded from every later commit and nothing notices.

STAGE A CONDITIONS
- kb-check exit codes: three explicit tiers. Violations exit 1;
  could-not-evaluate (broken map frontmatter, listTasks.errors non-empty)
  exits 2; notices don't affect the exit code. CI currently can't tell a real
  violation from an evaluation failure, and the second is the one needing a
  human.
- regenerateIndex: confirm "skips the write when nothing changed" compares
  generated content, not a dirty flag or mtime. Content-based means existing
  checkouts self-heal on first regeneration. Update the seed fixture in the
  same commit as the link extractor, or the exit-0 clean-seed check tests the
  old world.
- Link normalization: keep the extractor pure and deterministic — no filesystem
  probing for which candidate resolves. Document the precedence. Add a test for
  a directory under notes/ sharing a name with a top-level data/ directory.
- Dice/0.8: one Decision covering measure, threshold, and normalization (case,
  punctuation, stop words). State that 0.8 came from the spec but is meaningless
  detached from the measure. Test a single-word title and two cases just either
  side of the line.
- Auto-apply: cap at one auto-applied write per turn, in addition to the
  three-line per-write limit.
- filterWrites: a rewritten write (duplicate note → append) must render on the
  card as the rewritten operation, with the reason. The approved op and the
  applied op must be the same. Also: only writes that passed through
  filterWrites unchanged are auto-apply eligible. Near-vacuous today; write it
  down before the eligible set grows.
- Note title: persist the derived title into frontmatter at write time, so it
  isn't recomputed on every read and silently changed when the model edits the
  opening line.

OPEN CALLS
1. Streaming fix in Stage A, own commit, repro first — yes, as above.
2. Auto-apply after finalize, only if the turn was kept — yes as proposed.
3. In-memory tray — yes. Note: losing a task draft costs a retype, losing a
   distill proposal costs a model call. Acceptable for Phase 7; distill is the
   first thing to get persistence if it proves slow or expensive.
4. Promote route — amendment approved, but use
   POST /api/collections/[slug]/promote {item}. Puts a real referent back in the
   path and files the route with the resource that exists. Button to Phase 8 as
   amendment s, agreed.
5. Drop §9.5 step 6's map link for collections — agreed; §6.3 is a rule about
   notes.
6. Unreferenced uploads as a notice, §6.5 amended — agreed; notices don't touch
   the exit code.
7. Title and type derivation — agreed, plus the frontmatter persistence above.
8. Defer search.ts to Phase 8 — agreed.

ADDITION TO STAGE B
An auto-applied write is the only filesystem change here that happens without
the user asking, and its whole visible trace is a toast. Add a persistent marker
in the transcript for an auto-applied write, carrying the same Undo affordance,
so the toast is the notification and not the record. Not asking for a full
activity view. If this is more than a small addition to Stage B, say so and
we'll scope it separately rather than stretch the stage.

**The spec calls this settles, made in the same commit as the conditions.** §14's promote row is
`/api/collections/[slug]/promote` (open call 4); §9.5 step 6 no longer asks for a map link when a
collection is created (open call 5); §6.5 names its three exit tiers and its notice section, with
unreferenced uploads as the first notice (the Stage A exit-code condition and open call 6). Amendment
`s` carries the promote button to Phase 8. The Decision for the title-similarity measure is written
with the code it describes, because its normalization — which stop words, which punctuation — is
decided there and a Decision that names a choice before it is made is a guess.

### Approved conditions — Phase 7, the git fix and the ownership question (rule 9)

Verbatim from the approval that followed the stop. The stop reported that `C:\Users\yzhao` is a git
repository (`origin` → `Flameyzyzyz/Typeformer`) holding 232 commits the test suite made, because
`lib/history/chat-actions.test.ts` builds its sandbox with no `git init` and its undo batches commit,
so git's repository discovery climbed out of the temp directory into the home folder. Found by the
staged-set comparison, whose paths came back relative to the wrong root.

Received. Stopping is right. Land the git fix — details and conditions below.
Do not run the suite again until it's in.

ORDER
1. Answer the two verification questions under HOME REPOSITORY before I decide
   what to do with C:\Users\yzhao\.git. Don't touch that repository.
2. Land the git fix (own code: commit) with the conditions below.
3. Continue the rest of Stage A, stop for review at its end.

HOME REPOSITORY
Good find, and correct call not to touch it. Two things I want verified before I
decide, both read-only:

a) Confirm the 232 commits really are all test-suite. Check for anything that
   isn't: other branches, tags, stashes, reflog entries, and dangling or
   unreachable objects (fsck --unreachable). The origin pointing at
   Flameyzyzyz/Typeformer means someone ran clone or remote add here at some
   point, so I want to know whether any real Typeformer history is still
   reachable in there before it goes.

b) Grep the committed trees for anything that would need rotating rather than
   just deleting — key-shaped strings, .env content, token patterns. The test
   sandboxes are presumably fixtures only, and nothing was pushed, but I want
   that confirmed rather than assumed before I decide between deleting and
   resetting.

Report both and stop; I'll decide. When I do, the move will be renaming .git
aside rather than deleting it — reversible, and it removes the push risk
immediately. That risk is the part that concerns me: no upstream stops flush(),
but it doesn't stop a person running `git push origin master` from their home
folder and putting 232 commits of temp files onto the Typeformer remote.

GIT FIX — APPROVED, WITH CONDITIONS
- GIT_CEILING_DIRECTORIES: yes. Note it's `;`-separated on Windows and
  `:`-separated on POSIX, needs absolute paths with no trailing separator, and
  is not applied to symlink-resolved components. Get that right per-platform.
- Add the positive check as well, not just the ceiling: before any committing
  operation, assert `git rev-parse --show-toplevel` equals REPO_DIR and hard-fail
  if it doesn't. The env var is prevention; the assertion is the invariant, and
  it holds regardless of how discovery was influenced (GIT_DIR, .git files,
  future git behaviour changes).
- In test and dev builds, a commit that fails because there's no repository must
  throw, not log commit: null and continue. The existing commitFailed path is
  right for production but in tests it reproduces exactly the class of bug we
  just found: a missing git init becomes a silent no-op that nobody notices for
  two months. Loud in test, handled in prod.
- chat-actions.test.ts: yes, git init. Also factor the sandbox setup into one
  shared helper and move the other three committing test files onto it, so the
  fifth one can't forget.

STREAMING FIX — ONE QUESTION BEFORE STAGE A CONTINUES
"A batch leaves out every in-flight path except its own targets" — I want the
exception keyed to ownership, not to target membership. As written, any batch
that happens to declare an in-flight path as a target pulls the half-written
message into its commit, which is the original defect reachable by a different
route. Auto-apply in Stage B is a writer that runs inside a turn, so this isn't
hypothetical. Key the exception to the owning turn, and add a test: a non-owning
batch that declares an in-flight path is either refused or has that path
excluded, and either way it's a warning.

Also confirm the startup sweep clears the in-flight set, not just the on-disk
streaming markers. A held path with no sweep-side release is a path excluded
from every commit for the life of the process.

ACCEPTED AS REPORTED
- Exit 2 winning over exit 1 when both occur: correct, and for the right reason.
  Record it in the Decision alongside the tiers.
- git diff -M: you're right and I was wrong. An extracted third of a file never
  pairs as a rename. --color-moved with the 72 unmarked lines enumerated is a
  better answer than the one I asked for, and the enumeration covers what I
  wanted to check.
- The start/assembleContext gap: fine as reported rather than fixed. Make sure
  the warning names the paths, and file it so it doesn't drift.

Don't run npm test again before the fix lands — agreed, and thank you for
catching that before adding another eight.

**Item 1's answers, as reported before the fix was built.** (a) One ref, `master`; no tags,
stashes, other worktrees, `packed-refs`, alternates or `shallow`; 464 reflog entries, all `commit`,
reaching the same 232 commits; `fsck --unreachable --no-reflogs` finds no commit or tree objects — no
Typeformer history is present. (b) The 1,086 committed blobs are Attune fixtures with no hit on
`SECRET_PATTERNS` or a wider token set. The rest of what that repository holds predates this project,
is the owner's, and is handled outside it; at the owner's direction it is not described here.

### Approved conditions — Phase 7 Stage B, the validation fix and amendment `u` (rule 9)

Verbatim from the approval that followed the Stage A review, except where marked: part of its first
section concerns the owner's home folder rather than this project, and the owner asked that it not
be recorded in the repo.

Stage A accepted. Proceed to Stage B under the decisions below. Two things
outside the phase come first.

HOME REPOSITORY — MY DECISION
Do not touch it. I'll handle it manually.

Recording the decision so it isn't reopened: rename .git aside rather than
delete, which kills the push risk now and stays reversible. The 232 commits are
temp fixtures and go with it.

*[The remainder of this section is the owner's own matter and is omitted at the owner's direction.]*

VALIDATION 500s — TAKE THIS NOW, BEFORE STAGE B
Raw validation dumps on malformed input is an information-disclosure bug, not a
tidiness one: schema internals and echoed input in a 500 body, on routes that
are about to start accepting model-generated writes. Predating Phase 7 doesn't
buy it another phase.

Own commit before Stage B: shared handler, 400 with a stable shape and a safe
message, dump behind dev-only, 500 reserved for actual faults. One test per
route family. If it isn't a contained mechanical change once you're in it, stop
and tell me rather than growing it.

AMENDMENT u — DEFER, WITH CONDITIONS
File it as amendment u. Don't chase it in Phase 7; a one-in-five heisenbug after
router.refresh() will eat the phase.

Conditions:
- Confirm and record that it is display-only — the reply is on disk and in the
  log, and the correct view returns on next navigation. If there's any path
  where a user's message is actually lost, it stops being deferrable and I want
  to know immediately.
- Note in the amendment that Stage B raises its cost: an auto-apply marker in a
  transcript that intermittently renders empty is worse than in one that
  doesn't, since a missing marker is indistinguishable from no write having
  happened. That's an argument for the log-backed design, not against
  deferring.
- Write down the one-in-five figure and the reproduction conditions while
  they're fresh.

STAGE B ADDITION — LOG-BACKED, AGREED
Read the marker from the action log. Right call, and the reason is right:
finalized messages aren't edited, and a marker written into a message would be
a second writer touching a file the streaming ownership rule just finished
protecting. Log-backed also means undo removes the marker for free rather than
needing a compensating edit.

Two conditions:
- The marker must be keyed to something stable, not to log position, so it
  still resolves after an undo or a later write.
- If the log read fails or the entry is missing, render nothing rather than a
  broken or half-populated marker — but warn. Silent absence is the failure
  mode this marker exists to prevent.

STAGE B — CARRY FORWARD
- The scripted-provider directives are the only coverage the prompts get this
  phase; the real-model rows stay blocked on a key and stay listed as blocked,
  not quietly dropped.
- Auto-apply is the one write that happens without being asked. Its toast,
  its Undo, and the new marker are one story — if any of the three doesn't
  land, say so before the end of the stage rather than at it.
- Stop for review at the end of Stage B.

Stage A conditions all met, and the two you went past them on — the GIT_DIR hole
in the top-level assertion, and the dev-exit push running from the wrong
directory without the ceiling — are both better catches than the conditions I
wrote. Noted.

**One thing the validation condition meets in this repo that the text does not say.** The app runs
only under `next dev` — `scripts/dev.mjs` spawns nothing else, and nothing here runs `next start` — so
`NODE_ENV` is `development` in the owner's daily use, and a dump gated on "not production" in the
*response body* would be on in the only place the app is used. The dump therefore never goes in a
response body, in any mode: outside production it is logged to the server's console, which is the
operator's own terminal, and the body carries only the stable shape.

### Approved conditions — Phase 7 close (rule 9)

Verbatim from the approval that followed the Stage B review, except where marked: one section
concerns the same matter as the omission above and is left out on the same terms.

Stage B accepted. Phase 7 is done pending the items below. Take 1 and 2 before
Phase 8; the rest are decisions.

1. TOAST OVER SEND — FIX THIS
Decision 5 is a live user-facing bug and I don't want it carried into Phase 8.
Seven seconds of dead Send after any toast, now including ordinary replies, is
a worse regression than the invisible-toast one you just fixed — it's less
visible and it fires more often. Enter still working is not a mitigation; it's
the thing that will keep it unreported.

Fix: the toast must never intercept pointer events except on its own
interactive controls. pointer-events: none on the container, re-enabled on the
button. That's a contained change and it fixes both forms at once.

Then add the regression check I don't currently have: after a toast appears,
a click on Send must reach Send. Both bugs in this area were found by looking
at the screen, and check:ui passed through both. A hit-testing check is the
thing that would have caught them.

If §10.0's corner turns out to be the real problem rather than the
pointer-events, say so and we'll move the corner instead.

2. QUARANTINE AMENDMENT u's CHECK
Accepted as display-only — the 30-run probe with disk state verified every time
is exactly what I asked for, and the second form (row stuck on streaming) is
useful. Deferral stands.

But a check that fails one run in five is now eating the signal from every
other check: 38/39 and 31/32 both reported u, and next time something real
fails alongside it I won't be able to tell at a glance. Mark it as a known
flake so it reports separately and a clean run reads as clean. Don't delete it.

DECISIONS
1. [[propose-tasks]] as a fifth directive — fine. Record it with the other four
   so the count in the plan doesn't read as authoritative later.
2. Proposals at turn end, applied after done — agreed, and it's the right
   ordering for the ownership rule.
3. Discard confirmation — add it for distill only. A discarded task draft costs
   a retype; a discarded distill costs a model call, which is the same
   asymmetry that put distill first in line for persistence. Everything else
   discards without asking.
4. §3 type-only imports — amend §3 rather than leave 13 standing violations.
   Type-only imports erase at compile time and create no runtime coupling, so
   the rule as written forbids something harmless while the thing it's actually
   protecting against (value imports) stays forbidden. Permit type-only imports
   from lib/store/ explicitly; keep lib/history/ closed, and keep the marker
   type where you put it.
5. Covered above.

ACCEPTED AS REPORTED
- Marker keyed to conversation/message/batch id, surviving undo and redo, and
  warning rather than half-drawing. Both conditions met. The client-side warn
  when an applied write has no marker is beyond what I asked for and is the
  right instinct.
- The two deliberate breaks are the right two.
- Rows 7.1–7.4 stay listed as blocked on a key, not dropped.
- PreviewPanel's collection Add unchecked in-browser: accepted, since the same
  card is checked in the tray. Note it as a known gap in the phase record so it
  isn't mistaken for coverage.
- e13d640's *[now `118503d`]* "three" vs two: leave it. AGENTS.md is the record and it's right.

*[One section is omitted here on the terms above. It has been carried out.]*

Nothing else on my side. Phase 7 closes when 1, 2 and *[the omitted item]* are in.

**The corner question, and the owner's answer.** Item 1's check found what `pointer-events` cannot
fix: in windows about 800–1100 px wide the toast's own Undo sits on the right third of Send, so a
click there undoes the auto-applied write instead of sending. A survey of the candidate positions
found no corner clear on every page. The question put to the owner, verbatim: "Item 1:
pointer-events: none is in, but it doesn't fully fix the corner. In windows about 800–1100 px wide,
the toast's own Undo sits on the right third of Send (at 1024×768, Undo is x 926–968 and Send is
903–968), so a click there undoes the auto-applied write instead of sending. No corner is clear on
every page. How should toasts stop taking Send's clicks?" The answer, verbatim: "Toasts lose their
buttons (Recommended)". The option as it was offered: "Toasts become text only: no Undo and no ×;
they leave when the animation ends. Undo stays on the transcript marker under the reply, with no
time limit. With the container already click-through, a toast can't take a click at any width or
corner, so the check passes everywhere. Cost: Undo lives in one place instead of two, and the toast
still covers Send visually for 7 s (clicks pass through)."

### Approved conditions — Phase 8 (rule 9)

Verbatim from the approval. The plan proposed Step 0 — `check:ui`'s arguments passed without a shell,
and `addFile` moved to `lib/history/file-actions.ts` as motion — in its own `code:` commit with no
review stop; then Stage A — the link index's freshness, the pure backlinks, graph and tree readers,
`search.ts`, the nine routes and the save, checkbox and file-operation builders, with nothing
rendering — stopping for review; then Stage B, the surfaces, stopping for review; then Stage C, the
graph. It corrected the phase's scope against §17 (the rail's other three panels, `Tree.tsx`, file
operations, the search box, and amendments `l`, `q` and `m` alongside `s`), reported the shell defect
as wider than `|` — a pattern containing a space is split in two, and `|` or `&` runs what follows as
a command — and named, among its findings, that `/api/files/raw` would serve an uploaded `.html` or
`.svg` from the app's own origin, and that the "Whole repo" listing would show `.env.local` to a read
route. Eight open calls.

Phase 8 plan reviewed. Approved to start under the conditions below. Same
caveat as before: I'm reviewing the handoff, not the code, so anything resting
on a line I haven't read is a question, not a ruling.

The two security findings are the most valuable part of this plan. Both are
things that would have shipped quietly.

SCOPE — SPLIT IT
Take your own offer: Stage C becomes Phase 8b in its own session. The graph is
the one part with a new dependency, a canvas rendering path, and no dependency
on it from anything else in the phase. It's the clean seam.

Stage B also needs an internal checkpoint. As written it's the rail, Tree, file
operations, the whole document view, four amendments, a components/tasks/ move,
and the search box. That's not one reviewable unit. Split it:
- B1: rail, Tree, document view read-only (strip, frontmatter, checkboxes,
  links, images, backlinks). Stop.
- B2: file operations, edit/save through the UI, amendments s/l/q/m, docked
  composer, search box. Stop.

If B1 comes in small, we collapse the checkpoint and move on. Easier than
unpicking a stage that grew.

SECURITY — /api/files/raw
The inline allowlist and the headers are right. Two conditions.

PDF is the hole in it. It's the one type served inline and exempted from
CSP: sandbox, and PDFs carry scripting. If the exemption exists because sandbox
breaks the viewer, then PDF goes to download alongside everything else for now;
inline PDF is a convenience and this is the app's own origin. If you've
established the viewer is safe under the headers you're setting, show me that
and I'll take inline.

Make the allowlist decide on sniffed content, not extension. A .png that isn't
a PNG gets served inline with an image content-type under an extension-keyed
rule. Sniff, and on any disagreement between sniff and extension, serve as a
download.

Add the check that the sandbox actually holds: a fixture .html and .svg under
uploads, fetched through the route, asserting the disposition and the headers.
A rule with no failing-case test is a rule that gets relaxed later by someone
who doesn't know why it's there.

SECURITY — "WHOLE REPO"
Git-tracked-only is the right primitive and I'm glad you found it. Two things.

It's necessary, not sufficient. It protects .env.local because that file is
untracked, which is true today and is one committed mistake away from being
false. Add an explicit deny-list on top — .env*, *.pem, *.key, id_*, anything
credential-shaped — applied to both the tree and the read route, independent of
tracking status. Belt and braces, because the failure is unrecoverable and the
check is cheap.

Enforce it in the read route, not just the tree. A path that doesn't appear in
the tree must still be refused when requested directly. Test that specifically:
request .env.local by path and assert the refusal.

FINDINGS — CONDITIONS
- Link index freshness signature: path + size + mtime misses a same-size edit
  inside one mtime tick. Rare, but the failure is a silently stale index, which
  is exactly the class this is meant to close. Use nanosecond mtime where the
  platform gives it, and say in the code what the residual gap is. If that's
  awkward, hash instead — you're already statting every file.
- The 409 stale-save check: be explicit about which bytes the SHA covers, and
  keep it the same bytes on both sides. If the editor hashes what it loaded but
  the route hashes after re-serializing frontmatter, every save is a false 409.
- "Open document" block with no size cap: don't leave this as an observation.
  Cap it in Stage A, say what happens past the cap (truncate with a marker, not
  silent drop), and record the number as a Decision.
- Rename: your table means a note can never be renamed, since a map always
  links it. That's coherent, but it's a user-visible dead end, not just a
  deferral. File the link-rewriting amendment with that consequence stated
  plainly, and make the refusal message say why rather than just listing the
  linking files.
- Checkbox toggling: disabling on count mismatch is the right safety valve.
  Make the disabled state visible and explained, not a silently inert checkbox.
- items.ts header correction: yes, and fix the import story rather than only
  the comment.

OPEN CALLS
1. Split — C becomes Phase 8b. B splits as above. Otherwise as proposed.
2. Reopening a conversation with context.file — agreed, show the conversation
   with the file as a chip. Amend §16.9 and §4.7. The literal reading is
   clearly not what anyone wants.
3. Sending from the document view — agreed, including sessionStorage handover
   and keeping text out of the URL. One condition: if the handover entry is
   missing or already consumed, the text must not silently vanish. Keep it in
   the composer and warn.
4. What the document view may write, by path — approved as tabled, recorded as
   a Decision. Enforce it server-side in the builder, not in the view. The view
   decides what to show; the route decides what's allowed.
5. Rename within-folder only, refused when linked — agreed, with the note above.
6. Search scoring — agreed: best single score, case-insensitive, subsequence
   bounded at twice the query length. Test both sides of the bound. Record the
   bound and the reason, the way Decision 72 recorded the 0.8.
7. How far q reaches — agreed. Document view plus open conversation, Decision 20
   reworded to name them.
8. Amendment s button placement — agreed, row list under the preview. Injecting
   into sanitized HTML is the wrong shape and you're right to avoid it.

CARRIED FORWARD — CONFIRMED
- Rows 7.1-7.4, 7.7, 5.5, 6b.7 stay listed as blocked.
- Amendment u: your reading of "a second form" is what I meant — anything
  beyond the two on record, and the document view is the surface I'd expect a
  third to appear on. Running tally per stage report, stop and tell me at more
  than one in five over five or more runs. Agreed.
- The check:ui shell bug: excellent find, and much worse than what I flagged.
  Arbitrary command execution from a -g pattern is not a quoting nit. Fix at
  the top of the phase as proposed, with the test covering all three patterns,
  and pull the workaround out of AGENTS.md.

ORDER
Conditions into the status block (docs:), then Step 0, then Stage A, then stop.
Same as you proposed.

**The write policy the approval refers to as "tabled"**, as the plan put it, so open call 4 can be
re-read rather than recalled. It becomes a Decision with the code that enforces it, in the builder:

| Under `data/` | Save | New | Rename | Delete |
|---|---|---|---|---|
| `tasks/` | through `writeTask`; `id` can't change | "New task" (title only) | only if nothing links to it | yes |
| `knowledge/notes/` | yes | title and map required | no (a map always links it) | yes |
| `knowledge/maps/`, `knowledge/collections/` | yes | yes | only if nothing links to it | yes |
| `knowledge/profile/` | body only | no | no | no |
| `knowledge/sessions/` | yes | no | no | yes |
| `files/` | text files only | text file, folder | only if nothing links to it | yes |
| `knowledge/index.md`, `files/index.md`, `chats/`, `history/`, `settings/`, anything outside `data/` | read-only | — | — | — |

**The spec calls this settles, made in the same commit as the conditions.** §17's Phase 8 no longer
carries the graph, and Phase 8b does, with the graph's check (open call 1). §16.9 and §4.7 now say
that reopening a conversation shows the conversation, with its file as a chip in the header, rather
than reopening the file (open call 2). Amendment `v` files the link-rewriting rename with its
consequence stated. The three Decisions the approval asks for — the write policy, the search bound
and the open document's cap — are written with the code each describes, as Decision 72 was, and so
are the raw route's and the "Whole repo" rules and Decision 20's rewording: a Decision that names a number or a rule before
the code has met it is a guess, and `q`'s own row is the record of what a spec sentence ahead of its
code costs.

### Approved conditions — Phase 8, the `{ git: true }` snapshot defects (rule 9)

Found in Stage A, after Step 0 (`61676db`) and before any Stage A code, while checking whether the
document view's saves could produce a `{ git: true }` snapshot. Three probes in a throwaway checkout:
redo of an upload threw (`git checkout 59417a8^ -- files/images/2026-09/cdf3cefe-x.png`); undo of a
task-body edit over 64 KB threw (`git checkout 6c95ef6^ -- tasks/2026-09-14-big.md`) and left the
file changed; a task body over 64 KB holding a key-shaped string was logged and committed, and so was
a two-line uploaded `notes.txt` holding one, which `scripts/check-secrets.mjs --all` then refused in
the same checkout ("Commit refused"). The question put to the owner, verbatim:

"Stage A found a hard-rule break, reproduced in a throwaway checkout. A `{ git: true }` snapshot is
never secret-scanned: runBatch accepted and committed a 2-line uploaded notes.txt holding a key, and
check-secrets refuses that same file. In the real repo, that is hard rule 4's commit deadlock,
reachable today through the composer's attach. Two more defects share the path. Undo and redo of
`{ git: true }` on data/ paths throw (git is handed `files/…` instead of `data/files/…`, and redo
checks out the commit's parent). Rollback can't restore them either. So an edit over 64 KB can't be
undone, and neither can Delete/Rename of an upload in Phase 8. How should I proceed?"

The answer, verbatim: "Fix all three now (Recommended)". The option as it was offered:

"Own code: commit before the rest of Stage A, failing tests first and kept in the suite. (1) The
write-path scan reads the on-disk bytes of every `{ git: true }` target and scans them the way the
hook does (skip files with a NUL byte, otherwise line by line), refusing before anything is logged.
(2) Rollback restores a `{ git: true }` before-state from bytes captured in memory when the snapshot
was taken; nothing new is logged. (3) Undo/redo pass git `data/<rel>`, at `<commit>^` for undo and
`<commit>` for redo. batch.ts is at 294 lines, so the capture may need the split Decision 56 names.
Then Stage A continues."

### Approved conditions — Phase 8 Stage A review (rule 9)

The owner's review of Stage A, verbatim:

"Stage A accepted. Proceed to B1 under the conditions below. One item first.

1. THE {git: true} SNAPSHOT DEFECTS — CHECK THE LIVE REPO
Right call to fix these mid-stage, and finding them by writing the tests first
is why they turned up. But the first one has a history, not just a future: a key
in an uploaded text file got committed, and after that the pre-commit hook
refuses every subsequent commit.

Before B1, check whether that already happened in any real checkout — this repo
and any throwaway that outlived its run. Same shape as the home-folder question:
a silent bug that ran for an unknown period, and the thing to establish is
whether it left anything behind. Read-only, report, don't remediate.

If it did fire, the secret is in history and the answer is rotation, not
rewriting. Tell me and stop.

Also confirm the other two defects were reachable only through paths that
existed before Phase 8. Rollback failing to restore a git-snapshot, and undo/
redo hitting the wrong path and revision, are undo-correctness bugs, and undo
correctness is the thing every SHA check in this project rests on. If any check
that passed in Phase 7 was passing over one of these, I want to know which.

ITEMS FOR REVIEW
1. batch.ts 328, files.ts 303 over cap. Accepted as reported — reporting beats
   inventing a seam. Record both with the reason, and note that batch.ts has no
   remaining named seam so the next growth needs a Decision, not a judgement
   call.
2. §4.8's used-by column: agreed, amend rather than build. An upload's backlinks
   answer the question live; a column filled at manifest-regeneration time is
   stale by construction, and a stale answer to "who uses this" is worse than no
   column, because it's the answer someone deletes a file on.
3. Symlink hole: good catch and the right fix. Confirm it covers writes as well
   as reads — a save or a rename through a symlink that lands outside its folder
   must be refused by the same rule. If writes go through a different path,
   they need the same resolution, and a test.
4. Generated index files not counted for rename: agreed. Condition: a rename
   must regenerate those indexes in the same batch, the way Phase 7 made the
   index a target of the note-creating action. Otherwise a rename leaves a dead
   link in a file the rename rule deliberately ignored.
5. Task renameable because id links survive: agreed for [[t_…]] links. Confirm
   path-form links to the task are still counted and still block. If both forms
   can address a task, only one of them surviving a rename is the case to be
   sure about.
6. Frontmatter rewrite and updatedAt on save: fine. Check it against the 409 —
   the editor hashes what it loaded, the route must hash the same bytes, and a
   route that re-stamps before hashing turns every save into a false conflict.
   You've said unchanged saves write nothing, which covers the byte checks, but
   the conflict path is the one to verify.
7. PDFs download, SVGs don't render: correct, that's the fallback and nobody has
   shown the viewer is safe. Record it as the current position with what would
   change it, so it reads as a decision rather than an omission.

ACCEPTED AS REPORTED
- check:ui with no shell, proven by putting the shell back and watching a marker
  file appear. That's the demonstration I wanted.
- The open-document cap at 32,000 characters, recorded.
- Mutation testing every guard, each failing exactly its own test. This is the
  strongest evidence in the report and I'd like it to stay the habit.
- 33 HTTP checks covering all four of my conditions, including .env.local
  refused five ways and the fake .png. Good.
- Amendment u: 2 runs, 0 failures, no new form. Keep the tally running.
- Blocked rows unchanged and still listed.

B1
Rail, Tree, document view read-only. Stop at the end. If it comes in small we
collapse the checkpoint and go straight on to B2; don't merge them pre-emptively.

Carry into B1: the document view is the surface I'd expect a third form of u to
appear on. Decisions 69 and 70 keep it off the server-render path, which should
help, but watch for it specifically."

**The live-repo check (item "one first"), done before any code, read-only. It did not fire.**
- **This repository.** The hook is active (`core.hooksPath=.githooks`), and there is no remote. The
  hook's own `SECRET_PATTERNS`, run over every one of the 623 objects in the store, reachable or
  not, over the index and over the working tree, found nothing. Nothing has ever been uploaded. No
  file under `data/` has ever been over 4,460 bytes, against the 64 KB line. None of the four
  batches in `actions.jsonl` has a `{ git: true }` snapshot or a failed commit; the one without a
  hash is `bcb7929`, whose hash waits for the next batch (Decision 47). `.env.local` does not exist
  on this machine.
- **What the defect would have left here.** Not a secret in history. Every batch commits the whole
  of `data/` (`paths = ["data", …]`), so with the hook active the upload's own commit is refused, the
  key stays on disk uncommitted, and every later commit carries it and is refused too. The trace
  would be `meta.commitFailed` in the log, and there is none. In a checkout without the hook, which
  is every throwaway, the key is committed.
- **Every other Attune repository on the machine**: 228 under `%TEMP%` and the scratch directories,
  plus `.e2e-sandbox`. None has a remote. Sixteen hold something secret-shaped, and each is a fake
  planted on purpose: the fixture `.env.local` files of `browse.test.ts` and
  `app/api/files/routes.test.ts` (`E` and `R` repeated, built from fragments), the one
  `git-snapshot.test.ts` run from before the fix, at 04:21 (`Q` repeated), and the two Stage A
  probes (`A` and `K` repeated). A check that its value is one character repeated, run without
  printing it, passed on every key-shaped match in the three repositories that are not fixtures. As
  a control, the scanner reported the probe's committed key in the object store, the index and
  the tree.
- **Found on the way, not remediated:** the test suite leaves its temporary checkouts behind. 228
  of them have piled up since 7 September.
- **The other two defects were reachable before Phase 8, and no check passed over them.** The 64 KB
  `{ git: true }` path is in `b931994` (Phase 2): undo, redo and rollback of any batch touching a
  text file over 64 KB were broken from then on. Redo of an upload was broken from `03e2b4b`
  (Phase 5), when the upload route landed. Before the fix, no vitest file wrote a file over 64 KB
  or undid or redid an upload. No browser check did either: the knowledge checks undo a
  `habits.md` of a few lines, and the attachment checks never undo. No HTTP check recorded here
  did either. Every SHA check through Phase 7 restored `{ content }`, `{ fields }` or `null`, and
  none rested on the git path. The nearest is `undo.test.ts`'s case that leaves a `{ git: true }`
  snapshot out of the unrestorable guard. It restores nothing, and it passed on a comment saying
  such a snapshot "restores through `git revert`, which addresses repository paths correctly". That
  was false for a data path. §7.2 still describes `git revert --no-commit`, which the code never
  ran. Both are corrected.

### Approved conditions — Phase 8 B1 review, addendum (rule 9)

The owner's addendum on two items of the B1 report, verbatim:

"Addendum on the two items cut off earlier. Both go in B2's first commit, with
the Markdown.tsx fix.

useSidebar.ts:64 — FIX IT
The convention exists and this is a standing breach of it, so it doesn't stay
reported. Read the message id the same way the rest of the app does.

Then make the convention checked, the way components/imports.test.ts checks §3.
A test that fails on any dataset read or getAttribute('data-...') in app code,
with test files excluded. That's how this one survived: a convention nothing
enforces is one that drifts, which is what the 13 type-only imports were.

TEMP CHECKOUTS — FIX IT, AND TELL ME WHAT'S THERE
This has more history than it looks. The home-folder repo came from a test
leaving git activity in a temp folder; lingering temp checkouts are the same
neighbourhood, so I want it closed rather than carried.

First, read-only: how many are there, where, roughly how much disk, and which
test files leave them. Confirm each one is self-contained — its own .git, and
nothing sitting where a later git walk could climb into it. The ceiling and
the toplevel assertion should make that moot; confirm it rather than assume it.

Then the fix belongs in lib/testing/checkout.ts, since all four committing test
files already go through it: register each checkout on creation, remove it in
teardown, and remove it even when the test fails. Add the check that proves it:
the suite asserts at the end that the temp directory count is back to where it
started, and fails if not.

Don't delete the existing leftovers by hand as part of this. Once cleanup
works, say how many there are and I'll decide — they're test fixtures and I
expect the answer is "remove them", but the last time a leftover got inspected
it turned out to hold something nobody expected."

**The temp-checkout survey, done read-only before any code.** Nothing was deleted, moved or run in place.
- **How many, where, how big.** 430 directories, all directly under `%TEMP%`
  (`C:\Users\yzhao\AppData\Local\Temp`), all named `attune-*`. Together they hold 44,084 files and
  9.9 MB. The oldest was last modified on 12 September and the newest on 16 September. Stage A
  counted 228 dating back to 7 September, and none from before the 12th is left now. Nothing in this
  project removed them.
- **Which test files leave them.** A full `vitest run`, with `%TEMP%` listed before and after, left
  21 new directories, one from each of 21 test files. Fifteen are the files that go through
  `lib/testing/checkout.ts`. The addendum says four, but fifteen call `createCheckout`. The other six
  make their own directory with `mkdtemp` and never remove it: `context`, `tools`, `chats`,
  `repository` (the `attune-enclosing-*` pair), `streaming` and `validation`. Two of the 430 are not
  from a test file at all. `attune-upload-secret-*` and `attune-gitsnap-*` are the Stage A probes.
- **Self-contained. 340 are, and 90 have no whole repository of their own.**
  - 340 directories have a whole `.git` of their own. So do the 27 `checkout/` directories inside the
    `attune-enclosing-*` ones. For all 367, `git rev-parse --show-toplevel` answers with the
    directory itself, with or without a ceiling.
  - 82 have no `.git` at all. 74 of those come from `chats`, `context` and `tools`, which never
    create a repository. The other 8 are `attune-chat-actions-*` directories, made on 12 September
    between 14:37 and 21:35. That was before `131b5a2` (23:49 that day) gave that file a repository.
    They are sandboxes from the runs whose undo commits went where the header of `checkout.ts` says,
    and each holds only `data/`.
  - 8 of the `attune-enclosing-*` outer repositories have a `.git` that is missing `HEAD` and
    `config`. Only two object files are left in each. Each `.git` was last modified at
    **2026-09-20 01:50:47**. That is four days after this project's last commit (16 September 04:03)
    and before this session began. At that same second, files were removed from `.git/hooks` and
    `.git/logs` in 103 leftovers, and from `data/` subdirectories in 19. No file anywhere under
    `attune-*` was modified after 17 September, so this was deletion, not writing. I do not know what
    did it. A temp cleaner that removes files by age fits the evidence, and would also account for
    the pre-12 September directories being gone. I have not verified that.
  - **With the ceiling, nothing climbs.** Git was run in each of the 90 with the ceiling the app sets
    (`GIT_CEILING_DIRECTORIES` at the checkout's parent), and every one answered "not a repository".
    **Without the ceiling, all 90 resolve to the repository that encloses `%TEMP%`**, because
    `%TEMP%` sits inside one. So the ceiling and the toplevel assertion are what make this moot. The
    directories themselves do not. A stray `git` call run in any of the 90, from outside the app's
    `gitOptions()`, would act on that enclosing repository. There are no symbolic links in any of the
    430. The only nested `.git` is each `attune-enclosing-*`'s own `checkout/.git`, which the test
    builds on purpose, and every one of those is whole.

**B2's first commit — the three items, built and checked.** The rest of B2 has not started.
- **`Markdown.tsx`** builds one `dangerouslySetInnerHTML` object per HTML string (Decision 98).
  New browser check, `e2e/chat.spec.ts`: a property set on a finished reply's `<strong>` node is
  still there after a second turn.
- **The `data-*` convention is a check** (Decision 99). There were two value reads, not one:
  `useSidebar.ts:64` and `anchoring-dom.ts:207`, the second in `rememberSelection`. Both are gone.
  `measure` takes its ids from `pairs` and finds each row from an id it already holds, the way
  `scrollMessageIntoView` does. `rememberSelection` keeps the row element, and `useAnnotationDraft`
  compares elements. `components/data-hooks.test.ts` scans `app/`, `components/` and `lib/`, test
  files excluded. **What it does not cover**, following the addendum's scope: seven selector uses of
  a `data-*` attribute in the chat. Four find a row by a held id (`[data-message='…']`), one finds a
  sidebar entry the same way (`[data-pair='…']`), one is `closest("[data-message]")` in
  `rememberSelection`, and one is §16.4's `[data-ui]` filter. The Conventions sentence reads on all
  seven. Item 1 for review.
- **Temp checkouts** (Decision 100). All 21 leaking files now go through `createTempDir`: the 15
  that call `createCheckout`, and six that called `mkdtemp` themselves. Removal happens in the file's
  `afterAll`, and again in the run's teardown for anything still registered. The run fails whenever a
  run-made directory was still there at the end. Two cases `afterAll` does not reach were found by
  trying them:
  - a file that throws while loading never runs its hooks;
  - under load, a timed-out test's git process holds the checkout as its working directory, so
    removal fails with EPERM.

  A process-`exit` backstop was tried first, and it never fired.

**Checked, and how.**
- `tsc` clean. `check-lib-imports`: 68 modules load.
- **Unit suite: 693/693, in two runs.** A direct `npm test` right after the change, with %TEMP% at
  451 matching directories before and after. And the baseline of the mutation runs (T0), with
  `--testTimeout=90000`.
- **The machine came under heavy load partway through**: a game and a recording encoder were
  running. From then on, the git-heavy test files time out at the default 5 s test and 10 s hook
  limits. The last plain `npm test` failed 62 tests, all in those files. Its %TEMP% count was 462
  before and 462 after: even with 62 timeouts, every directory was removed.
- **The mutation runs.** Each one was run against a clean baseline, restored byte for byte, with
  TEMP pointed at a folder of its own:

  | Mutation | Tests | Exit | Directories left |
  |---|---|---|---|
  | per-file removal off | 693 pass | fails, naming 21 "teardown did" | 0 |
  | that plus the check off | 693 pass | passes | 21 |
  | a throw planted at load in `browse.test.ts` | the file fails | fails, naming 1 "teardown did" | 0 |
  | that plus teardown's removal off | the file fails | fails, naming 1 "still there" | 1 |
  | a failing test planted in `browse.test.ts` | that test alone fails | no teardown message | 0 |
  | `element.dataset.message` put back in `measure` | only `data-hooks.test.ts` fails | — | — |
  | a `dataset` read put back in `rememberSelection` | only `data-hooks.test.ts` fails | — | — |
  | a fresh innerHTML object in `Markdown.tsx` | only the new chat check fails, of 9 in `chat.spec.ts` | — | — |

  The last three were each run once more with `--hookTimeout=90000`. Their first runs, and the
  first browser baseline, had extra failures, all timeouts. They are re-run and discarded, not
  counted. The browser baseline was 9/9 on the re-run.
- **Full `check:ui`**, the first run: 54 passed and 1 failed, "deleting a message with replies under
  it is refused" in `branching.spec.ts`, after 33.7 s. Its error text was not kept. The spec ran
  6/6 on its own straight after.
- **Full `check:ui`, the second run, output kept:** 54 passed and 1 failed. The failure was the
  sidebar's "drops to a strip" check, and it failed inside `newConversation`, before any message
  existed: the server log shows `GET /chat?c=…` answered in 18,982 ms, past the 15 s wait. That is
  before `measure` or anything else in this commit runs.
- **`sidebar.spec.ts` and `annotations.spec.ts` together, straight after:** the sidebar's six
  passed. Two annotation checks failed ("a note on a selection becomes a card", "two notes on the
  same message do not overlap"), and their error text was not kept. Those two go through the
  changed `rememberSelection` and `useAnnotationDraft`. `annotations.spec.ts` alone, straight after
  that, with output kept: **8/8**. In that run the first requests took up to 12 s. So **no full
  `check:ui` run has been clean since the change, and two annotation failures are unexplained**.
  Every failure that was captured was a slow server. Item 2 for review.

**Amendment `u` tally:** the known flake passed in every `check:ui` run this commit made (five
runs). No failures, and no new form.

**The leftovers now: 462 under `%TEMP%`, removal left for you.** 430 are the ones surveyed above.
32 were made today by runs of mine, and I left those too, so the count you decide on is exact:
- 21 from the full run before the fix, which is how the leaking files were identified;
- 11 from two runs under load, with the first version of the fix, before the registry existed (the
  EPERM case).

A separate folder, `%TEMP%\b2m`, held the mutation runs' output: the scenario that is meant to
leave 21 and the one that is meant to leave 1, 22 directories in all. I made it for this during this
session, and I removed it. It is not among the 462.

**For review.**
1. **The seven selector uses of `data-*` in the chat** (Decision 99). The check covers value reads,
   as the addendum scoped it, and the Conventions sentence covers more than that. Either the
   sentence is narrowed to "reads a value", or the seven get a ref registry and the check widens.
2. **No clean full `check:ui` since the change.** Every captured failure was the dev server
   answering slowly while the machine was under load, and two annotation failures are unexplained.
   The next full run on an idle machine settles it, before anything else in B2 is built on top.
3. **The 462 leftovers**: 430 from before, and 32 from today's runs, all listed above. Your call.
   Nothing in them has been touched.

### Approved conditions — Phase 8 B2's first commit review (rule 9)

The owner's review of B2's first commit, verbatim:

"All three items accepted. Good survey — 21 files, not 4, and the teardown
finding (afterAll doesn't run on a load-time throw, git holds checkouts open
under load) is exactly why cleanup needed a second layer.

DECISIONS
1. data-* selectors: move them to refs and widen the check. My reading of the
   convention is that data-* attributes are test hooks, so tests can rename them
   freely; an app selector keyed on one makes app behaviour depend on a test
   hook, which is the thing the rule prevents. A selector is a read in every
   sense that matters. Own commit inside B2, not before it. If any of the seven
   are genuinely awkward as refs — dynamic lists needing a ref map, say — report
   that one rather than forcing it, and we'll decide it individually.
2. Idle-machine check:ui: yes, before any more of B2. I'll confirm the machine
   is idle. Run the full suite twice. If both are clean, proceed. If the
   annotation failures recur on an idle machine, they're real, they go through
   code you changed, and they come first.
3. The 462 leftovers: remove them. Conditions: only the attune-* directories
   directly under %TEMP% that the survey listed, matched against that list, not
   a broader glob; log the count before and after; stop and report if anything
   refuses to delete rather than forcing it. Leave nothing outside that list
   touched.

CONDITIONS
- Failure evidence must always be kept. The first check:ui failure's error text
  wasn't saved and two annotation failures weren't captured, so three failures
  are now unexplained with no way back to them. check:ui should write the error,
  the trace and the server log for every failing check to a file that survives
  the run. A failure nobody can read is a failure we can't rule out.
- Record the load finding rather than papering over it. Git-heavy tests timing
  out under load isn't a leak — you showed nothing leaked — but it is a fragility
  signal. Don't raise the timeouts to make it go away. Note which tests, and
  we'll look at it if it shows up idle.
- The 20 September deletion: accepted as outside the project. Likely an OS temp
  cleaner; I'll check on my side. No action for you.

ACCEPTED AS REPORTED
- Markdown.tsx memoized with a check that a finished reply's nodes survive a
  second turn. That's the right check.
- anatomy-dom.ts:207 found as a second dataset read. Good.
- The mutation table — each guard failing exactly its own check, including the
  "check off, leak passes" row that proves the check is load-bearing. Keep
  presenting results this way.
- Amendment u: five runs, no failures, no new form. Keep the tally going.

ORDER
Idle check:ui twice, then remove the leftovers, then the data-* refs commit,
then the rest of B2. Stop at the end of B2."

**Read against the repository before building (rule 10).**
- "anatomy-dom.ts:207" is `components/chat/anchoring-dom.ts:207`, the second `dataset` read the
  report named. There is no `anatomy-dom.ts`.
- The failure-evidence condition comes before the idle runs, because an idle run that fails without
  it would be a fourth unreadable failure. It is its own `code:` commit.
- **The load finding: the tests that timed out.** The last plain `npm test` under load failed 62
  tests in 11 files, all of which commit through git: `lib/agent/auto-apply.test.ts`,
  `lib/agent/distill.test.ts`, `lib/agent/turn.test.ts`, `lib/history/batch-commit.test.ts`,
  `lib/history/chat-actions.test.ts`, `lib/history/document-actions.test.ts`,
  `lib/history/file-actions.test.ts`, `lib/history/git-snapshot.test.ts`,
  `lib/history/knowledge-actions.test.ts`, `lib/history/repository.test.ts` (one test) and
  `lib/history/sweep.test.ts` (all ten). The mutation runs under the same load also timed out in
  `lib/knowledge/index.test.ts`, `lib/store/browse.test.ts`, `app/api/files/routes.test.ts` and
  `app/api/validation.test.ts`. The default timeouts stay as they are. `--testTimeout` was raised
  only on the mutation runs' own command lines, never in `vitest.config.ts`, and it is not used for
  any run that counts.

### Approved conditions — the failure-evidence commit and the idle runs (rule 9)

The owner's reply to the report after `e80e6da`/`ef1e430`, verbatim:

"Machine is idle now — Medal is closed. Go ahead with the two full check:ui runs.

LEFTOVERS
The 11 are approved by name. An explicit list you've written out is exactly
what the condition was asking for; the thing I ruled out was deciding the set by
a broad match at deletion time. Remove all 462: the 451 from the saved listings
plus these 11, each matched by exact name:

attune-auto-apply-vyxDvw, attune-batch-commit-7xzSQ2, attune-batch-commit-icko9P,
attune-chat-actions-83AMjD, attune-chat-actions-xkSDnc, attune-distill-dH0g5v,
attune-distill-wgq4Sr, attune-enclosing-NNMYSQ, attune-file-routes-k4N00p,
attune-git-snapshot-Omd1xP, attune-git-snapshot-euDUAY

Log the count before and after. Stop and report anything that refuses to
delete rather than forcing it.

ACCEPTED
- Failure evidence: per-run folders, never auto-cleared, and the root cause —
  the flake run emptying test-results/ and wiping the gating run's traces — is
  a better find than the condition. That's why three failures went unexplained.
- The mutation table, as usual.
- createTempDir from beforeEach/beforeAll: fine as a comment, because the
  end-of-run leftover check is the actual enforcement and it caught both of
  your attempts. That's the convention being checked, not just written down.
- Load finding recorded, 15 files named, no timeout raised. Correct.

ORDER
Idle check:ui twice, then the leftovers, then the data-* refs commit, then the
rest of B2. If either idle run fails, the evidence folder is the first thing I
want to see, and that failure comes before anything else."

### Approved conditions — the read-only attribute on the leftovers (rule 9)

The owner's reply to the report that the deletion stopped at its first directory, verbatim:

"Approved: clear the read-only attribute, only inside the 462 directories matched
by exact name, then remove them. Same script otherwise — counts before and
after, stop on any other refusal.

This isn't the forcing I ruled out. What I wanted to prevent was a broad match
deciding the set at deletion time and a failure getting steamrolled. The set is
still the same explicit list, and the attribute is just how git stores objects
on Windows — the test suite's own cleanup already clears it. Right call to stop
and ask rather than assume that.

The partial removal in attune-auto-apply-2qI0BV is fine. It's on the list, it
was going anyway, and you verified nothing outside it was touched.

If the rerun refuses for any reason other than the read-only attribute, stop and
report it rather than adding another workaround.

ACCEPTED
- Both idle runs clean, 55 deciding checks, no retries. The earlier annotation
  failures were the loaded machine, not your code. Closed.
- Amendment u: 7 runs, no failure, no new form.

ORDER
Leftovers, then the data-* refs commit, then the rest of B2. Stop at the end of
B2 as agreed. If the refs commit turns up any of the seven that's genuinely
awkward as a ref, report that one rather than forcing it."

### Approved conditions — the Phase 8 close (rule 9)

The owner's review of B2, verbatim. Phase 8 closes on its three items and the tally it asks for.

"B2 accepted. Phase 8 closes after the three items below. Don't start 8b.

Two things stand out in this report: the React-remount handover defect, which
nobody reasoning about production would have found, and that two mutations
passed because the checks were wrong. Mutations exist to test the checks, not
the code, and this is the first time in the project they've done it visibly.
Say so in the phase record.

1. EDIT/PREVIEW DISCARDS — TAKE THE ONE-LINE FIX
Amend §10.2 and preview the draft. A toggle that warns and then discards your
typing is the same shape as the empty-conversation bug: work that exists and
isn't shown. A warning doesn't redeem it — people dismiss warnings. Preview is
what the button means, the draft is already in hand, and it's one line.

If it turns out not to be one line once you're in it, stop and tell me rather
than growing it.

2. FILES MENU NOT POLICY-AWARE
Offering Rename and Delete on things Decision 86 forbids means the menu's only
feedback is a refusal after the fact. Make the menu reflect the policy: disabled
with the reason, from the same table the builder enforces, not a second copy of
the rules. Server-side enforcement stays exactly as it is — this is display.

If the table isn't reachable from the component without breaking §3, say so and
we'll settle it rather than duplicating the policy.

3. THE LOAD
20 tests' difference between best and worst run is past fragility and into
unreliable. Right to raise no timeout, and I'm not asking you to now.

Before 8b starts, diagnose it: EBUSY/EEXIST on temp checkouts and `git add -A`
failures across 15 files that each pass alone is contention, not slowness, and
the fix is probably serialising git-touching files or giving each its own
tmpdir root — not bigger numbers. Report what you find; don't implement yet.

Note the dev server at 15-40s in the evidence folders as part of the same
picture. Both idle runs were clean, so this is environmental, but 8b builds a
canvas view and I don't want to debug rendering on a machine that does this.

ACCEPTED AS REPORTED
- base as the version the editor opened, not the latest read. That's what makes
  409 mean anything, and it's the detail I asked you to verify in Stage A.
- Checkbox inert while a draft is open: correct, a click is a save.
- sessionStorage handover, text out of the URL, with the render wait.
- Amendments s, l, q, m landed. p correctly didn't fire.
- The B1 check that changed its reading, not the row. Good that you flagged the
  distinction.
- TaskList.module.css at 337 lines: recorded, no action.
- 75 deciding checks, up from 56. 19 new in browser-write.spec.ts.

AMENDMENT u
No mention in this report. Give me the tally — runs this stage, failures, any
new form. B2 put editing and saving on the document view, which is where I said
I'd expect a third form. Silence isn't a clean result; I want the number.

PHASE 8 CLOSES on 1, 2, the u tally, and the load diagnosis reported. Then
we plan 8b in a fresh session."

## Deferred amendments

Anything deferred across a phase boundary gets a line here: where it was agreed, where it lands, and its state — including the reason, because the reason is the part that gets lost. An amendment that lives only in a chat does not survive the one-chat-per-phase boundary, and a compacted session cannot recall what it was never told.

| # | Amendment | Agreed in | Lands in | State |
|---|---|---|---|---|
| a | `/api/settings` is GET-only until `runBatch` exists; `PUT` waits for it | Phase 1 approval | Phase 2 | closed — `PUT` landed in Phase 2 |
| b | Drop the P/Invoke console-break harness | Phase 1 approval | Phase 1 | closed — never committed |
| c | Guard against a stale `.git/index.lock`: on startup, if the lock exists and no `git` process is running, remove it and log once. `taskkill /T /F` can leave it behind when `Ctrl+C` lands mid-commit, and the next git operation then fails with a message that reads like repository corruption | Phase 1 approval | Phase 2 — **missed** | closed in the follow-up — `492c035` |
| d | Record the resolved Next and React versions in `AGENTS.md`, not only in the phase report | Phase 1 approval | Phase 2 — **missed** | closed in the follow-up — `492c035` |
| e | Log the resolved `REPO_DIR` once at startup whenever `ATTUNE_REPO_DIR` is set, so a stray shell export cannot silently point the app at the wrong directory | Phase 2 approval | Phase 2 — **missed** | closed in the follow-up — `492c035` |
| f | `lib/schedule/dates.test.ts`, covering both 2026 `America/New_York` DST transitions (March 8, November 1) against the six functions `dates.ts` has now | Phase 2 approval | Phase 2 — **missed** | closed in the follow-up — `492c035` |
| g | `daysBetween`/`daysUntil` DST tests, off-by-one a day each way across both 2026 transitions | Phase 2 review | Phase 3, with the functions themselves | closed — `ec54cd4`, in `lib/schedule/dates.test.ts` |
| h | A secret in a task's own text reaches `actions.jsonl` through the `after` snapshot, not through `commitError`, and no scrubbing can remove it without breaking byte-identical undo. The pre-commit hook then refuses every later commit. Raised and reproduced during the Phase 2 follow-up review | Phase 2 follow-up review | Phase 2 follow-up | closed — `runBatch` refuses the batch (Decision 50) |
| i | A `force` that saves anyway past a `secret_rejected` refusal. Deferred, not rejected: a force has to exempt the pre-commit hook as well, or the block just moves one step later and the commit fails instead of the save — so half of it is worse than none. Wanted only if a real false positive shows up in use | amendment `h` approval | unscheduled | **deferred, deliberately whole-or-nothing** |
| j | The "preserve the user's text on refusal" obligation from `h` is cross-referenced only from §13.5, which is about the chat composer's provider errors. The first surface that can raise `secret_rejected` is Phase 3's inline task edit form; Phase 8's document view is the second. Phase 3's checks must include: an inline task edit containing a credential-shaped string is refused, the form keeps what was typed, and the error names the file and pattern without echoing the match | Phase 2 close | Phase 3, in its acceptance checks | closed — `78bd6b9`; the refusal, the file, the pattern, the un-echoed match and the untouched file are all checked over HTTP. `TaskEditForm` clears no field on failure, which is what preserves the text |
| k | Timeline **edge resize**, deliberately not built, with the semantics settled so it is never guessed at: a **bottom-edge** drag moves the end, so it writes `estimateMin`; a **top-edge** drag moves the start while the end stays put, so it writes `estimateMin` **and** `scheduled` together. §10.1 said both edges write `scheduled`, which was wrong and is corrected. Not built because body drag already covers rearranging a day, `estimateMin` is editable in the row's form, and resizing forces a decision about whether the rest of the day repacks around the new length that v1 does not need to make | Phase 3 build; semantics fixed in the Phase 3 review | unscheduled — build it only if the form proves too slow for the case | **deferred, semantics settled** |
| l | §10.1's "clicking the title opens the task in the document view". The document view is `components/browser/DocumentView.tsx`, which Phase 8 builds; until then the row title is plain text rather than a link to a page that says Chat arrives in Phase 6 | Phase 3 build | Phase 8, with the document view | closed — `c00929b`; the Today row's title is a link to `documentHref(task.path)`, and the document it opens carries the task's own Complete button and menu |
| n | **`npm run publish-check` must never invoke `npm run check:ui`.** The fresh-clone half of `publish-check` installs into a temp directory and starts the app; a clone has no Playwright browser binaries, so calling the browser checks there would turn "is this repo publishable" into "did someone run `playwright install` on this machine". The note also lives in `scripts/check-ui.mjs`, where the phase that writes `publish-check` will be looking | Phase 6a approval, condition 1 | Phase 11, with `publish-check` | **outstanding — a constraint on a script that does not exist yet** |
| o | **Attachments are carried on a message but are not sent to the provider yet.** §13.2 says attachments become image or document blocks "where the model supports them"; `ContentPart` in `lib/agent/registry.ts` has no such variant, and Phase 6a's chat composer has no attach control, so nothing can reach one. The record keeps `attachments` (§4.7) and the turn passes it through to disk. Building it means a `ContentPart` variant, base64 in `anthropic.ts`, and the `images`/`pdf` flags in `MODELS` actually being read | Phase 6a Stage B | **Phase 6b** | closed — `4bd7578`; the `ContentPart` variants, base64 in `anthropic.ts`, the `images`/`pdf` flags read, and attach/paste/drop on the chat composer |
| m | `TaskEditForm.tsx` and `format.ts` stay in `components/today/` and are imported across by `components/calendar/`, because moving them is churn for no behaviour change. The trigger is written down instead: **a third surface importing from `components/today/` is the signal to move the shared pieces into `components/tasks/`.** Phase 5's composer and Phase 8's document view are the likely third | Phase 4 approval | the phase that becomes the third importer | closed — `c00929b`; the document view was the third importer, so `TaskEditForm`, `TaskMenu`, `format.ts` and `TaskList.module.css` moved to `components/tasks/`, with `RowActions` and Today's row writes (`useTaskActions`) moving with them (Decision 104) |
| p | **`components/composer/Attachments.tsx` has two importers once the chat composer gets its attach control** — `ComposerSheet.tsx` and `ChatComposer.tsx`. Same shape as `m` and recorded for the same reason: moving it now is churn for no behaviour change, so the trigger is written down instead. **A third importer moves it to a shared home** — `components/files/`, since what it actually owns is the upload half of §9.2 rather than anything composer-shaped. Phase 8's document view is the likely third | Phase 6b approval, answer 2 | the phase that becomes the third importer | **outstanding — trigger recorded** |
| q | **Decision 20's "refetch on window focus" is not implemented anywhere in the app.** Its first half works — an external edit appears on the next request, because every page is `force-dynamic` — but no view re-reads its own data on focus, and the only window `focus` listener is `components/shell/SyncStatus.tsx`, which polls `/api/sync/status`. Found while checking whether Stage A's `initial` fix had closed that path: it had not, because the path was never open (Decision 69). Building it means a listener per view calling that view's own reload, skipped while anything is in flight — never a server render adopted as state, which is the bug Decision 69 is about | Phase 6b Stage A review, item 1 | **Phase 8**, with the document view | closed — `c00929b`; a `focus` listener per view calling that view's own ordered reload — the document view's `useDocument`, and `ChatView`'s `reload`, skipped while a reply streams |
| r | **`publish-check` greps the published file set for four AI-authorship strings, and §12's skip list does not name `scripts/publish-check.mjs` — but the script has to contain all four literally in order to search for them, so it is the first thing its own grep finds.** The fix is to assemble the patterns from fragments at runtime, the way `SECRET_PATTERNS`' sample table and `lib/store/files.test.ts` do, rather than adding the script to the skip list: a skip list is a rule scoped to an address, which is the shape that let three writers drift past Decision 71 | Phase 6b close, one deferred amendment | Phase 11, with `publish-check` | **outstanding — a constraint on a script that does not exist yet** |
| s | **§4.5's "Make this a task" button on a collection item.** Promote itself lands in Phase 7 as `POST /api/collections/[slug]/promote { item }` — one batch creating the task, appending its id to the collection's `tasks`, and appending ` → [[t_…]]` to the item line — and is checked over HTTP. The button waits because no surface renders a collection's items as rows until Phase 8's document view: the preview panel shows a collection *proposal*, which has no task to link to yet. The route moved from `/api/tasks/[id]/promote` because the task does not exist until the promote creates it, so `[id]` had no referent; the collection is the resource that does exist. Same shape as `l`: a real action whose only surface belongs to a later phase | Phase 7 approval, open call 4 | **Phase 8**, with the document view | closed — `c00929b`; §4.5's items are rows under a collection's preview, each with "Make this a task" through `POST /api/collections/[slug]/promote` (Decision 104) |
| t | **A throw in `start` or `assembleContext` leaves the turn's two message files on disk as `status: streaming`.** Both run in `runChatTurn` before the loop's own `try`, so neither the discard nor the finalize runs; the files are Decision 64's orphans and the next startup's sweep repairs them. Since `5d8efb6` it is no longer silent: the turn's `finally` releases its held paths, `releaseStreaming` finds the files still streaming, keeps them out of every commit and logs each path by name (`lib/history/in-flight.ts`). Fixing it means moving those two calls inside the `try` so the existing discard covers them — small, but it changes the order §16.3's finality contract is written in, so it was reported rather than folded into a fix about commits | Phase 7, the report after `5d8efb6` | unscheduled — reported, warned, and filed so it does not drift | **outstanding** |
| u | **After Stop, the chat pane can revert to how the conversation looked before the send — "New conversation", "Nothing said yet" — while the reply is on disk as `failed`/`stopped`, committed.** `e2e/chat.spec.ts`'s "Stop leaves the partial reply, marked stopped" fails intermittently: 1 in 5 on `483b23f` (before any of the git work, by stash), and about 1 in 5 across 31 runs after it. Instrumented, the failing runs are indistinguishable from passing ones inside `useConversation`: one instance, no remount, `settle`'s second read returns `failed` and is adopted (ticket 2 over 1). But the screencast's last frame is the empty pre-send view, and the DOM snapshots never show `failed`. The divergence starts after `settle` returns, when `send` calls `router.refresh()`. The shape is Decision 69's — a server render overtaking client state — reached by a route Decision 69's fix did not close; not yet explained, and not fixed. It is user-facing: a stopped reply can vanish from view until a reload. **Display-only, confirmed** (the Stage A review's first condition). A probe repeated the Stop check 30 times: 5 of 30 showed the wrong view, all five the empty pre-send screen. In every one, the user message was on disk as `complete` with its exact text and the reply was `failed`/`stopped` with its partial text. Both were in `actions.jsonl` and committed, and navigating away and back, and a reload, each showed the correct view. Two full `check:ui` runs, on `2ce9008` and on `f5018e5`, failed the same check with the other face: the reply row stuck at `streaming` for 15 seconds, with the same state on disk each time, the turn committed as `chat: Unfinished reply in …`. No path found loses a message; the composer does clear, because the send landed. **Reproduction:** that check; a `[[slow]]` prompt, whose scripted reply streams 24-character pieces 60 ms apart; `[data-ui='stop']` clicked the moment `You asked` is visible. The failure appears after `settle` returns, when `send` calls `router.refresh()`. It happened about 1 in 5 across 31 runs, 1 in 5 on `483b23f`, and 5 in 30 in the probe. **Stage B raises its cost.** An auto-apply marker in a transcript that intermittently renders empty is worse than one in a transcript that does not, because a missing marker is indistinguishable from no write having happened. That argues for the log-backed design, which a reload restores, not against deferring. A stopped turn never auto-applies (Decision 79), so the Stop path itself never carries a marker, but the mechanism under it is shared with every send | Phase 7, verifying the git fix | unscheduled — deferred by the Stage A review, with its conditions met; the deferral stands (Phase 7 close) | **deferred — display-only, reproduced, not explained; its check is a known flake, run apart and not counted (Decision 83)** |
| v | **A rename that rewrites the links to the file it renames.** Phase 8's Rename stays inside one folder and is refused when anything links to the file, and the refusal says why: renaming would leave every one of those links pointing at nothing. **The consequence, stated plainly: a note can never be renamed from the app.** §6.3 requires every note to be linked from a map, so every note always has a linker, and Rename on a note is a dead end the user can see, not only a deferral. The same holds for any task, map, collection or file something links to. The way round it today is by hand, outside the app, then fixing the links, which `kb:check` reports. Building it means one batch that renames the file and rewrites every body linking to it — tasks, notes, maps, collections — and §6.3's scan accepting the new path as the same note rather than a new one without a map. It can never be complete: a finalized message is never edited (§16.2), so every message whose `refs` name the old path keeps pointing at it | Phase 8 approval, open call 5 and the rename condition | unscheduled | **deferred — a user-visible dead end, stated as one** |
| w | **A `code.change` batch must secret-scan its own files' bytes.** Phase 8 found that a `{ git: true }` snapshot was never scanned, so a key in an upload reached the commit and the hook then refused every commit after it (Decision 89). `unloggedTexts` in `lib/history/scan.ts` now reads such files and scans them the way the hook does, but **only for data paths**. It skips `code.change` entries, because their targets are repository paths the store's reader cannot reach. Phase 9's `code.change` is the one batch whose every file is `{ git: true }` by design, and it commits outside `data/`, so it is exactly where the deadlock would come back. Before `build.ts` commits anything, its batch has to hand `refuseBatch` the text of each changed repository file, skipping one with a NUL byte as the hook does | Phase 8 Stage A, the `{ git: true }` fix | **Phase 9**, with `lib/agent/build.ts` | **outstanding — a constraint on code that does not exist yet** |

`n` and `o` are Phase 6a's. `n` is a constraint rather than a task — a thing Phase 11 must not do. `o` was untargeted when it was written and was given its phase at the Phase 6a close: it is half a feature, not an optional one, and 6b was the last chat phase there is. `o` closed in Phase 6b, which was the phase it had been given. `c`–`f` were agreed for Phase 2, did not land there, and closed in the Phase 2 follow-up. `g` and `j` closed in Phase 3, with the functions and the surface each was about. `i` stays deferred whole-or-nothing, and `k` joins it: its semantics are now written down, so a future session either builds exactly that or leaves it alone. `l` is waiting only for the phase that owns its target, and `m` and `p` are triggers rather than tasks: nobody builds them, the third importer trips them. `p` is `m`'s pattern showing up a second time, which is the argument for writing the trigger down rather than for moving the file: the same two-importers-and-waiting shape has now appeared in two different component folders without either one ever reaching three.

`q` is the odd one out and is filed here anyway: it is not a deferral of work anyone chose to skip but a **gap between the spec and the code found by checking a claim rather than assuming it**, and this table is the only place in the repo where "known, unbuilt, with the reason" is a recognised state. It is written down so that the next person to read Decision 20 does not take the second half of it for something that runs.

**`q` lands in Phase 8, and two things about it are already settled so Phase 8 inherits them rather than re-deriving them.** The *phase* is the document view, because that is the surface where the case is real: every writer today is the app itself and every write is followed by a `router.refresh()`, so nothing in the app needs a focus refetch yet — but "I edited this file in VS Code and came back to the tab" is the document view's ordinary Tuesday, and a view of a file that does not notice the file changing is the one place where Decision 20's claim stops being decorative. The *mechanism* is `reload()`, never `initial`, and the reason is Decision 69's: a server render is a snapshot with no ordering relative to the writes it might overtake, so adopting one as client state is how a later write gets undone by an earlier read. `reload()` is the opposite on both counts — it is ordered by issue against the sends it must not overtake (Decision 70), and it can be skipped outright while anything is in flight. So the shape is a listener per view calling that view's own reload, and the two ways to get it wrong are both already named. `o` is the precedent for giving it a phase: an untargeted amendment on a surface nobody owns lands nowhere.

**`r` joins `n` as a constraint on a script nobody has written yet, and it is the second one because the first was not enough.** §12 already carries the principle in the `BUILD_PROMPT.md` form — a file that trips the AI-authorship grep is a file that should not be in the published set, "never a reason to lengthen the skip list" — and that sentence is right about the case it was written for and does not reach this one. `publish-check.mjs` *belongs* in the published set. It trips the grep because the grep is made of literal strings and the script is the file that holds them, which is a property of how the check is built rather than of what is in the repository. So the fix has to change the check, and there are only two ways to do that.

**The skip list is the wrong one, for the reason Decision 71 cost three writers.** A skip list is a rule scoped to an address: it says *this file may*, and it stays true of that file no matter what the file later says. The rule it stands in for is about text — some mentions of a provider are legitimate and most are not — and an address is a poor proxy for text that gets worse every time it is extended. It is already imprecise here: run §12's grep over the published set as defined today and it has a second hit, `lib/store/env.ts:25`, where `KNOWN_KEYS` carries `label: "Anthropic"` so the settings key row has something to display. That is a legitimate provider name outside every skipped address, and the address-shaped fix for it is a sixth entry. `lib/agent/` is the one exemption that is honest, because naming a provider is what that module is for; the rest accumulate.

**Assembling the patterns from fragments is the other one, and it is the same move twice already made in this repo.** `scripts/check-secrets.mjs` holds no pattern text at all — it imports `SECRET_PATTERNS` from `lib/security/secrets.ts`, and a regex source like a key prefix followed by a character class does not match itself, so the scanner is outside its own scan by construction. `publish-check`'s patterns are literal strings, so it has no such luck: the pattern *is* its own match. That is the structural difference, and it is why the two files that do face it — `lib/security/secrets.test.ts`'s sample table and `lib/store/files.test.ts` — both build their forbidden forms from fragments at runtime. The property that makes this better than an exemption is that it is scoped to the text rather than to the file: `publish-check.mjs` stays fully inside the scan, and an AI-authorship line pasted into it tomorrow is still caught.

**And the general case, which is what the rename check bought at the cost of one commit: a check that scans the project cannot see itself until it is tracked, so its first green run proves nothing about its own text.** `lib/store/files.test.ts` assembled its pattern list from fragments and then failed on its own doc comment, which spelled the same forms out in prose — but only after being committed, because `git ls-files` is what "the project" means and an untracked file is not in it. Every run before that was green and none of them meant anything. `publish-check` will scan itself the same way and inherits the same blind spot, and it is worse placed than the test was: it clones into a temp directory, so the copy it scans is the committed one and the first honest run is the one after the commit that introduces it. Phase 11 should expect the first failure to be the script itself, and should read that as the check working.

## How we work

1. **Spec before code.** `PROJECT.md` and `AGENTS.md` came first; application code starts only when the owner asks for Phase 1.
2. **`PROJECT.md` opens with a Decisions section**: every call left open in the brief, one line of reasoning each. Keep it current when a decision changes.
3. **One phase at a time, in `PROJECT.md` §17 order.** Show a plan and wait for approval → record the approval's conditions (rule 9) → build → run that phase's acceptance checks and report results honestly, failures included → commit → stop. Never roll into the next phase unprompted.
4. **Three commits per phase: a leading `docs:` commit carrying the approval's conditions, one build commit — or one per approved stage, when the owner has split the phase into stages that stop for review — and a trailing `docs:` commit carrying the hash. All use a development prefix.** The leading one is rule 9 arriving as a commit: the conditions are the first thing the build touches, so they land before the code rather than with it. The trailing one exists because a commit cannot contain its own hash; it does nothing but record the phase's result in the status block (rule 8), and whatever the phase left unverified. `code:` for source and configuration, `docs:` for `PROJECT.md`, `AGENTS.md`, and the rest of the written spec. The other prefixes in the §8 vocabulary — `task:`, `knowledge:`, `chat:`, `settings:`, `file:` — belong to the running app: each describes a change to data under `data/`, is written by `runBatch`, and renders in the history mirror as `· task ·`. A phase build is never a `task:` commit. Messages read as if the owner wrote them. No AI attribution, no co-author trailers, no "generated with" footers, anywhere in this repo.
5. **If a phase is bigger than it looked, say so and propose a split** rather than quietly building all of it. On foundational work — anything later phases sit on — a review checkpoint is the default with an opt-out, never an offer. Propose the split as the plan, and let the owner collapse it; do not bury the checkpoint as an option at the end of a long plan, where declining to take it up reads as declining to have it.
6. **If it is unclear whether something is a project feature or personal to the owner, ask.** Project = code, `seed/`, docs. Personal = anything under `data/`.
7. **Prefer the boring solution.** Before adding a dependency, an abstraction, or a file over ~300 lines, say why first and wait.
8. **Update the Phase status block as the last step of every phase**, in the trailing `docs:` commit described in rule 4: move the phase to complete with the build commit's hash, name the next one, and carry forward anything left unverified. The next session starts there.
9. **Before building, write the approval's conditions into the Phase status block**, verbatim, as the first thing the build touches. Approvals arrive as prose in a chat and a chat gets compacted; conditions written into this file can be re-read instead of recalled. Anything deferred across a phase boundary goes in the Deferred amendments block at the same time.
10. **Never reconstruct from memory what can be read.** Two things fail the same way here. **The record** — what was approved, what a condition was, what was asked for — is checkable, so check it: re-read the file, or the transcript under `.claude/projects/`. **The code is checkable in exactly the same sense**, and a report describing what was built is a claim about the state of the working tree, not a recollection: having written a file is not knowing what it now says. So before a report states that a component is laid out a certain way, that a guard fires at a certain point, or that a rule is applied in some file, open the file and read the line — and cite it, so the reader can check it too. Having written it earlier in the same session is not an exemption; having written it before a compaction is the case where the belief is most confident and least attached to anything. If it cannot be checked from what is in context, say "I can't confirm this from what I have" and stop there. A confident wrong reconstruction is worse than an admitted gap, and the error runs in the direction that favors the reconstructor. A report that reads well is not evidence, and neither is an earlier report saying the same thing: **restating a previous answer is not answering, and a new question in the same area is a new question.**

## Hard rules (from `PROJECT.md` §1)

- No state library, ORM, component library, or CSS framework. No abstraction until three concrete uses.
- Runtime dependency budget 12 (not counting next/react/react-dom); 8 are allocated in `PROJECT.md` Decision 28.
- Secrets live only in `.env.local`. Nothing resembling a key is ever written under `data/` or committed.
- **The write path and the pre-commit hook share one pattern set — `SECRET_PATTERNS` in `lib/security/secrets.ts` — and anything the hook would refuse, `runBatch` refuses first.** Neither list may be narrowed independently of the other. The tempting fix for a false positive is to relax the write path and leave the hook strict; that puts the text into `actions.jsonl`, which is append-only and committed, and the hook then refuses every later commit until someone edits history by hand. That is the deadlock this rule exists to keep closed, so a false positive is fixed by changing the shared patterns or by changing the text — never by letting the two sides disagree.
- Every write goes through `runBatch()` in `lib/history/batch.ts`. `lib/store/` is the only module that touches the filesystem; `lib/agent/` is the only module that talks to a model provider.
- Source files stay under ~300 lines; split by feature, not by layer. **The cap is about coupling, so it applies to modules containing logic.** A CSS module is a flat list of selectors with no control flow and a test file is a flat list of independent cases; neither has the seam the rule guards against, and both are bounded by their subject instead (`PROJECT.md` Decision 56). `lib/history/batch.ts` came back under it in Phase 7 by the seam Decision 56 named — `scanBatch` and every other pre-log refusal moved to `lib/history/scan.ts` — and stays watched: the `runBatch` sequence is one ordered transaction and is not split.

## Stack and commands

Next.js 15 (App Router) · TypeScript strict · Node 24 · plain CSS with custom-property tokens · vitest.

Resolved versions, as installed and verified in this checkout — the ranges in `package.json` are what is declared, these are what actually ran:

| Package | Range | Resolved |
|---|---|---|
| `next` | `^15.5.0` | 15.5.25 |
| `react` | `^19.1.0` | 19.2.8 |
| `react-dom` | `^19.1.0` | 19.2.8 |
| `typescript` | `^5.9.0` | 5.9.3 |
| `vitest` | `^3.2.0` | 3.2.7 |
| `zod` | `^4.1.0` | 4.5.4 |
| `yaml` | `^2.8.0` | 2.9.0 |
| `@anthropic-ai/sdk` | `^0.124.0` | 0.124.0 |
| `marked` | `^18.0.12` | 18.0.12 |
| `dompurify` | `^3.4.15` | 3.4.15 |
| `katex` | `^0.18.7` | 0.18.7 |
| `@playwright/test` (dev) | `^1.63.0` | 1.63.0 |

```
npm install            # postinstall sets core.hooksPath=.githooks on every machine
npm run dev            # scripts/dev.mjs → next dev, flushes git push on exit
npm run init           # seed/ → data/ (refuses if data/ is non-empty)
npm test               # check-lib-imports, then vitest
npm run check:ui       # Playwright, chromium, dev server + throwaway checkout — not part of `npm test`; `@known-flake` checks run after, apart, and never set the exit code (Decision 83); arguments reach Playwright with no shell, so `-g "a b|c"` works as typed (Decision 91)
npm run history -- list [--n 20] | undo <batch> [--force] | redo <batch>
npm run kb:check       # orphans, broken links, size caps — exit 1 violations, 2 could not evaluate (Decision 73)
npm run check-secrets  # also runs from .githooks/pre-commit
npm run check-lib-imports   # every lib/**/*.ts must load in plain Node (PROJECT.md Decision 44)
npm run publish-check  # readiness for the public remote
```

## Conventions

- **Module header** on every source file: one line saying what it owns, then a `Failure behavior:` paragraph saying what happens when it breaks (degrade this feature, never the page).
- **Z-index tiers:** 20 in-scroll surfaces · 30 panels and bars · 40 toasts and modals. No other values.
- **No `enum`, `const enum`, `namespace`, or parameter properties (`constructor(private x)`) under `lib/`.** `scripts/*.mjs` import those files through plain Node, which strips types rather than compiling, and all four need emitted runtime code. `tsc --noEmit` and `next build` accept them happily; only the CLI breaks, and only at runtime. `npm test` runs `scripts/check-lib-imports.mjs` first, which imports every module under `lib/` in plain Node and names the ones that will not load, so this fails at test time rather than at a prompt. `lib/`→`lib/` imports carry the `.ts` extension for the same reason (`PROJECT.md` Decision 44).
- **`data-*` test hooks are sanctioned, and named the same way everywhere: `data-<thing>` on the element that *is* one of those things, valued with that record's stable identity.** `data-date` on a calendar cell, `data-task` on a task row, `data-message` on a message row (Phase 6), `data-node` on a graph node (Phase 8b). Singular, kebab-case, a noun for what the element is — never what it looks like or where it sits. Application code never reads one: if the app needs the value, it already has it in props or state, and an attribute the app depends on is not a test hook but an undeclared piece of state. They exist so a check can name an element without a fragile selector, and the reason to settle the convention rather than let each phase invent one is in `HANDOFF-CHAT.md`: `dom-map.ts` was 265 lines of mapping rendered DOM back to message identity, caused entirely by a DOM that carried no ids, and it is listed there under the fights that do not exist for this project because we render from our own data. That advantage is only real if the ids are actually put in the markup.
- **Splitting a file along a seam the spec already draws needs no approval and gets reported. Inventing a seam to fit a line count is a stop-and-ask.** Hard rule 5's ~300-line cap and rule 7's "say why first and wait" pull against each other the moment a file grows past it, and the resolution is *where the seam came from*, not how big the file was. If `PROJECT.md` already treats the parts as separate things — its own paragraph, its own numbered step, its own section — then the split is the spec's and building it is ordinary work; say in the phase report that it happened and why. If the parts only became separate because a number had to come down, the split is a design decision the owner has not made, and a file over the cap is the better outcome until they do: an invented seam is a coupling claim, and a wrong one costs more than the length it bought back. **Phase 5's composer is the first case and is on the right side of it:** `ComposerSheet.tsx` hit 428, and `Attachments.tsx` and `VoiceButton.tsx` are §9.2's two optional inputs, `useComposerTurn.ts` is §9.4 and §9.5's whole conversation with the server, and `draft.ts` is §9.5 step 4's merge rule. None of the four is a category invented on the spot.
- **Timers are never correctness.** Wait on the observable consequence; a timeout is a failure guard.
- **A browser check waits on a state transition only the action under test can produce, never on a condition that may already hold.** Two of Phase 6b's branching checks passed before their action had rendered: they waited on "the newest assistant message is complete", which was already true of the *previous* turn, and then read message ids that were still the old ones. What they wait on now is the composer emptying (`toHaveValue("")`) or the editor unmounting (`toHaveCount(0)`) — states that exist only once `send` has resolved without a failure, which is after `finalizeTurn` wrote and the conversation was re-read. The question to ask of every wait is "could this have been true one moment before I acted?"; if it could, the check is measuring the run's history rather than its own action. **This is the failure that makes a suite pass while testing nothing, and it does not announce itself** — one of the two passed on the first run and was found only because its neighbour failed the same way. It is the sharper form of the timer rule above: waiting on the observable consequence is not enough when the consequence was already there.
- **`npm run check:ui` runs everything until it passes five minutes** (`PROJECT.md` Decision 67). Below that, a partial run is a claim about what was checked and is not worth the minutes it saves. Past it, shard across workers — which needs a sandbox per worker first, since `fullyParallel: false` is there because one data directory and one git repository are shared — or run by spec file. Splitting a spec file along §17's step letters is the split rule above, not this threshold.
- **A reader that tolerates malformed input is safe for display and unsafe as an authority.** Skipping what will not parse and carrying on is right for a view — one broken file must not blank a page — but a function that makes a **destructive or repairing** decision from what it read has to verify it read *everything* first: count the records it parsed against the raw records present, and refuse on a mismatch rather than trusting a lenient reader's silence. **`sweepInterruptedMessages` in `lib/history/streaming.ts` is the first case**, and it shows the trap: it decides which messages nothing recorded, so a torn line `readActions` skipped could be the very entry naming a message it is about to "repair" — and **a log that fails to parse entirely reads as an empty one, which makes every message look orphaned.** Both failures run the same direction, which is the dangerous one: the less it manages to read, the more it does. `listTasks` has the same shape today — it skips a file and leaves the path in `listTasks.errors` — and is safe only because nothing destructive reads it; the first caller that acts on its output owes this check. **Phase 7's `kb:check` is the second case and the first acting caller of `listTasks`**: an unreadable map suspends its orphan rule and a non-empty `listTasks.errors` suspends its collection rule, each as exit 2 rather than a guess (Decision 73). Phase 8's link-index readers — backlinks, the graph — are next, and `LinkIndex.errors` is there so they can tell "nothing links here" from "I could not read what might".
- **Dirty-check writes.** Never write a value that is already set.
- **Atomic file writes** (tmp + rename) in the store; whole-file writes, never read-modify-write of shared arrays.
- **LF everywhere.** `.gitattributes` forces `eol=lf`; the store normalizes CRLF to LF before writing. Byte-for-byte checks compare hashes, not `git diff`.
- **Frontmatter keys are camelCase and identical to the TypeScript field names** (`createdAt`, `estimateMin`, `parentId`). One convention for every file under `data/`; there is no mapping layer at the store boundary.
- Dates: date-only `YYYY-MM-DD`, date-time `YYYY-MM-DDTHH:mm` in `settings.timezone`; timestamps ISO with offset. Paths in data files are relative to `data/`.
- Model IDs and effort come from `data/settings/settings.json`; nothing hardcodes a model.
- Tests live beside the code as `*.test.ts`; pure modules (`lib/chat/`, `lib/schedule/`, `lib/history/undo.ts`, `lib/store/frontmatter.ts`) must have them. Where a module is half decision and half filesystem, the decision half is a pure exported function so it can be tested without a temp directory — `undoState` and `findConflicts` in `undo.ts` are the pattern.
- **`ATTUNE_REPO_DIR` runs the app against another checkout** (Decision 45). Acceptance checks that write real batches use it rather than the owner's `data/`: seed a temp directory from `seed/`, `git init` it, then run any script with that variable set.

## Where to look things up

- Data shapes and file formats: `PROJECT.md` §4. Store surface: §5. History and undo: §7. Git sync: §8.
- Chat tree, streaming, annotations: `PROJECT.md` §16, with code to port cited from `HANDOFF-CHAT.md` (read only its `PORTABLE`/`ADAPT` parts). `HANDOFF-CHAT.md` and `BUILD_PROMPT.md` are private and are dropped by `npm run publish`; never make the spec depend on them.
- Claude API: `@anthropic-ai/sdk` — `messages.stream` and `output_config.effort`; adaptive thinking is the default, send no `thinking` param. **Structured output is `output_config.format` over `messages.stream`, never `messages.parse`**, which the client refuses above `max_tokens` `128000/6` (`PROJECT.md` Decision 27 says why, and why the code will look like a mistake if you have not read it). Agent SDK: `@anthropic-ai/claude-agent-sdk` `query()`; verify option names against the installed version before use.
- Weather: Open-Meteo forecast and geocoding endpoints, no key, attribution required (`PROJECT.md` §10.1).
