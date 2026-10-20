# Continuation progress — direct acceptance review, 2026-10-15

Owner resumed with “Continue from docs/progress.md.” Preserve the saved pause
record and evidence; continue Phase 10 corrections before release tooling.

Current milestone on resume: finish PROJECT.md §17 in phase order. Preserve the owner's
untracked HANDOFF.md. All commits are local; nothing has been pushed or published.

Automation is implemented: strict task/result schemas, atomic six-launch budget,
foreground process ownership, independent checks, explicit report review, and
baseline/scope protection. All 20 adversarial Windows runner tests pass.
Startup instructions and the supervisor prompt are in docs/SUPERVISOR.md.
Both installed clients report saved sign-in. The live probe used 2 of 6 launches; four remain. No budget reset occurred.

The owner explicitly approved repository-context transmission on 2026-10-14.
The live two-task Claude → Codex foreground probe then passed with saved client
sign-ins: no API fallback, no worker tools, no source edits and no product-acceptance
claim. Both strict reports had independent library checks exit 0 (87 modules), zero
changed files/violations, and accepted supervisor reviews. Actual run IDs:
- VERIFY1: 67959ba718e8488aa81e9e9526410602 (worker 8.58 s; check 2.99 s).
- VERIFY2: 6ebc5a6fa70c45b2a8c002f5b93f4db6 (worker 9.69 s; check 0.52 s).

The initial launcher omitted Edit permission, so the supervisor stopped after
VERIFY1 when it could not link the second task. The same conversation was resumed
with Edit allowed only for .agent/tasks/verify-2.json; no shell-write workaround.
Both reviews belong to session a914fdc6-a215-4879-ab38-64788ee420a2. Supervisor
processes exited 0; no foreground worker or background continuation remains.
Evidence: .agent/supervisor-smoke.log, .agent/supervisor-resume.log,
.agent/runs/<run-id>/report.json and worker/check logs; reviews in runner SQLite.
Keep raw logs private. The earlier automatic-review rejection is historical,
resolved by the owner's explicit approval; do not treat it as a current blocker.

Phase 8b is complete: content-addressed history blobs, integrity preflight before
undo, measured browser timing and the canvas graph. Full browser verification:
81/81 gating checks in 3.2 minutes; Stop passed separately. The existing five-minute
threshold stands. Both graph themes were inspected. No personal data was changed.

Phase 9 is complete: backend a092f98, UI/routes 1fb49d5. Both stages accepted locally.
Four browser checks cover both gates, real commits, resume, Revert, Auto, Undo and
personal-path refusal. Full suite: 770/770 in 66 files (92.31 seconds), TypeScript
clean. Full browser run: 85/85 gating in 4.3 minutes; Stop passed separately in
16.9 seconds (Phase 9 tally 1/1). No timeouts or thresholds changed.

Per-spec gating seconds: annotations 27.3, attachments 8.1, branching 21.4,
browser-write 41.61, browser 18.31, Build 20.6, chat 30.7, graph 7.02,
knowledge 26.5, sidebar 35.8, toast 11.5. Startup 1.707 seconds.
Evidence: check-ui-evidence/2026-10-14T21-05-48-113Z and .agent/ui-build-full.log.

Phase 10 backend is implemented: section-scoped queued saves, validated personal
themes, logged save/delete with fallback selection and Undo, generated unsaved token
maps, and a credential-free remote label. Backend bf37c8e is accepted locally. Thirteen focused checks pass and TypeScript
is clean. The broad run was 775/776; the only failure was the CSS convention check,
corrected and pinned by Decision 112. Repeat the full suite after the interface.

Phase 10 is complete locally: backend bf37c8e, interface c71c1e5. All Settings
sections, themes and History are implemented. Full deterministic run: 780/780 in
68 files (62.13 seconds), TypeScript clean. Full browser: 93/93 gating in 4.0 minutes,
native exit 0; Stop passed apart in 15.5 seconds (phase tally 1/1). Settings after
review: 9/9 in 29.7 seconds. A strengthened delayed-read test failed when its guard
was removed (new draft became empty), then passed with exact source bytes restored.
Light/dark and narrow screenshots inspected. Negative evidence is retained under
.agent/ui-settings*.log and check-ui-evidence/. No timeout or threshold changed.

Phase 11 implementation is complete locally. Technical acceptance passed on source
73c7570: 788/788 tests in 70 files (76.69 seconds), TypeScript, shared secret checks,
historical source credential audit, exact export/seed/license/identity/attribution
checks, and a fresh sanitized orphan export with offline locked installation,
initialization, knowledge check, production build and empty /api/tasks startup.
Its server was stopped and temporary checkout removed. publish-check never invokes
check:ui. Final independent browser run: 94/94 gating in 4.3 minutes; Stop passed
separately in 13.9 seconds (Phase 11 tally 1/1). No timeout or threshold changed.
Evidence: .agent/publish-check-accepted.log, .agent/ui-release-final.log and
check-ui-evidence/2026-10-14T22-34-20-204Z/. Whole-tree npm audit: zero findings.

Release tooling builds a reviewable local one-commit orphan export, preserving the
source checkout and excluding private files/history. Remote replacement requires
its explicit flag and existing public remote; neither was used. LICENSE is preserved
by its approved SHA-256. Patched dependencies retain Next 15; Vitest 4 uses sequential
Git fixtures and a test-only JSX transform. CSS token values now refuse URL-bearing
image functions; the refusal was reproduced before the fix and focused checks pass.

During release test setup, a cached store root caused two accidental local test
commits and temporary local Git identity settings. The commits were soft-restored,
all working files preserved, owner HANDOFF.md unstaged, and inherited identity restored.
No push occurred. A pre-Git sandbox-root guard now refuses this mistake and its
negative regression test passes. See Decision 115 and AGENTS.md for the evidence.

Previous continuation handoff (superseded by the direct acceptance review below): inspect the local
export, complete pending manual/provider rows in docs/CHECKLIST.md, and perform real application provider acceptance separately from the completed
live supervisor transport probe. No live model worker or background continuation is running. Supervisor startup:
run `python tools/agent_runner.py doctor`, `python tools/agent_runner.py status`, then
start `claude` and paste the prompt from docs/SUPERVISOR.md. Do not reset the budget.

Existing deferred amendments i/k/u/v remain deferred. Application provider checks
need an application API key; CLI sign-in does not settle those checks. The signed
supervisor transport probe passed with explicit transmission approval. Budget 2/6
used, four launches remain; no active workers. Real Agent SDK edits remain unverified.


## Direct acceptance review — 2026-10-15

The owner requested direct Codex work against docs/CHECKLIST.md, using existing tooling
without a Claude supervisor or additional workers. No model calls, worker launches,
budget resets, remote publication or personal-data writes occurred. Budget remains
2/6 used; the untracked owner HANDOFF.md is preserved.

Added 27 isolated Chromium acceptance cases covering Today, Calendar, Composer,
Chat, annotations, documents, Files menus, Search and key settings. Controlled
provider responses establish UI behavior only. Light/dark and narrow screenshots
were inspected; 42 retained images are under .agent/acceptance-current-screenshots/,
with a reviewed board at .agent/acceptance-visual-final.png.

The checks reproduced and corrected eight application problems: phone weather
shifted the centered date; follow-up disabled preview edits; refused Add lost its
prompt; entering document Edit clamped scroll; Files menus escaped the viewport;
streaming pulled readers away from their position; annotation drafts moved when
saved; and recovered partial messages were hidden behind a null conversation leaf.
Decisions 120–121 record the remedies. No dependency or timeout was added.

Actual crash recovery was exercised in an isolated checkout by terminating the
owned server process with a persisted, unlogged partial pair, restarting through
the development wrapper, observing Retry, restarting cleanly without a recovery
announcement, and undoing to exact message and metadata bytes. Evidence:
.agent/acceptance-crash-result.json and .agent/acceptance-crash-3-*.log.
The new saved-leaf assertion failed before the fix; all 11 sweep checks passed after.

Negative browser evidence is retained. An initial full attempt exposed incorrect
menu anchoring and was stopped; positioning each menu relative to its own row fixed
creation/rename and strengthened geometry checks. The subsequent full run passed
120/121 in 6.7 minutes; the remaining policy test clicked beneath an open overlay.
It now explicitly closes each menu before targeting another row. Stop passed apart
in 14.2 seconds. Do not describe that full run as clean. The Files/browser subset passed 26/27 in 2.0 minutes while the initial Escape-based
test correction was still running (Files uses its toggle to close). The final toggle
correction passed 1/1 in 12.3 seconds, .agent/ui-policy-toggle.log. All 27 new
acceptance cases passed in the full run; .agent/ui-acceptance-verified.log retains
the full result, and .agent/ui-acceptance-menu-final.log retains the subset. The expanded suite crosses Decision 67's five-minute threshold.
Reuse file selection with one worker and the existing shared sandbox, rather than
introducing parallel workers or changing the threshold:

- Acceptance group: `node scripts/check-ui.mjs e2e/acceptance-.*.spec.ts`
- Files follow-up: `node scripts/check-ui.mjs e2e/browser-write.spec.ts e2e/acceptance-browser.spec.ts`
- Full regression when warranted: `node scripts/check-ui.mjs`

Remaining limits: real provider extraction, knowledge behavior, attached-image
understanding, theme aesthetics and signed application SDK plan/edit behavior;
audible speech, microphone/OS clipboard integration, mintty Ctrl+C, and native
Calendar pointer/Shift dragging. Actual mouse timeline dragging passed. Calendar
HTML5 event logic and writes/Undo passed, but two native drag attempts stalled;
those manual residuals remain partial. Deferred amendments i/k/u/v stay deferred.
Use each pending checklist procedure when the needed device/provider is available.
No supervisor is needed to resume these checks.


Source fixes and acceptance checks are committed locally as 4577695. Full
deterministic verification passed 789/789 across 70 files in 87.86 seconds;
TypeScript and library boundary checks passed (native exit 0). Logs:
.agent/unit-acceptance-full.log, .agent/tsc-acceptance-final.log and
.agent/lib-acceptance-final.log. The commit hook scanned all 19 staged source files
clean. The owner handoff remains untracked and excluded from the commit.


Final fresh verification passed on snapshot 8f2e482 (source 4577695): 412 exported
files passed the static audit, historical source credentials passed, and all 414
tracked files passed the shared secret scan. Existing freshClone tooling installed
185 locked packages offline, initialized canonical seed, passed kb:check, built
production and served an empty ranked app. Native exit 0; its server and temporary
checkout were cleaned. Evidence: .agent/fresh-acceptance.log. The earlier retained
prepared export predates these acceptance fixes; prepare a new local export from
current HEAD if a release snapshot is wanted. Nothing was pushed or published.

Work is saved locally. Resume only the pending procedures in docs/CHECKLIST.md;
there is no additional implementation phase queued and no running worker/server.
The owner's HANDOFF.md is still the sole untracked file and was byte-hash verified
against its prior contents. Do not add it to a commit or export.


## Owner-directed interface refresh — 2026-10-15

The owner requested an always-visible top bar, no emoji UI, a modern minimal
light/dark visual system, a coordinated floating Add button, reliable second-click
menu closing, faster loading, GPT-6.1 Sol as default and Claude Opus 5.5 support.
The bottom-left N was explained before work: Next's development indicator, now
turned off in next.config.mjs. Decisions 122–123 record authorization and boundaries.

Implemented a fixed 48 px shell with matching body/Chat viewport geometry, cool
neutral surfaces with a violet accent, shared radii/typography/control states,
monochrome SVG rail/attachment/microphone/weather icons, and the token-based Add.
The cloud silhouette remains. The empty composer toggle is excluded from outside
dismissal using a direct element ref; a mouse-down close cannot reopen on click.
Chat rail, row and message second-click toggles were exercised. docs/DESIGN.md is
the role/palette reference; custom themes still use the existing validated tokens.
Route loading feedback is immediate and independent file reads start in parallel.
Production serving is used for the final startup to avoid dev compilation per route.

OpenAI Responses is implemented without a dependency: streamed UTF-8/SSE text,
function calls, encrypted reasoning continuation between tool rounds, strict JSON
schemas and Zod validation, PDF/image inputs, cancellation and sanitized errors.
Missing final/incomplete/refused/malformed answers cannot complete. Keys are masked
in the existing editor; the shared scanner now also recognizes project/service
account key formats. The default for chat/extraction is gpt-6.1-sol; Claude's current
option and Build SDK default are claude-opus-5-5. Old conversations and deliberately
changed settings are retained. A former untouched factory bundle upgrades on read
without rewriting personal settings. Build only accepts its compatible Claude
provider, guarded in the selector, section validation and SDK adapter.

Browser evidence: 20/20 in 1.3 minutes in .agent/ui-refresh-accepted.log, plus the
20 unaffected Composer/Calendar/sidebar cases that passed in the first selection:
40 distinct affected checks passed across selective runs. The final direct-ref
correction passed the three new UI regressions again in 22.3 seconds
(.agent/ui-refresh-toggle-ref.log). Both providers' masked Set/Change/Remove,
unrelated env preservation and name-only log/Undo refusal were exercised with
dummy keys in the sandbox. Light, dark and 360 px screenshots were inspected and
retained under .agent/ui-refresh-screenshots/. No real model inference occurred.

Negative evidence remains in .agent/ui-refresh-first.log (29/31) and
.agent/ui-refresh-final.log (17/19): old tests assumed a single key row, a new test
used a label lookup instead of its correct accessible combobox name, and a resting
palette assertion initially ran while the pointer still hovered Add. Tests now
scope the relevant key row, exercise both providers, use accessible roles and move
the pointer away. Theme snapshots use reduced motion to avoid transition frames.
The first broad unit run was 794/796; it caught the prohibited test-hook selector
and missing shared secret-pattern sample. Both were corrected without weakening
checks, then 21 focused convention/provider checks and three browser regressions
passed. The final broad run and production build are recorded below.

No workers, supervisor, model calls, new dependencies, budget resets, source pushes
or remote publication. Owner HANDOFF.md stays untracked. Real provider availability
and the earlier device/manual checklist residuals are separate from this UI work.


Final source fb82167 passed 796/796 deterministic checks across 71 files in
91.58 seconds, TypeScript, all 88 plain-Node library loads and production build
(native exit 0 for each). Logs: .agent/unit-ui-refresh-accepted.log,
.agent/tsc-ui-refresh.log, .agent/lib-ui-refresh.log, .agent/build-ui-refresh.log.
The code commit hook scanned 35 staged files clean. Earlier failed runs remain
retained; neither is described as clean.

The app is intentionally running in production mode at http://localhost:3000,
PID 77396 (also .agent/app-server.pid). Its stdout/stderr are
.agent/app-production.log and .agent/app-production-error.log. All four main routes
returned 200: Today 46 ms, Chat 75 ms, Calendar 75 ms, Settings 82 ms in this local
HTTP measurement after readiness. These are server timings, not end-to-end browser
or model latency. The effective default was read back as gpt-6.1-sol. Refresh any
previously open tab to replace development assets. To restart after code edits:
stop this owned server, run `npm.cmd run build`, then `npm.cmd run start`; use
`npm.cmd run dev` only when live development recompilation is wanted.

Next: the owner can review the refreshed interface and configure the appropriate
provider key through Settings. No real GPT/Claude inference was claimed. Existing
manual/provider acceptance remains pending. No supervisor or additional worker is
needed. Production startup here is intentional; do not report that all servers
were stopped. Private data and the untracked owner handoff were preserved.


## Neutral UI refinement and requested test items — 2026-10-15

The owner asked for neutral dark mode without blue/purple, Today-style quiet controls,
consistent adjacent sizes/gutters, a centered file icon, an hourly schedule ruler and
GPT-6.1 Sol as default. Decision 124 records the update. Both bases now use grayscale
surfaces, text and accents; semantic warning/error/success colors remain meaningful.
Standard fields/toolbars are 32 px; message input/attach/Send share a 40 px variant.
Main chat/document gutters are 24 px, and spacing uses 4/8/12/16/24 px tokens.
Schedule and Add blend into the surrounding surfaces. Calendar headers wrap on phones.
The folder outline and its SVG/button centers were measured, not guessed.

Schedule now draws hourly guides independently of packed tasks; empty gaps no longer
show one lone start timestamp. Five-minute drag, explicit time edits and Undo retain
their existing logic. The closed composer is explicitly hidden so it cannot paint
below the viewport in full-page captures. Light/dark, phone Calendar, Settings,
Chat and empty schedule screenshots were inspected and retained under
.agent/ui-neutral-screenshots/.

Browser verification spans 49 distinct affected checks across selective runs:
.agent/ui-neutral-first.log was 26/27, finding a real 38 px chat input beside 40 px
buttons. A 40 px minimum fixed it. The subsequent chat/browser/alignment group passed
24/24 in 2.0 minutes (.agent/ui-neutral-final.log); the final sheet/visual/composer
group passed 13/13 in 54.9 seconds (.agent/ui-neutral-sheet-final.log). The latter
also regenerated closed-sheet screenshots. No timing thresholds or checks weakened.
A newly created sandbox conversation was read back as gpt-6.1-sol. Existing owner
conversation choices were not rewritten. No inference or model worker was launched.

The owner explicitly requested eight personal test items. They were created once
through POST /api/tasks as one ordinary undoable batch, tagged test and scheduled
by the supplied month/day in 2026. Several written weekdays disagree with those dates;
the date/year assumption was stated before creation and original wording is retained
in the task bodies. No appointment times or assessment deadlines were invented.
Read-only verification found exactly eight requested, dated, tagged records.
The private batch receipt is .agent/requested-test-tasks-result.json; task contents
were not copied into code, seed, screenshots or tracked documentation. Other personal
data and HANDOFF.md were preserved. This authorized task batch is the exception to
prior acceptance sessions' no-personal-write scope, not a blanket data-edit permission.

Final deterministic/build results and intentional app restart are recorded below.


Final source d19c04e passed 796/796 deterministic checks across 71 files in
95.12 seconds, TypeScript, 88 plain-Node library loads and production build
(native exit 0). Evidence: .agent/unit-neutral-final.log, .agent/tsc-neutral-final.log,
.agent/lib-neutral-final.log and .agent/build-neutral-final.log. The code hook
scanned all 14 staged source/test files clean.

Production was restarted at http://localhost:3000, PID 8832, also saved in
.agent/app-server.pid. Logs are .agent/app-neutral-production.log and
.agent/app-neutral-production-error.log. All four main pages returned HTTP 200;
effective settings read back dark and gpt-6.1-sol. All eight requested test records
were verified again after restart. The app is intentionally left running for the
owner to test. No model inference, source push, publication, worker or budget reset.
Budget remains 2/6 used. Refresh the existing browser tab to load the rebuilt assets.


## Compact UI and untimed deadlines — 2026-10-15

The owner requested further neutral UI refinement, smaller shadows and a shorter
floating composer, corrected alignment, centered Calendar periods and configurable
untimed deadlines. Decision 125 records the behavior. No extension project work
was undertaken; that intervening instruction was explicitly canceled by the owner.

Shell selection is 24 px inside a 32 px group, stable on hover. Shared shadows are
small and used consistently by search results too. The empty chat list has the
conversation-title inset. The model selector moved from the conversation header
to quiet metadata beside the bottom input; the shared document composer retains
its existing behavior. The empty floating composer measures 89 px on desktop,
with no duplicate close button or permanent keyboard hint. Toggle, Escape and
outside-click closing remain. On phones, its input has a full row and Send stays
clear of the compact floating toggle.

Calendar's equal side columns center the period independently of its controls.
Adjacent-month cells and dates are muted; current-month past dates retain normal
surfaces. The current date has a thin rounded inset highlight. Existing Calendar
navigation, drag/drop, selection toolbar and Undo acceptance checks still pass.

Settings → Deadlines adds the default local cutoff for date-only due values.
00:00 ends the listed date, at the following midnight. Explicit task times take
precedence. Date-only storage and Calendar placement are preserved. Tests cover
the New York DST boundary, exact midnight and configured cutoff, explicit time
precedence, section validation and Undo. Task editing exposes an optional due
time and retains an unchanged timestamp, including seconds/offset, exactly.

The optional clarification received no answer before correction. The stated
assumption was five assessment/course-permission deadlines and three scheduled
events. Only the five previously requested test records were changed, in guarded
undoable batch b_20261015_032019_f969; original date wording is retained. Newer
record changes would have refused the correction. The private receipt lives at
.agent/requested-test-deadlines-result.json. No appointment time was invented;
other personal records and the owner's untracked HANDOFF.md were preserved.

Verification: 44/44 focused deterministic checks passed. Affected browser group
37/37 passed in 2.4 minutes (.agent/ui-polish-first.log); final chat/layout group
12/12 passed in 1.1 minutes (.agent/ui-polish-final.log), spanning 44 distinct
checks. Light/dark Calendar, desktop/phone composer, chat footer and empty-list
screenshots were inspected and retained at .agent/ui-polish-screenshots/.
File-selective runs retain Decision 67's existing justification and no thresholds
were changed. No live provider inference is claimed from scripted browser replies.

Full deterministic verification: 800/800 across 71 files in 123.31 seconds;
TypeScript and 88 plain-Node library loads passed. Logs are .agent/unit-polish-final.log,
.agent/tsc-polish-final.log and .agent/lib-polish-final.log. Production build and
restart details follow. Earlier manual/provider checklist residuals remain pending;
no supervisor, worker, remote publication, push or budget reset. Budget stays 2/6.


Source 87c4af9 passed production build (native exit 0), retained at
.agent/build-polish-final.log. The commit hook scanned all 23 source/test files
clean. Production restarted at http://localhost:3000, PID 80816, saved in
.agent/app-server.pid. Logs: .agent/app-polish-production.log and
.agent/app-polish-production-error.log. All four main pages return HTTP 200.
Readback confirms dark, gpt-6.1-sol and untimed cutoff 00:00; the eight requested
records are now exactly five due-only deadlines and three scheduled-only events.
The app is intentionally left running. Refresh the existing tab for new assets.
No implementation checks remain unfinished for this requested refinement; owner
visual review and the pre-existing manual/provider residuals are the next steps.


## Terminal chat, rolling weeks and simple Files — 2026-10-15

Decision 126 follows the owner's request to use installed terminal clients instead
of requiring API keys. Settings → Chat connection defaults to Terminal sign-in;
API remains explicit. GPT-6.1 Sol uses Codex; Claude Opus 5.5 uses Claude. Installed
Codex login reports ChatGPT authentication. No global client configuration or
credentials were edited. Build retains its existing guarded Claude SDK.

Terminal requests use fixed shell-free argument arrays and stdin in unique temporary
working directories. Codex ignores user configuration/project rules, uses read-only
sandboxing and disables shell, multi-agent, patch, hooks, plugins and web tools.
Claude uses safe/restricted mode, empty native tools and strict empty MCP config.
API keys are removed from inherited transport environment, leaving client sign-in.
Structured responses produce only offered app-tool requests; Attune validates and
executes them through its existing read/proposal/history flow. Missing completion,
malformed output/tool arguments, unknown/duplicate tools and process failures fail
visibly. Stop kills the process tree on Windows; a real local subprocess check passed.
Transport schemas and Codex image copies are store-owned temporary artifacts with
verified isolation and cleanup, not personal history records. Optional schema
omissions use the same normalization as the API provider. Terminal answers arrive
when the structured response completes. Codex PDFs explicitly require API mode;
images and Claude attachment paths retain separate live/manual acceptance limits.

Live evidence used only synthetic prompts with no repository or owner context:
.agent/terminal-chat-probe-gpt.log passed a structured answer in 2655 ms;
.agent/terminal-chat-probe-claude-final.log passed in 3165 ms with final safe-mode
flags. .agent/terminal-chat-loop-probe.log records both exact models completing
an app read_file round with a synthetic tool result, never reading an actual file.
These are product-provider calls requested by the owner, not supervisor/worker
launches. No automation budget was used or reset; it remains 2/6.

Rolling Calendar now uses four complete Sunday–Saturday weeks, the anchor week
first, with weekday headers and month-style cells. Month/Week retain the configured
first weekday. Past dates have a distinct subtle neutral surface; adjacent-month
text stays muted. First/last cell corners match the rounded enclosing grid.
Search/Sync spacing and selected-tab radius/padding stay proportional at phone
widths. The composer toggle is 40 px closed, 32 px open and aligned with the input;
model selection shares the Tasks/Ask/Build row and reaches extraction/Ask requests.
Build displays its Settings model without bypassing its existing SDK restriction.

Files defaults to useful content folders, friendly task titles and outline
chevrons. The document shows readable properties rather than raw metadata and
uses the title in its input placeholder. Title/details/controls/body share one
column; screenshot inspection caught their initial margin override and it was
fixed and pinned by a geometry check. Settings → Interface → Technical file view
restores raw metadata editing, paths and Whole repo. No underlying files were
moved, renamed or reorganized. Existing technical-write checks explicitly select
that view and retain their original filesystem/Undo assertions.

Every new task/proposal receives an editable 30-minute planning estimate when no
estimate is supplied; supplied estimates stay intact and proposal defaults are
marked inferred. Legacy null estimates show the same planning default. The owner
clarified the appointment as October 15, 2026 at 17:30. Its time had already been
set, so the guard initially refused a stale date-only assumption; readback confirmed
the owner edit and it was preserved. One guarded undoable batch then added Critical
priority and editable estimates to only the eight requested test records. Readback
confirmed the appointment first in Today's focus and all eight estimated. Private
receipt: .agent/requested-test-estimates-result.json, batch b_20261015_044643_099e.
Personal task content was not added to source, seed or tracked documentation.

Browser evidence: .agent/ui-terminal-main.log is 39/40 in 2.2 minutes, its new
connection test selecting the named section rather than the dropdown. The corrected
role selector passed subsequently. .agent/ui-terminal-files.log is 40/42 in 2.4
minutes, finding stale lowercase-folder and raw todo expectations after the new
friendly labels; neither was an app/write failure. The final complete Files group
passed 42/42 in 1.7 minutes (.agent/ui-terminal-files-final.log). Across groups,
79 distinct affected cases passed; neither earlier failed group is called clean.
No timeout, quarantine or threshold changed. Light/dark rolling, simple/technical
Files and desktop/phone composer screenshots were inspected and retained under
.agent/ui-terminal-screenshots/. Earlier manual/provider rows remain separate.

Final deterministic verification passed 810/810 in 74 files in 85.21 seconds;
TypeScript and 90 plain-Node library loads passed. Logs: .agent/unit-terminal-final.log,
.agent/tsc-terminal-final.log, .agent/lib-terminal-final.log. Production build and
restart details follow. Source pushes, publication, supervisor and extra workers
were not used; HANDOFF.md remains the owner's untouched untracked file.


Source a6cc432 passed the final production build (native exit 0), retained at
.agent/build-terminal-final.log. The source commit hook scanned all 49 files clean.
Production restarted at http://localhost:3000, PID 77396 (saved in
.agent/app-server.pid); logs are .agent/app-terminal-production.log and
.agent/app-terminal-production-error.log. All four main pages return HTTP 200.
Readback confirms terminal connection, simple Files, dark theme and gpt-6.1-sol.
All eight requested test items have estimates; the appointment retains the
confirmed date/time, Critical priority and first position in Today's focus.
The app is intentionally left running. Refresh the existing tab for the new assets.
No implementation checks remain unfinished for this refinement. Next steps are
owner visual/use review and the explicitly remaining checklist/manual/provider rows;
synthetic terminal probes do not claim those broader workflows are accepted.


## Live terminal acceptance continuation — 2026-10-15

Source `7a255e8` closes two observed defects under the owner's direct continuation:
Decision 127 (`942b624`) documents a real model proposing an invalid note directory;
Decision 128 (`7fd083c`) documents unsaved theme tokens not reaching the page.
Knowledge tool schema/prompt now require canonical note/map/profile/session paths,
returning an invalid-path tool error before a proposal appears. Store/history remain
the final write authority. Validated draft theme edits now preview immediately;
Theme base has an explicit accessible label. No dependency was added.

All live prompts and writes were synthetic, isolated by existing e2e/setup.ts in
.e2e-sandbox before store imports. Existing terminal sign-ins were reused, API keys
removed from probe-server environments, and native provider tools remained disabled.
No owner/repository context was transmitted or personal state written. Product calls
are separate from workflow launches: no supervisor/worker, budget remains 2/6 used.
All isolated servers on 3024 and probe browsers stopped; source preservation checks
passed. HANDOFF.md stays untouched and untracked. No push or publication occurred.

### Actual provider evidence

.agent/provider-http-acceptance-result.json records seven passed checks using an
isolated production server: six positively estimated drafts (15.308s), Friday
follow-up preserving titles/estimates (10.964s), one apply/Undo for all six (121ms),
Watchlist extraction/apply/Undo with no Today tasks (4.475s), read-Dune clarification
(4.765s), GPT streaming chat (3.332s) and Claude streaming chat (4.347s). Both replies
persisted complete. Server PID 14644 stopped. Prior controlled browser checks cover
card editing, in-flight merge and collection Add; this is complementary HTTP evidence.

.agent/provider-attachment-acceptance-result.json records both models reading text
visible only in a synthetic PNG (GPT 4.800s, Claude 7.520s), Claude reading a generated
PDF heading (3.291s), and explicit unsupported Codex-terminal PDF refusal (1ms).
The original four capability checks passed, but cleanup hit the correct shared file
manifest conflict after a later PDF upload/Undo. Do not call that run clean.
.agent/provider-attachment-cleanup-result.json verifies sandbox-only exact manifest
matching before force-Undo of the earlier image, removal and no remaining browser.
No owner data or API PDF inference is covered.

.agent/provider-knowledge-first.log retains the real invalid-directory proposal and
400 refusal before the repair. The final real-provider run in
.agent/provider-knowledge-acceptance-result.json used dev server with fake provider
explicitly disabled. Search-before-valid-mapped-note and repeat-without-duplicate
passed (36.157s); stable fact, transient/forget refusal and short auto-applied habit
passed (53.725s); 160-line profile proposed shorter Rewrite plus one detail note,
answered the question and preserved original bytes (66.412s).

Real distillation and real theme generation also completed, but that original five
case run has three passing cases and two failed readback assertions, not a clean run.
The summary assertion compared frontmatter Markdown with a body-only proposal;
the standalone theme probe used default data-testid instead of the app's data-ui,
reading an empty token map. Both ignored probe scripts were corrected.
.agent/provider-readback-acceptance-result.json then passed two retained-result
checks WITHOUT another model call: two session actions targeted the same path,
final body was 73 words from a seeded 24-message/12-exchange synthetic transcript,
with exact decisions/names/numbers and unresolved venue/facilitator last (14ms).
Actual saved palette editor matched all 29 tokens, both base modes previewed,
Save/reload preserved dark base and tokens (4.281s). Server PID 31780 stopped.
Summary body and both palette screenshots were inspected:
.agent/provider-synthetic-summary-final.md, .agent/provider-generated-light.png,
.agent/provider-generated-dark.png, .agent/provider-generated-tokens.json.
This covers synthetic decision quality and one neutral moonlit palette, not every
owner conversation or every possible generated aesthetic.

### Verification and retained failures

Final deterministic run: 811/811 across 74 files in 63.03s, no skips;
90 plain-Node library modules, TypeScript and production build all passed.
Logs: .agent/unit-live-final.log, .agent/lib-live-final.log,
.agent/tsc-live-final.log, .agent/build-live-final.log. Source hook: five files clean.
Affected settings/terminal/polish browser group passed 15/15 in 42.3s at
.agent/ui-provider-repair-final.log. Before the repair, computed unsaved background
failed (.agent/theme-preview-negative.log). The first repaired group was 14/15:
new Base label selection was wrong; explicit accessible label/role corrected it
(.agent/ui-provider-repair.log). No timeout, threshold or quarantine changed.

### Running app and remaining work

The earlier recorded PID 77396 was already gone. Temporary owned app PID 20348 was
stopped before UI checks. Final production app is running at http://localhost:3000,
PID 29440, saved in .agent/app-server.pid; logs:
.agent/app-live-acceptance-production.log and
.agent/app-live-acceptance-production-error.log. Verified command is Next start,
hostname 127.0.0.1, port 3000. Readback retains dark, gpt-6.1-sol, terminal and
simple Files (technicalFiles false).

A status-only urllib health probe that closed the streamed HTML early reproduced
Next's controller[kState].transformAlgorithm warning. Full response reads of /,
/chat, /calendar and /settings all returned 200, with zero new warning bytes.
Actual real-provider chat streams also completed. No framework-warning source fix
is claimed, and the early-close warning is not evidence of a chat-provider defect.
Future page health checks should consume the whole response body.

No implementation checks remain unfinished for this continuation. Next steps are
owner review/use of the running app and explicit residual checklist items: native
OS drag/Shift, physical audio/microphone, Git Bash mintty Ctrl+C, live Build SDK,
and API-provider-specific inference (including API PDF). No additional acceptance
work or supervisor launch is needed to close this continuation.


## Existing-task edits from Ask — 2026-10-15

Owner reported that Ask could discuss the security appointment but could not change
Critical to Normal. This was a missing application tool, not a terminal permission
problem. Decision 129 adds propose_task_update with exact task ID, requested fields
only, typed validation, a before/after card and explicit Apply. Source ec0dbc9.
Apply uses ordinary task.update/runBatch and Undo; stale reviewed fields refuse
inside the serialized action. Unrelated later edits survive. Task context now
includes ID. Shared priority labels remain 1 Critical, 2 High, 3 Normal, 4 Someday.
No native shell/file permissions were granted to either model.

New isolated tests prove proposal writes nothing, only requested fields change,
appointment time/estimate/notes survive, Undo restores the task, stale fields refuse,
unrelated edits survive, and missing targets/invalid/protected/duplicate fields refuse.
Initial deterministic run: 815/815 in 75 files, 75.83s; TypeScript and 91 plain-Node
library modules passed. After tracking the new test, convention check found its
missing serial checkout-runner registration (5/6 passed). Registration corrected;
final deterministic/build results follow. No threshold or quarantine changed.

Affected knowledge/terminal/edit browser group: 12/12 in 53.2s, retained at
.agent/task-edits-ui.log. Final edit-only screenshot/check: 1/1 in 14.7s at
.agent/task-edits-ui-final.log. Compact Critical -> Normal Apply/Discard card
screenshot .agent/task-edit-proposal.png inspected. Browser checks Apply, unchanged
schedule, Undo, stale refusal/error retention and Discard. A transient Next dev
static-path JSON warning appeared during the passing 12-case run; no failed check.

Actual terminal GPT-6.1 Sol proposed the edit, ordinary Apply changed only priority,
and Undo restored original synthetic task (10.020s). Initial Claude case correctly
asked for clarification because fixture title did not match the requested security
prescreen; this mixed run is retained, not called clean, in
.agent/task-edits-provider-result-first.json. Corrected matching synthetic title
passed Claude Opus 5.5 in 7.301s (.agent/task-edits-provider-result.json).
Both isolated production servers stopped and source HEAD preservation passed.
Early local harness-construction marker errors launched no provider; PowerShell
stderr reporting on the successful Claude probe is not its acceptance result.
All prompts/tasks were synthetic; owner's appointment was not changed by these
checks. No private writes, supervisor/extra worker, push or publication; budget 2/6.

Automatic approval review briefly blocked a final terminal step due to its usage
limit, explicitly not an unsafe-action determination. Owner continued; review then
allowed ordinary close operations. No bypass was used. The first owner-app restart
failed because the last browser check had replaced .next production output; rebuild
and verified restart follow. All existing changes and HANDOFF.md are preserved.


Final deterministic rerun after serial registration: 815/815 in 75 files,
67.21 seconds, native exit 0 (.agent/task-edits-unit-final.log). The corrected
registration is ca4bcc3; the preceding convention failure remains recorded above.

Final production rebuild passed with native exit 0 at
.agent/task-edits-build-final.log. Production is intentionally running at
http://localhost:3000, PID 46168 (saved .agent/app-server.pid), logs
.agent/app-task-edits-production.log and .agent/app-task-edits-production-error.log.
All four main pages returned 200 with full response bodies consumed. Refresh the
app, then repeat the priority request and press Apply on the review card. Existing
owner task priority/time remain unchanged by this implementation continuation.
No unfinished implementation checks remain for this fix; earlier manual/provider
residuals are unchanged.


## Quick approval, keyboard and Today deadline refinement — 2026-10-15

Owner requested Approve for me beside model selection, slash/Enter prompt opening,
Tab/Shift+Tab mode/page cycling, a theme-aware indicator, Ask/edit-card spacing,
file glyph redesign, predictable Open in Chat and deadline-first Today ordering.
The follow-up specifically requests equal selected navigation insets. Decision 130
records the contract (4bd8fe8). Existing private files and instructions are retained.

Implementation uses an off-by-default per-device switch shared by Chat and the
bottom composer. Completed successful proposals use the existing guarded apply
route/history/Undo, serialized one at a time. Refusals remain visible without auto
retry. Client streams hold proposals until success; failed, aborted and truncated
turns cannot trigger automatic writes. Tasks extraction auto-adds once per result;
clarification still waits for an answer. Build uses its existing Auto workflow from
the same toggle; duplicate Plan/Auto buttons were removed. No native tools enabled.

Slash/Enter outside interactive controls opens the prompt; Chat has a shortcut host
without its closed floating button. Tab/Shift+Tab from the bottom input cycles modes;
with it closed, those keys outside controls cycle Today/Chat/Calendar. Ordinary
control/dialog keyboard behavior remains available. A user request during a route
mount gap is delivered once to the arriving composer host. No automatic opening.
Ask has a quiet answer column and stable prefetched Chat link with scroll disabled
and pending feedback. Edit cards have explicit padding and action separation. The
Files glyph is a page outline. Favicon colors follow actual current CSS tokens,
including palette previews. Selected navigation has equal 3px outer insets, a 28px
minimum height and matched text padding across desktop/phone sizes.

Untimed deadlines now effectively end at 23:59. Settings/seed defaults are 23:59;
legacy factory 00:00 is resolved in memory without rewriting private files. Date-only
storage and explicit timestamps are retained; custom non-midnight cutoffs still
work. All due-today items remain visible ahead of future work, ordered by effective
deadline rather than priority, including beyond focus size. Countdown chips use
local time and refresh on mount, each minute and window focus. Semantic rank/format
regressions cover ordering, preserved explicit midnight, custom cutoff and DST.

First affected browser group: 11/13 passed, retained in
.agent/quick-actions-ui-first.log. Failures were a new Chat shortcut's route readiness
and the old 24px selected-tab expectation; route gap handling/readiness and current
28px geometry corrected. A second group passed 17/18 (.agent/quick-actions-ui-final.log),
its automatic Apply response observer timing out while source changes overlapped the run, even
though the server applied and the final card disappeared. Do not call it clean.
The unchanged stable-source group passed 18/18 in 1.1 minutes, native exit 0:
.agent/quick-actions-ui-stable.log. All seven new quick-action cases passed, including
automatic Apply/Undo/off persistence, failed-turn suppression, no automatic retry,
controlled Tasks extraction, keyboard forward/reverse, both theme icon changes,
selected insets and controlled-clock live countdown ordering. Four Build cases pass,
including manual gates, new auto switch/Undo and denied personal writes.
Screenshots copied to .agent/quick-actions-screenshots/ and inspected: Ask desktop
and phone, dark selected tabs and Today countdowns. No horizontal phone overflow.

Additional existing chat/knowledge regressions and final deterministic/type/library/
production verification follow. No provider inference was needed or called in this
refinement; all browser writes used the existing isolated .e2e-sandbox. No owner
task timestamp/priority edits, supervisor, extra worker, push, publication or budget
reset. Workflow budget remains 2/6. HANDOFF.md is untouched and untracked.


Additional shared chat/knowledge group: 16/17 gating passed in 1.6 minutes;
Stop passed separately 1/1 in 14.6 seconds (.agent/quick-actions-streaming-ui.log).
The rejected-key case encountered Next dev's SyntaxError: Unexpected end of JSON
input while opening /chat, which returned 500 before its send. Other cases passed;
no competing app server was present. That run is not clean. The rejected-key case
then passed alone with strengthened selected-tab geometry in a 2/2 group (18.6s),
.agent/quick-actions-ui-targeted.log. Each Today/Chat/Calendar geometry assertion now
waits for that route's actual aria-current state. Stable affected group remains
18/18; all 35 distinct affected gating cases passed across these selective groups.
Stop is separate. No threshold, retry setting or quarantine was changed. Earlier
manual/provider checklist residuals remain separate from these scripted checks.


The first final deterministic run passed 817/818 in 75 files (68.85s). Its one
failure was the standing data-hook convention: new navigation queried a composer
test hook and favicon code queried/assigned a data marker. No allowance was widened.
Navigation now uses actual dialog semantics and the favicon has an actual element
ID. The convention passes 4/4; the two affected keyboard/icon cases pass 2/2 in
15.2 seconds (.agent/quick-actions-ui-conventions.log). Initial 817/818 log remains
.agent/quick-actions-unit-final.log. Assistant instructions/tool results now explain
that the app may apply proposals automatically under this opt-in; the tool itself
still cannot claim an edit was saved. Final verification results follow.


Source c5bb22d passed the final deterministic rerun: 818/818 in 75 files,
74.76 seconds (.agent/quick-actions-unit-clean.log). TypeScript and 92 plain-Node
library loads passed (.agent/quick-actions-types-clean.log,
.agent/quick-actions-lib-clean.log). Final assistant word/schema/context/loop/edit
group also passed (.agent/quick-actions-agent-final.log), after its wording update.
Production build native exit 0 is .agent/quick-actions-build-clean.log; source
commit hook scanned all 34 files clean. Existing failed logs are retained above.

Production runs at http://localhost:3000, PID 46212 (saved .agent/app-server.pid),
logs .agent/app-quick-actions-production.log and
.agent/app-quick-actions-production-error.log. All four main pages returned HTTP
200 with complete response bodies consumed. Settings readback confirms effective
untimed cutoff 23:59, without changing the owner's private settings/task bytes.
Refresh for the new assets. Approve for me starts off until the owner enables it.
No unfinished implementation checks remain for this refinement. Owner visual/use
review and previously explicit physical/audio/live Build SDK/API residuals remain;
scripted Build approval checks do not claim real SDK inference. No publication,
source push, extra worker, supervisor or budget reset. HANDOFF.md remains untouched.


## Quick approval acceptance follow-up — 2026-10-15

Owner continued after the implementation close. Reviewed the saved status and
exercised additional interactions affected by shared proposal/style changes using
existing isolated Playwright tooling. No new provider, supervisor or worker.
Added two behavioral checks: bottom Ask automatic priority Apply exactly once with
preserved appointment time and ordinary Undo; and disabling approval during one
held automatic Apply leaves the next queued proposal for manual review.

First expanded group: 30/33 in 3.6 minutes (.agent/quick-actions-followup-ui.log).
Existing resize/editor keyboard, annotation draft, reading above a stream, bounded
proposal tray in both themes, rich Markdown, composer selection/follow-up/attachments,
Ask reuse, settings theme generation/preview/history/geolocation controls passed.
Physical geolocation/audio/provider inference is not inferred from controlled checks.
Failures retained: (1) the 200-message editor check observed a 7239px reading-position
jump; (2) auto-extracted undated task was correctly under collapsed Also possible,
not visible in the populated focus list; (3) queued test wrongly assumed knowledge
arrived before collection. Knowledge proposals deliberately wait for finalization,
so actual first write was collection and the remaining note correctly stayed pending.
No application repair is claimed for either fixture assumption.

The Tasks test now deliberately seeds six critical focus items, opens Also possible
and checks the new task there. The queue test identifies the first applied proposal
from its request and checks that the other remains reviewable. Initial targeted run
was 3/4 in 33.8s (.agent/quick-actions-followup-targeted.log): the unchanged 200-message
editor check passed, Tasks creation and bottom Ask passed; the queue fixture had
loaded a misplaced local variable before its source correction, causing ReferenceError.
The scope is corrected and TypeScript passes. This partial run is not called clean.
Final stable targeted results and rebuild/restart follow. No app-source change was
needed for the observed nonreproducing editor jump; its original failure stays explicit.

All writes are synthetic in .e2e-sandbox, no owner/private content changed. HANDOFF.md
is untouched/untracked. Existing 818 deterministic checks and 92 library loads remain
accepted for unchanged application source c5bb22d. No broad rerun of those checks is
claimed for this test-only continuation; TypeScript and production rebuild are checked.
No push, publication, supervisor, extra worker or budget reset; budget remains 2/6.


Final stable targeted group passed 4/4 in 39.0 seconds, native exit 0
(.agent/quick-actions-followup-targeted-final.log): unchanged 200-message editor,
populated-focus Tasks auto-add, bottom Ask Apply/Undo and approval opt-out queue.
The original editor failure did not repeat in either targeted run; no speculative
source repair or weakened threshold. Its initial failure remains above. All 33
distinct checks in the expanded affected group passed across these selective runs;
the initial 30/33 and intermediate 3/4 groups are not clean runs. Final long-middle
screenshot inspected and retained under .agent/quick-actions-followup-screenshots/.
TypeScript passed, test additions committed as ab1737b (hook: one file clean).
No application source behavior changed beyond c5bb22d. Production rebuild/restart
results follow; no full deterministic rerun was necessary for these browser tests.


Production rebuild passed with native exit 0
(.agent/quick-actions-followup-build.log). App intentionally runs at
http://localhost:3000, PID 44696 (saved .agent/app-server.pid), logs
.agent/app-quick-actions-followup-production.log and
.agent/app-quick-actions-followup-production-error.log. Four complete main-page
responses returned 200. No unfinished implementation work remains for this acceptance
continuation. Owner visual/use review and existing physical/manual/provider checks
remain; no owner-data changes, workers, publication or budget reset.


## Compact controls and collapsible Done — 2026-10-16

Owner requested Done collapse, a stationary bottom-right composer toggle, quieter
AutoApprove name, standard file glyph, icon Send controls and centered logo, plus
checking an apparently completed appointment. Read PROJECT first. Decision 131
(a2f0481) specifies this refinement. Read-only HTTP inspection confirmed the reported
appointment is already done and appears only in the completion day's Done section.
No personal-data change was necessary or made; private timestamps stay out of source.

Done now uses the Also possible disclosure pattern, initialized from showCompleted.
Its count remains present when hidden. The composer toggle keeps identical 40px
size/24px screen offsets, rotates its glyph only, and input space is reserved at
narrow widths. AutoApprove preserves existing opt-in storage, is muted while off
and fully legible while focused/hovered/enabled. Main send and message-resend controls
share a centered arrow SVG with Send/Sending or Resend accessible names. A standard
folded-page Files glyph and mathematically centered moon logo use existing SVG
infrastructure; no dependency or raster assets. Browser evidence and final checks
follow. HANDOFF.md remains untouched; no provider, supervisor, worker, publication,
source push or budget reset; budget stays 2/6.


Affected browser group was 28/29 in 1.9 minutes
(.agent/compact-controls-ui-first.log). All three new cases passed: Done mouse/
keyboard collapse and hidden initial preference, completed tasks absent from open
sections, fixed toggle dimensions/position at 1280/780/400px, icon Send hit targets,
muted/enabled AutoApprove, file bounds and centered moon. Existing Tasks/Ask/Build,
Undo/failed-turn/queue opt-out and deadline behavior passed. The one failure was an
old unscoped Attach a file selector matching both visible Chat and its hidden bottom
composer. Scoping to the Chat composer preserves the intended geometry assertion;
final affected visual group passed 5/5 in 35.5s (.agent/compact-controls-ui-final.log).
No timeout, threshold, retry or quarantine changed; initial group is not called clean.
All 29 distinct affected cases passed across selective groups. Screenshot files are
retained in .agent/compact-controls-screenshots/. Desktop/tablet/phone composer
captures were inspected; a Chat icon screenshot is recaptured at desktop width
because the existing expanded browser panel occupies most of a phone viewport.
No unrequested sidebar behavior change is claimed. Final icon screenshot/check,
TypeScript, boundaries, deterministic suite and production results follow.
The initial new browser-test implicit-any TypeScript error was corrected with its
actual ID shape before any browser run; no application typing guard was weakened.


Source d2e2854 passed final 818/818 deterministic tests in 75 files (99.85s),
TypeScript, 92 plain-Node library loads and production build (all native exit 0).
Logs: .agent/compact-controls-unit-final.log, .agent/compact-controls-types-final.log,
.agent/compact-controls-lib-final.log, .agent/compact-controls-build-final.log.
Final icon screenshot check passed 1/1 in 20.4s
(.agent/compact-controls-ui-icons-final.log), desktop Chat screenshot inspected and
copied to .agent/compact-controls-screenshots/. Source hook scanned 16 files clean.

Production intentionally runs at http://localhost:3000, PID 46548 (saved in
.agent/app-server.pid), logs .agent/app-compact-controls-production.log and
.agent/app-compact-controls-production-error.log. All four main-page complete bodies
returned HTTP 200. Readback again confirms the reported appointment is done and
only in Done, without changing its private record. Refresh for new assets. No
unfinished implementation checks for this refinement; existing physical/manual/
provider residuals remain unchanged. No owner-data writes or external publication.


## Crescent moon and between-task separators — 2026-10-16

Owner requested a recognizable crescent instead of an eclipse-like mark and a line
between tasks instead of rounded under-borders. Decision 132 (98fd48d), source
5dfbff1. The moon is a narrower arc silhouette with centered visible bounds and
existing theme-derived colors. Rows have no bottom border; an inset straight 1px
pseudo-element exists only before a row that follows another row. Rounded hover
surfaces and existing task operations are preserved. No private task/state writes.

Focused existing compact-control group plus new silhouette/separator acceptance
passed 4/4 in 31.3s, native exit 0 (.agent/crescent-separators-ui.log). Assertions
cover no first/last under-border, straight adjacent separator, narrow crescent,
centering and theme changes. Light/dark screenshots inspected and retained under
.agent/crescent-separators-screenshots/. TypeScript passed. Source hook: three files
clean. Prior 818-test evidence belongs to the preceding source; no full deterministic
rerun is claimed or required for this SVG/CSS-only correction. Production rebuild
and restart follow. HANDOFF.md preserved. No model call, worker, supervisor, push,
publication or budget reset; budget stays 2/6. Existing residual checks unchanged.

Production build native exit 0 (.agent/crescent-separators-build.log). App runs at
http://localhost:3000 PID 35848, saved .agent/app-server.pid; logs
.agent/app-crescent-separators-production.log and
.agent/app-crescent-separators-production-error.log. Full home response returned
200. Refresh to see the updated favicon and list separators. No implementation
checks remain unfinished for this correction; earlier manual/provider residuals
remain unchanged.


## Collapsed Done and Today emphasis ? 2026-10-19

Owner requested Done to start hidden and later work to be lower opacity until
all tasks due on the day are complete. Decision 133 (2aaf8d6), source 97a534a.
Done initially collapses regardless of the old visibility preference; its count
and mouse/keyboard expansion remain. Later/undated open tasks dim to 55%, with
full opacity on hover/focus; they return to normal after the last viewed-date
deadline completes. Earlier overdue work remains fully emphasized. Also possible
now shares conditional emphasis instead of permanent muting. Removed the obsolete
Show completed Settings control; stored settings and task bytes remain untouched.

Final affected browser group: 5/5 in 38.2s, native exit 0. Evidence:
check-ui-evidence/2026-10-20T03-43-48-661Z. Initial group was 4/5 (1.3m), retained
at check-ui-evidence/2026-10-20T03-42-14-120Z: the new test used checkbox.check()
against the deliberately non-optimistic async completion control. Corrected to
click and wait for the row to disappear, and isolated its viewed date from the
preceding separator fixture before verifying full-opacity restoration. No app
behavior workaround or weakened timeout/retry/threshold. Before/after screenshots
inspected and retained under .agent/today-emphasis-screenshots/.

TypeScript passed; 92 library modules load in plain Node. Focused rank and
component test-hook checks: 33/33 in two files (1.28s). Prior 818-test results
belong to earlier source; no full deterministic run is claimed. Production build
log: .agent/today-emphasis-build.log. Startup result follows. No owner-data write,
inference, worker, supervisor, publication, push or budget reset; budget 2/6.
Earlier manual/provider residuals remain unchanged. HANDOFF.md preserved.


Production build passed (native exit 0). App intentionally runs at
http://localhost:3000, PID 101956 (.agent/app-server.pid), logs
.agent/app-today-emphasis-production.log and
.agent/app-today-emphasis-production-error.log. Complete home response HTTP 200.
Refresh to load the new UI. No unfinished checks specific to this change;
existing manual/provider residuals remain as recorded.


## Wants, flexible weeks and spacious Schedule — 2026-10-20

Owner asked for a standard file icon, a quieter place for optional wants, flexible
weekly plans that carry unfinished work forward, and a cleaner Schedule. Decision
134 (9a1a8b9), source 911f415. The file glyph is a centered folded page with two
text strokes. Wants is a separate collapsed section with three rows on expansion
and Show all for the rest; wants do not consume Focus slots or auto-fill Schedule.
Hard deadlines and explicit day schedules take precedence.

Task Edit offers Kind: Work/Want and Flexible plan: Whenever/This week/Next week.
It reuses tags (`want`, `plan-week:YYYY-MM-DD`) and ordinary history/Undo, retaining
unrelated tags and untouched explicit timestamps. Sunday target weeks align with
the calendar. The effective week advances on read while unfinished, without a
hard deadline, duplicate task, timer, background write, schema migration or new
dependency. Existing tasks have not been reclassified or edited. Assistant
instructions and task context expose the same representation; live model
interpretation of these new instructions was not exercised or claimed.

Schedule has 96px/hour in a bounded scroll pane, quiet cards and one selected-item
start-time editor above the grid. The picker reaches tiny/overlapping commitments;
keyboard selection, pointer drag and ordinary exact-byte Undo remain. Phone controls
wrap instead of compressing titles. Visual review found that selected overlapping
cards could sit behind a sibling; final CSS brings selected and moving cards forward,
and a real center-point hit assertion now pins the result. Tiny block labels are
hidden where their true duration cannot fit text; their names/time remain in the
accessible picker. No time geometry is falsified with overlapping minimum heights.

Verification:
- Focused ranking/plan/timeline/component checks: 58/58 in four files (0.954s).
- Full deterministic suite: 823/823 in 76 files (74.31s), native exit 0;
  .agent/wants-schedule-unit.log. This precedes the final CSS stacking correction
  and comment-only cleanup; no repeated full run is claimed for those changes.
- Initial affected browser group: 12/14 (3.0m), retained at
  check-ui-evidence/2026-10-20T20-34-03-989Z. New dropdown label lookups stalled;
  explicit accessible names fixed both controls, and task Save was scoped to its
  form instead of the separate onboarding Save. No timeout, retry or threshold
  changed. Focused rerun 2/2 (18.5s), evidence 2026-10-20T20-37-12-890Z.
- Final affected group: 14/14 (58.9s), native exit 0, including real drag/time edit,
  Undo, calendar operations, conditional opacity, collapse, icon geometry and both
  new cases. Log .agent/wants-schedule-ui-final.log; evidence
  check-ui-evidence/2026-10-20T20-39-03-505Z.
- After the visual stacking correction: focused 2/2 (18.1s), native exit 0, with
  keyboard selection and actual hit target on desktop and phone. Evidence
  check-ui-evidence/2026-10-20T20-40-42-543Z. Final screenshots inspected and kept
  under .agent/wants-schedule-screenshots/. Onboarding was dismissed through its
  normal control in screenshot fixtures so the changed UI is visible.
- Final TypeScript passed (.agent/wants-schedule-types.log); 93 library modules
  load in plain Node. Source hook scanned 17 files clean. Production rebuild log:
  .agent/wants-schedule-build.log; startup result follows.

No owner-data writes, inference, worker, supervisor, push, publication or budget
reset. Budget remains 2/6; prior physical/manual/provider residuals unchanged.
HANDOFF.md remains untracked and preserved. Existing production process 101956
was verified by command line and stopped before the isolated browser runs.


Production build passed (native exit 0). App intentionally runs at
http://localhost:3000, PID 123272 (.agent/app-server.pid), logs
.agent/app-wants-schedule-production.log and
.agent/app-wants-schedule-production-error.log. Home, Chat, Calendar and Settings
returned complete HTTP 200 responses. Refresh to load the new assets. No unfinished
implementation checks for this refinement; provider/manual limits above remain.
