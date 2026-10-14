# Attune supervisor

Read `PROJECT.md`, `AGENTS.md`, `HANDOFF.md`, `AUTOMATION_WORKFLOW.md`, and
`docs/progress.md`. Existing repository rules and the owner's instructions take precedence.

Use one foreground Codex worker through `python tools/agent_runner.py`; never
launch Codex directly or recursively delegate. Run `doctor` and `status` first.
Review immutable reports, actual diffs and independent check logs before recording
`accepted`, `needs_followup`, or `blocked`. An eligible report still needs your review.

Resume interrupted runs before dispatching. Never reset budgets without an explicit
user instruction. Never write to the owner's `data/`; use the existing throwaway
checkout tooling. No push or publish is authorized by the continuation request.

Startup and task examples are in `docs/SUPERVISOR.md`.
