"""Owns the foreground Codex dispatch → independent checks → supervisor review loop.

Failure behavior: retain partial edits and bounded evidence; failed or interrupted
runs block new dispatch until explicitly reconciled. No automatic retries/resets.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

from agent_contract import baseline, changes, load_json, safe_path, validate, validate_task
from agent_process import Allowance, executable, identity, run_process
from agent_state import State

ROOT = Path(__file__).resolve().parent.parent


def save(path, value):
    # Exclusive creation makes completion evidence immutable to this runner.
    with path.open("x", encoding="utf-8", newline="\n") as file:
        json.dump(value, file, indent=2, ensure_ascii=False)
        file.write("\n")


def clean_env():
    # Saved official-client sign-in only; never inherit a paid API fallback.
    return {k: v for k, v in os.environ.items() if k.upper() not in
            {"OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ATTUNE_REPO_DIR", "ATTUNE_FAKE_PROVIDER"}}


def successful(outcome):
    return outcome["exit_code"] == 0 and outcome["reason"] is None and not outcome["errors"]


def config_for(root):
    config = load_json(root / "agent-config.json")
    for key in ("launch_budget", "max_attempts", "worker_seconds", "check_seconds", "log_bytes", "result_bytes"):
        if type(config.get(key)) is not int or config[key] <= 0:
            raise ValueError(f"invalid policy value: {key}")
    for argv in [config["worker_argv"], *config["checks"].values()]:
        if not isinstance(argv, list) or not argv or any(not isinstance(a, str) for a in argv):
            raise ValueError("trusted commands must be nonempty argv lists")
    return config


def dispatch(root, state, config, task_path):
    task = load_json(task_path)
    validate_task(root, task, config)
    before = baseline(root)
    result_schema = load_json(root / "agent-worker-result.schema.json")
    run_id = state.claim(task, config)
    folder = root / ".agent/runs" / run_id
    folder.mkdir(parents=True)
    save(folder / "task.json", task)
    save(folder / "baseline.json", before)
    save(folder / "result-schema.json", result_schema)
    save(folder / "policy.json", config)
    result_path = folder / "worker-result.json"
    prompt = ("Implement only the following task in this repository. Read PROJECT.md and relevant "
        "AGENTS.md instructions. Preserve all baseline edits. Do not commit, stage, push, spawn "
        "workers, edit runner policy/runtime, or touch personal data. A supervisor reviews this "
        "task after independent checks; return the exact required JSON result. "
        "Report blockers honestly. Do not emit credentials.\n" + json.dumps(task, ensure_ascii=False))
    (folder / "prompt.txt").write_text(prompt, encoding="utf-8")
    print(json.dumps({"run_id": run_id, "state": "running"}), flush=True)
    allowance = Allowance(config["log_bytes"])
    errors, checks, outcome, result = [], {}, None, None
    cancelled = lambda: bool(state.get(run_id)["cancel"])
    try:
        argv = [a.replace("{schema}", str(folder / "result-schema.json"))
                .replace("{result}", str(result_path)) for a in config["worker_argv"]]
        outcome = run_process(argv, root, config["worker_seconds"], allowance,
            folder / "worker.log", prompt.encode("utf-8"), cancelled,
            result_path, config["result_bytes"], clean_env())
        result = load_json(result_path, config["result_bytes"])
        validate(result, result_schema)
        if result["task_id"] != task["task_id"]:
            raise ValueError("worker returned a different task ID")
        for rel in result["changed_files"]:
            safe_path(root, rel)
        for check_id in result["checks_claimed"]:
            if check_id not in task["check_ids"]:
                raise ValueError("worker claimed an unassigned check")
        after_worker = baseline(root)
        _, violations = changes(before, after_worker, task["scope_paths"])
        if violations:
            errors.append("scope/baseline violations: " + ", ".join(violations))
        # Never execute possibly modified project checks after a scope/policy violation.
        if successful(outcome) and not errors:
            for check_id in task["check_ids"]:
                checks[check_id] = run_process(config["checks"][check_id], root,
                    config["check_seconds"], allowance, folder / f"check-{check_id}.log",
                    cancelled=cancelled, env=clean_env())
                if cancelled() or allowance.overflow.is_set():
                    break
    except (Exception, KeyboardInterrupt) as exc:
        errors.append(f"{type(exc).__name__}: {exc}")
    try:
        after = baseline(root)
        changed, violations = changes(before, after, task["scope_paths"])
        save(folder / "after.json", after)
        if violations:
            errors.append("scope/baseline violations: " + ", ".join(violations))
        if result is not None and set(result["changed_files"]) != set(changed):
            errors.append("claimed changed_files differ from actual changes")
    except Exception as exc:
        changed, violations = [], ["baseline unavailable"]
        errors.append(str(exc))
    eligible = (not errors and outcome is not None and successful(outcome) and
        result is not None and result["status"] == "completed" and not result["blockers"] and
        set(checks) == set(task["check_ids"]) and all(successful(c) for c in checks.values()))
    report = {"run_id": run_id, "task": task, "worker": outcome, "result": result,
              "actual_changed_files": changed, "violations": violations, "checks": checks,
              "errors": errors, "eligible_for_acceptance": eligible}
    save(folder / "report.json", report)
    # Research-only progress needs a completed result plus independent passing checks.
    progress = bool(changed) or eligible
    state.finish(run_id, progress)
    return report


def doctor(root, config):
    evidence = {}
    probes = {"codex_version": ["codex", "--version"], "codex_auth": ["codex", "login", "status"],
              "codex_flags": ["codex", "exec", "--help"], "claude_auth": ["claude", "auth", "status"],
              "git": ["git", "--version"], "node": ["node", "--version"]}
    for key, argv in probes.items():
        try:
            probe = subprocess.run(executable(argv), capture_output=True, timeout=20,
                                   env=clean_env(), cwd=root)
            output = (probe.stdout + probe.stderr).decode("utf-8", errors="replace")[:20000]
            if key == "claude_auth":
                # Do not print account identity or any credential material.
                auth = json.loads(output)
                evidence[key] = {k: auth.get(k) for k in ("loggedIn", "authMethod", "subscriptionType")}
            elif key == "codex_flags":
                evidence[key] = {flag: flag in output for flag in
                    ("--json", "--output-schema", "--output-last-message", "workspace-write")}
            else:
                evidence[key] = {"exit_code": probe.returncode, "output": output.strip()}
        except Exception as exc:
            evidence[key] = {"error": str(exc)}
    evidence["worker_argv"] = executable(config["worker_argv"])
    evidence["python"] = sys.executable
    evidence["os"] = sys.platform
    evidence["signed_supervisor_loop"] = "unverified until two tasks are reviewed in one Claude session"
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("doctor", "status"):
        commands.add_parser(command)
    run = commands.add_parser("run")
    run.add_argument("--task", type=Path, required=True)
    for command in ("report", "review", "cancel", "recover"):
        sub = commands.add_parser(command)
        sub.add_argument("--run", required=True)
        if command in ("review", "recover"):
            sub.add_argument("--note", required=True)
        if command == "review":
            sub.add_argument("--decision", required=True, choices=["accepted", "needs_followup", "blocked"])
    reset = commands.add_parser("reset-budget")
    reset.add_argument("--reason", required=True, help="exact explicit user authorization; never automatic")
    args = parser.parse_args()
    config = config_for(ROOT)
    state = State(ROOT)
    if args.command == "doctor":
        output = doctor(ROOT, config)
    elif args.command == "status":
        output = {"budgets": [dict(r) for r in state.db.execute("SELECT * FROM budgets")],
                  "runs": [dict(r) for r in state.db.execute("SELECT * FROM runs ORDER BY created")],
                  "reviews": [dict(r) for r in state.db.execute("SELECT * FROM reviews ORDER BY at")]}
    elif args.command == "run":
        output = dispatch(ROOT, state, config, args.task)
    elif args.command == "report":
        state.get(args.run)
        output = load_json(ROOT / ".agent/runs" / args.run / "report.json", 1048576)
    elif args.command == "review":
        if not args.note.strip():
            raise ValueError("review needs an evidence note")
        state.review(args.run, args.decision, args.note)
        output = {"run_id": args.run, "decision": args.decision}
    elif args.command == "cancel":
        if state.get(args.run)["state"] != "running":
            raise ValueError("only a running task can be cancelled")
        state.db.execute("UPDATE runs SET cancel=1 WHERE id=?", (args.run,))
        state.db.commit()
        output = {"run_id": args.run, "cancel_requested": True}
    elif args.command == "recover":
        row = state.get(args.run)
        if row["state"] != "running" or identity(row["owner"]) == row["birth"]:
            raise ValueError("owner is live or run is not interrupted; cancel through owner")
        folder = ROOT / ".agent/runs" / args.run
        if not (folder / "report.json").exists():
            save(folder / "report.json", {"run_id": args.run, "eligible_for_acceptance": False,
                "errors": ["interrupted owner; partial edits retained", args.note]})
        state.finish(args.run, False)
        output = {"run_id": args.run, "state": "awaiting_review", "note": args.note}
    else:
        if not args.reason.strip():
            raise ValueError("budget reset needs explicit user authorization")
        state.reset(args.reason)
        output = {"budget_reset": True, "reason": args.reason}
    print(json.dumps(output, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"agent-runner: {error}", file=sys.stderr)
        sys.exit(1)
