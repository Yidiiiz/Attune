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
| 5 — Composer | **in progress — Stage A** | — |
| 6–11 | not started | — |

The follow-up carries four `code:` commits rather than rule 4's one: the owner split it into stages that stop for review, and both the §11.5 fix and amendment `h` came out of those reviews. Rule 4's stage clause is what makes that correct rather than a violation; a phase built in one pass still gets one commit.

Phase 3 carries three for the same reason — Stage A (`ec54cd4`), the three corrections its review asked for (`9c1939a`), and Stages B and C together (`78bd6b9`) — each preceded by the `docs:` commit recording what was approved. Its closing review added a fourth round, spec-only apart from two comments: §10.1's edge-drag semantics corrected, §13.5's inline-versus-toast rule generalised, and `docs/CHECKLIST.md` started.

Phase 4 is one build commit, `91b0f70`: the approval collapsed the two proposed stages into one pass, because `calendar.ts` is a leaf and rule 5's default checkpoint is about foundational risk. Around it, the two `docs:` commits rule 4 now names outright — `7cf66a7` carrying the approval's conditions and its three spec consequences ahead of the code, and `004d5a4` carrying the result. Rule 4 described two commits while rules 4 and 9 together required three; its closing review amended the text rather than leaving each phase to explain the third.

That review made two other amendments, both spec-only. Hard rule 5's ~300 line cap is now about coupling, so it applies to modules containing logic and not to CSS modules or test files, which are bounded by their subject (Decision 56) — this resolves `TaskList.module.css` at 360, which had been a standing violation, as well as Phase 4's two long files; `batch.ts` at 317 stays in scope and stays watched. And `data-*` test hooks are now a sanctioned pattern with a naming convention in Conventions, settled here so Phase 6's message rows and Phase 8's graph nodes do not each invent one or fall back to fragile selectors.

Deferred out of Phase 2 into the phase that first uses each: `/api/tasks/[id]/complete` with repeat materialization (**landed in Phase 3**), `/api/tasks/[id]/promote` (Phase 7, which has collections), and `history.streamingWrite()` (Phase 6, its only caller). `GET /api/tasks` returned the unranked list until `lib/schedule/rank.ts` existed; it now returns the four §10.1 sections and nothing else.

Left unverified by Phase 3, and now written down where they can actually be run: **`docs/CHECKLIST.md`**, started in Phase 3 rather than Phase 11 because Phase 3 was the first phase to produce checks no HTTP client can answer. Three items — the weather element arriving without moving the date (settled by construction: the weather sits in a **side** column, so the grid is `1fr auto 1fr` with the date in the `auto` middle, which is what makes the centre independent of it; the residual is a narrow window, where a side column can outgrow its share), the Ask panel opening, and dragging a timeline block. The Phase 1 mintty `Ctrl+C` item moved there too, rather than living in this paragraph forever.

**Whether to add a headless browser is a decision for Phase 6's plan, not before.** Phase 3 wanted one and did not add it: jsdom was refused by the owner for having no layout engine, and Playwright or Puppeteer is a real dependency — a browser download, a second test runner, and a CI story — which is not something a phase adds mid-build to close three checklist rows. Phase 6 is where the question is actually forced: it is the largest phase, its checks are streaming, stop, retry, and branch-switching, and none of those can be observed over HTTP either, so its backlog is the one that makes the trade legible. Deciding it at plan time means it is weighed against `docs/CHECKLIST.md` as it stands then, in the open, rather than being reached for by whichever phase next finds itself unable to verify something. Phases 4 and 5 add their unverifiable checks to the checklist and do not open this; a phase that thinks it cannot wait says so in its plan and asks. Phase 4 did exactly that: rows `4.1`–`4.5` in `docs/CHECKLIST.md`, all pending, all needing a pointer or a rendering engine — the drag, the Shift hint that has to change while the key is held, the `+N more` expansion, the ↑/↓ keys, and the toolbar including a refused edit landing inline on a second surface. Phase 5 adds to the same list. Phase 6's plan decides.

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
| m | `TaskEditForm.tsx` and `format.ts` stay in `components/today/` and are imported across by `components/calendar/`, because moving them is churn for no behaviour change. The trigger is written down instead: **a third surface importing from `components/today/` is the signal to move the shared pieces into `components/tasks/`.** Phase 5's composer and Phase 8's document view are the likely third | Phase 4 approval | the phase that becomes the third importer | **outstanding — trigger recorded** |

`c`–`f` were agreed for Phase 2, did not land there, and closed in the Phase 2 follow-up. `g` and `j` closed in Phase 3, with the functions and the surface each was about. `i` stays deferred whole-or-nothing, and `k` joins it: its semantics are now written down, so a future session either builds exactly that or leaves it alone. `l` is waiting only for the phase that owns its target, and `m` is a trigger rather than a task: nobody builds it, the third importer trips it.

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

```
npm install            # postinstall sets core.hooksPath=.githooks on every machine
npm run dev            # scripts/dev.mjs → next dev, flushes git push on exit
npm run init           # seed/ → data/ (refuses if data/ is non-empty)
npm test               # check-lib-imports, then vitest
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
- **Timers are never correctness.** Wait on the observable consequence; a timeout is a failure guard.
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
- Claude API: `@anthropic-ai/sdk` — `messages.stream`, `messages.parse`, `output_config.effort`; adaptive thinking is the default, send no `thinking` param. Agent SDK: `@anthropic-ai/claude-agent-sdk` `query()`; verify option names against the installed version before use.
- Weather: Open-Meteo forecast and geocoding endpoints, no key, attribution required (`PROJECT.md` §10.1).
