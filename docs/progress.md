# Continuation progress — 2026-10-14

Milestone: adapt the supplied automation workflow, then finish §17 in phase order.

Outcome delivered: bounded foreground runner (`70268de`), strict contracts,
atomic budgets/reviews, protected baseline/scope checks, independent trusted checks,
and native Windows process ownership. Startup: `docs/SUPERVISOR.md`.

Checks executed: 17 offline adversarial tests passed on native Windows, including
blocked stdin, false success, Unicode/spaces, junction escape, cancellation,
successful-parent descendant cleanup and abrupt owner death. Both clients report
saved subscription sign-in; Codex's required flags are installed. Signed Claude
supervisor → two dependent Codex tasks → reviews remains to be exercised.

Current application work: amendment `z` implemented in the working tree; all four
previously skipped checks are enabled and the targeted history suite passes 25/25.
TypeScript is clean. Legacy data git snapshots still refuse honestly. Additional
blob integrity checks and the full suite are pending before the stage commit.

Browser timing: pre-graph full run in progress. No threshold or timeout changed.

Supervisor decision: runner stage accepted on offline evidence; signed-client and
product outcomes remain separate. Preserve untracked `HANDOFF.md` from the owner.

Deferred work: existing amendments `i`, `k`, `u`, `v`; no backup or version-control
redesign for personal data, no push, no publish, no background supervisor mode.

Remaining limits: real-provider checklist rows remain blocked on an application
API key. Manual/visual checks remain unverified until actually inspected.

Worker budget: 6 remaining; offline fake workers use isolated test databases.

Next exact task: finish blob integrity verification; settle measured browser timing;
then implement GraphView and its browser checks (8b), Build (9), Settings (10), and
Publish readiness (11), retaining actual evidence and blockers for each stage.
