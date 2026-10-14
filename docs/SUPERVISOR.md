# Supervisor startup

Open this repository in VS Code and use its integrated PowerShell terminal:

```powershell
Set-Location C:\Users\yzhao\Documents\GitHub\Attune
python tools/agent_runner.py doctor
python tools/agent_runner.py status
claude
```

Paste this into that **one Claude Code conversation**:

```text
Continue Attune through PROJECT.md §17. Read CLAUDE.md, AGENTS.md,
AUTOMATION_WORKFLOW.md, HANDOFF.md and docs/progress.md. Preserve existing work.
The owner authorized implementing the remaining project in phase order, with
local review and verification between stages. Do not push or publish.

You are the supervisor. Run doctor and status; reconcile any unfinished run.
Select one useful task and write its strict contract under .agent/tasks/.
Dispatch one foreground worker with python tools/agent_runner.py run --task PATH.
Read its report, inspect actual changed files/diff, and review independent checks.
Record the decision with the runner before choosing a dependent next task.
Continue in this conversation within the remaining budget. Stop on exhausted
budget, authentication/quota failures, repeated no progress, uncertain process
ownership, or an external prerequisite. Do not reset budgets, recursively delegate,
weaken acceptance criteria, or ask me to relay reports. Save exact blockers and
the next task in docs/progress.md. Keep source and documentation commits separate
under the existing repo rules. Never change personal data or mark unrun checks passed.
```

No Python packages or virtual environment are needed. Python 3.14 and Node 24 are
installed locally. The runner resolves the installed npm Codex shim to `node.exe`
plus its installed JS entrypoint, without a command shell. Model and effort use
the user's saved Codex defaults; edit the trusted `worker_argv` only if explicitly
choosing other supported flags. Workers cannot change this policy.

Saved sign-in is checked with `codex.cmd login status` and `claude auth status`.
Use the official clients' interactive login if needed; never copy auth files.
The runner strips API-key environment variables from child environments. It uses
the CLI's `workspace-write` sandbox. It does not disable sandboxing on failure.

## Task example

Create `.agent/tasks/T001.json` using `agent-task.schema.json`:

```json
{
  "task_id": "T001",
  "attempt": 1,
  "objective": "Repair the current milestone's specified behavior.",
  "context": "Cite the relevant decision and observed defect.",
  "scope_paths": ["lib/feature/"],
  "acceptance_criteria": ["The reproduction succeeds without regressing existing behavior."],
  "check_ids": ["typecheck", "tests"],
  "constraints": ["Preserve baseline edits; no commits or personal-data writes."],
  "previous_report_id": null
}
```

Use actual paths and check IDs from `agent-config.json`. A directory scope ends
in `/`. Instructions, orchestration, credentials, runtime state and personal data
are protected. Dirty baseline files may be read but must not be changed by workers.
The supervisor handles authorized documentation and commits between worker runs.
For a dependent new task, set `previous_report_id` to its accepted predecessor.
For a correction, keep the task ID, increment `attempt`, cite its latest report,
and preserve the original acceptance criteria.

```powershell
python tools/agent_runner.py run --task .agent/tasks/T001.json
python tools/agent_runner.py report --run ACTUAL_RUN_ID
python tools/agent_runner.py review --run ACTUAL_RUN_ID --decision accepted --note "Read diff and passing independent checks; criteria met"
```

Reports remain in `.agent/runs/`; reviews are stored separately in SQLite. All
runtime files are ignored. Treat raw local logs as private; prompts must never
include credentials. Scope checks provide accountability for trusted workers,
not isolation from hostile code. The Codex sandbox supplies the execution boundary.

## Stops and recovery

```powershell
# From a second terminal, request cancellation through the live owner:
python tools/agent_runner.py cancel --run ACTUAL_RUN_ID
# After a crashed runner, verify its owner is dead and retain partial edits:
python tools/agent_runner.py recover --run ACTUAL_RUN_ID --note "Inspected interruption and partial edits"
python tools/agent_runner.py review --run ACTUAL_RUN_ID --decision needs_followup --note "Concrete correction needed"
# Only after an explicit new user budget authorization:
python tools/agent_runner.py reset-budget --reason "Exact user authorization"
```

Windows workers and checks enter a kill-on-close Job before executing. Completion,
cancellation, timeout and abrupt owner death close the Job and kill descendants.
Recovery checks PID **and birth identity**; it never kills an arbitrary PID or process
name. Partial edits are retained. A run awaiting review blocks dispatch; failed
checks and scope violations cannot be accepted. Two attempts without progress halt
dispatch for diagnosis, even after a budget reset.

Foreground execution delivers the report directly to the supervisor tool call.
Background delivery and unattended resumption after closing Claude are unverified
and are not enabled. The signed-in loop's local evidence is in `docs/progress.md`.
