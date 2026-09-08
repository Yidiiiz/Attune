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
| 6b — Chat: branching, sidebar, annotations | **next** | — |
| 7–11 | not started | — |

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
| l | §10.1's "clicking the title opens the task in the document view". The document view is `components/browser/DocumentView.tsx`, which Phase 8 builds; until then the row title is plain text rather than a link to a page that says Chat arrives in Phase 6 | Phase 3 build | Phase 8, with the document view | **outstanding** |
| n | **`npm run publish-check` must never invoke `npm run check:ui`.** The fresh-clone half of `publish-check` installs into a temp directory and starts the app; a clone has no Playwright browser binaries, so calling the browser checks there would turn "is this repo publishable" into "did someone run `playwright install` on this machine". The note also lives in `scripts/check-ui.mjs`, where the phase that writes `publish-check` will be looking | Phase 6a approval, condition 1 | Phase 11, with `publish-check` | **outstanding — a constraint on a script that does not exist yet** |
| o | **Attachments are carried on a message but are not sent to the provider yet.** §13.2 says attachments become image or document blocks "where the model supports them"; `ContentPart` in `lib/agent/registry.ts` has no such variant, and Phase 6a's chat composer has no attach control, so nothing can reach one. The record keeps `attachments` (§4.7) and the turn passes it through to disk. Building it means a `ContentPart` variant, base64 in `anthropic.ts`, and the `images`/`pdf` flags in `MODELS` actually being read | Phase 6a Stage B | **Phase 6b** — the last chat phase, so an untargeted amendment here would land nowhere | **outstanding** |
| m | `TaskEditForm.tsx` and `format.ts` stay in `components/today/` and are imported across by `components/calendar/`, because moving them is churn for no behaviour change. The trigger is written down instead: **a third surface importing from `components/today/` is the signal to move the shared pieces into `components/tasks/`.** Phase 5's composer and Phase 8's document view are the likely third | Phase 4 approval | the phase that becomes the third importer | **outstanding — trigger recorded** |
| p | **`components/composer/Attachments.tsx` has two importers once the chat composer gets its attach control** — `ComposerSheet.tsx` and `ChatComposer.tsx`. Same shape as `m` and recorded for the same reason: moving it now is churn for no behaviour change, so the trigger is written down instead. **A third importer moves it to a shared home** — `components/files/`, since what it actually owns is the upload half of §9.2 rather than anything composer-shaped. Phase 8's document view is the likely third | Phase 6b approval, answer 2 | the phase that becomes the third importer | **outstanding — trigger recorded** |
| q | **Decision 20's "refetch on window focus" is not implemented anywhere in the app.** Its first half works — an external edit appears on the next request, because every page is `force-dynamic` — but no view re-reads its own data on focus, and the only window `focus` listener is `components/shell/SyncStatus.tsx`, which polls `/api/sync/status`. Found while checking whether Stage A's `initial` fix had closed that path: it had not, because the path was never open (Decision 69). Building it means a listener per view calling that view's own reload, skipped while anything is in flight — never a server render adopted as state, which is the bug Decision 69 is about | Phase 6b Stage A review, item 1 | unscheduled — the trigger is the first time a file under `data/` is expected to change while a view of it is open, without that view having made the change | **outstanding — a spec claim the code does not support** |

`n` and `o` are Phase 6a's. `n` is a constraint rather than a task — a thing Phase 11 must not do. `o` was untargeted when it was written and was given its phase at the Phase 6a close: it is half a feature, not an optional one, and 6b is the last chat phase there is. `c`–`f` were agreed for Phase 2, did not land there, and closed in the Phase 2 follow-up. `g` and `j` closed in Phase 3, with the functions and the surface each was about. `i` stays deferred whole-or-nothing, and `k` joins it: its semantics are now written down, so a future session either builds exactly that or leaves it alone. `l` is waiting only for the phase that owns its target, and `m` and `p` are triggers rather than tasks: nobody builds them, the third importer trips them. `p` is `m`'s pattern showing up a second time, which is the argument for writing the trigger down rather than for moving the file: the same two-importers-and-waiting shape has now appeared in two different component folders without either one ever reaching three.

`q` is the odd one out and is filed here anyway: it is not a deferral of work anyone chose to skip but a **gap between the spec and the code found by checking a claim rather than assuming it**, and this table is the only place in the repo where "known, unbuilt, with the reason" is a recognised state. It is unscheduled on purpose — nothing in the app needs it today, since every writer is the app itself and every write is followed by a `router.refresh()` — and it is written down so that the next person to read Decision 20 does not take the second half of it for something that runs.

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
- Source files stay under ~300 lines; split by feature, not by layer. **The cap is about coupling, so it applies to modules containing logic.** A CSS module is a flat list of selectors with no control flow and a test file is a flat list of independent cases; neither has the seam the rule guards against, and both are bounded by their subject instead (`PROJECT.md` Decision 56). `lib/history/batch.ts` at 317 is over and stays watched — it is logic, and it is not split only because the `runBatch` sequence is one ordered transaction.

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
npm run check:ui       # Playwright, chromium, dev server + throwaway checkout — not part of `npm test`
npm run history -- list [--n 20] | undo <batch> [--force] | redo <batch>
npm run kb:check       # orphans, broken links, size caps
npm run check-secrets  # also runs from .githooks/pre-commit
npm run check-lib-imports   # every lib/**/*.ts must load in plain Node (PROJECT.md Decision 44)
npm run publish-check  # readiness for the public remote
```

## Conventions

- **Module header** on every source file: one line saying what it owns, then a `Failure behavior:` paragraph saying what happens when it breaks (degrade this feature, never the page).
- **Z-index tiers:** 20 in-scroll surfaces · 30 panels and bars · 40 toasts and modals. No other values.
- **No `enum`, `const enum`, `namespace`, or parameter properties (`constructor(private x)`) under `lib/`.** `scripts/*.mjs` import those files through plain Node, which strips types rather than compiling, and all four need emitted runtime code. `tsc --noEmit` and `next build` accept them happily; only the CLI breaks, and only at runtime. `npm test` runs `scripts/check-lib-imports.mjs` first, which imports every module under `lib/` in plain Node and names the ones that will not load, so this fails at test time rather than at a prompt. `lib/`→`lib/` imports carry the `.ts` extension for the same reason (`PROJECT.md` Decision 44).
- **`data-*` test hooks are sanctioned, and named the same way everywhere: `data-<thing>` on the element that *is* one of those things, valued with that record's stable identity.** `data-date` on a calendar cell, `data-task` on a task row, `data-message` on a message row (Phase 6), `data-node` on a graph node (Phase 8). Singular, kebab-case, a noun for what the element is — never what it looks like or where it sits. Application code never reads one: if the app needs the value, it already has it in props or state, and an attribute the app depends on is not a test hook but an undeclared piece of state. They exist so a check can name an element without a fragile selector, and the reason to settle the convention rather than let each phase invent one is in `HANDOFF-CHAT.md`: `dom-map.ts` was 265 lines of mapping rendered DOM back to message identity, caused entirely by a DOM that carried no ids, and it is listed there under the fights that do not exist for this project because we render from our own data. That advantage is only real if the ids are actually put in the markup.
- **Splitting a file along a seam the spec already draws needs no approval and gets reported. Inventing a seam to fit a line count is a stop-and-ask.** Hard rule 5's ~300-line cap and rule 7's "say why first and wait" pull against each other the moment a file grows past it, and the resolution is *where the seam came from*, not how big the file was. If `PROJECT.md` already treats the parts as separate things — its own paragraph, its own numbered step, its own section — then the split is the spec's and building it is ordinary work; say in the phase report that it happened and why. If the parts only became separate because a number had to come down, the split is a design decision the owner has not made, and a file over the cap is the better outcome until they do: an invented seam is a coupling claim, and a wrong one costs more than the length it bought back. **Phase 5's composer is the first case and is on the right side of it:** `ComposerSheet.tsx` hit 428, and `Attachments.tsx` and `VoiceButton.tsx` are §9.2's two optional inputs, `useComposerTurn.ts` is §9.4 and §9.5's whole conversation with the server, and `draft.ts` is §9.5 step 4's merge rule. None of the four is a category invented on the spot.
- **Timers are never correctness.** Wait on the observable consequence; a timeout is a failure guard.
- **A browser check waits on a state transition only the action under test can produce, never on a condition that may already hold.** Two of Phase 6b's branching checks passed before their action had rendered: they waited on "the newest assistant message is complete", which was already true of the *previous* turn, and then read message ids that were still the old ones. What they wait on now is the composer emptying (`toHaveValue("")`) or the editor unmounting (`toHaveCount(0)`) — states that exist only once `send` has resolved without a failure, which is after `finalizeTurn` wrote and the conversation was re-read. The question to ask of every wait is "could this have been true one moment before I acted?"; if it could, the check is measuring the run's history rather than its own action. **This is the failure that makes a suite pass while testing nothing, and it does not announce itself** — one of the two passed on the first run and was found only because its neighbour failed the same way. It is the sharper form of the timer rule above: waiting on the observable consequence is not enough when the consequence was already there.
- **`npm run check:ui` runs everything until it passes five minutes** (`PROJECT.md` Decision 67). Below that, a partial run is a claim about what was checked and is not worth the minutes it saves. Past it, shard across workers — which needs a sandbox per worker first, since `fullyParallel: false` is there because one data directory and one git repository are shared — or run by spec file. Splitting a spec file along §17's step letters is the split rule above, not this threshold.
- **A reader that tolerates malformed input is safe for display and unsafe as an authority.** Skipping what will not parse and carrying on is right for a view — one broken file must not blank a page — but a function that makes a **destructive or repairing** decision from what it read has to verify it read *everything* first: count the records it parsed against the raw records present, and refuse on a mismatch rather than trusting a lenient reader's silence. **`sweepInterruptedMessages` in `lib/history/streaming.ts` is the first case**, and it shows the trap: it decides which messages nothing recorded, so a torn line `readActions` skipped could be the very entry naming a message it is about to "repair" — and **a log that fails to parse entirely reads as an empty one, which makes every message look orphaned.** Both failures run the same direction, which is the dangerous one: the less it manages to read, the more it does. `listTasks` has the same shape today — it skips a file and leaves the path in `listTasks.errors` — and is safe only because nothing destructive reads it; the first caller that acts on its output owes this check. **Phase 7's `kb:check` and Phase 8's link index are the next two places it applies**: both decide what is orphaned or broken from a scan, which is the sweep's shape exactly.
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
