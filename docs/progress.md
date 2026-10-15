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
