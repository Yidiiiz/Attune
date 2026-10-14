"""Owns adversarial offline runner checks; never invokes a model.

Failure behavior: isolated repositories and owned subprocesses keep checks away
from the owner's files. A process lifecycle mismatch fails the suite.
"""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest

from agent_contract import baseline, changes, safe_path, validate_task
from agent_process import Allowance, identity, run_process
from agent_runner import ROOT, config_for, dispatch
from agent_state import State


FAKE = '''import json, pathlib, sys, time, subprocess
task = json.loads(sys.stdin.read().split("\\n", 1)[1])
mode = task["context"]
if mode == "edit": pathlib.Path("src/a.txt").write_text("new")
if mode == "escape": pathlib.Path("outside.txt").write_text("changed")
if mode == "dirty": pathlib.Path("src/dirty.txt").write_text("clobbered")
result = {"task_id": task["task_id"], "status": "completed", "summary": "inspected",
"changed_files": ["src/a.txt"] if mode == "edit" else [],
"checks_claimed": [], "blockers": [], "suggested_next_action": "review"}
if mode == "malformed": result["surprise"] = True
if mode == "wrong_id": result["task_id"] = "different"
if mode == "fail": sys.exit(1)
pathlib.Path(sys.argv[1]).write_text(json.dumps(result))
'''


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="attune runner ü ")
        self.root = Path(self.temp.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        self.git("config", "user.name", "Local check")
        self.git("config", "user.email", "check@invalid.local")
        (self.root / ".gitignore").write_text(".agent/\n")
        (self.root / "src").mkdir()
        (self.root / "src/a.txt").write_text("old")
        for name in ("agent-task.schema.json", "agent-worker-result.schema.json"):
            shutil.copyfile(ROOT / name, self.root / name)
        (self.root / "fake.py").write_text(FAKE)
        self.git("add", ".")
        self.git("commit", "-qm", "baseline")
        self.config = config_for(ROOT)
        self.config["worker_argv"] = [sys.executable, "fake.py", "{result}"]
        self.config["checks"] = {"ok": [sys.executable, "-c", "pass"],
                                 "bad": [sys.executable, "-c", "raise SystemExit(1)"]}
        self.task = {"task_id": "T001", "attempt": 1, "objective": "inspect",
            "context": "inspect", "scope_paths": ["src/"], "acceptance_criteria": ["works"],
            "check_ids": ["ok"], "constraints": [], "previous_report_id": None}
        self.state = State(self.root)

    def tearDown(self):
        self.state.db.close()
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.root), *args])

    def run_task(self, mode="inspect"):
        self.task["context"] = mode
        path = self.root / ".agent/task.json"
        path.write_text(json.dumps(self.task))
        return dispatch(self.root, self.state, self.config, path)

    def test_two_dependent_tasks_reviewed(self):
        first = self.run_task("edit")
        self.assertTrue(first["eligible_for_acceptance"])
        immutable = (self.root / ".agent/runs" / first["run_id"] / "report.json").read_bytes()
        self.state.review(first["run_id"], "accepted", "read diff and independent check")
        self.task["task_id"] = "T002"
        self.task["previous_report_id"] = first["run_id"]
        second = self.run_task()
        self.assertTrue(second["eligible_for_acceptance"])
        self.state.review(second["run_id"], "accepted", "verified dependent inspection")
        self.assertEqual(immutable, (self.root / ".agent/runs" / first["run_id"] / "report.json").read_bytes())

    def test_false_success_cannot_be_accepted(self):
        self.task["check_ids"] = ["bad"]
        report = self.run_task()
        self.assertFalse(report["eligible_for_acceptance"])
        with self.assertRaises(ValueError):
            self.state.review(report["run_id"], "accepted", "false success")

    def test_malformed_and_wrong_id(self):
        report = self.run_task("malformed")
        self.assertFalse(report["eligible_for_acceptance"])
        self.state.review(report["run_id"], "needs_followup", "schema")
        self.task.update(attempt=2, previous_report_id=report["run_id"])
        self.assertFalse(self.run_task("wrong_id")["eligible_for_acceptance"])

    def test_scope_violation_retains_edits_and_skips_checks(self):
        report = self.run_task("escape")
        self.assertFalse(report["eligible_for_acceptance"])
        self.assertEqual(report["checks"], {})
        self.assertEqual((self.root / "outside.txt").read_text(), "changed")

    def test_dirty_file_preserved_and_clobber_detected(self):
        (self.root / "src/dirty.txt").write_text("user edit")
        report = self.run_task("dirty")
        self.assertIn("src/dirty.txt", report["violations"])

    def test_unknown_keys_checks_and_protected_scopes(self):
        for field, value in [("extra", 1), ("check_ids", ["arbitrary"]),
                             ("scope_paths", ["tools/agent_state.py"])]:
            task = copy.deepcopy(self.task)
            task[field] = value
            with self.assertRaises(ValueError):
                validate_task(self.root, task, self.config)

    def test_paths(self):
        for path in ("/abs", "../escape", "src/../escape", "C:/escape", "src\\a", "src//a", "."):
            with self.assertRaises(ValueError, msg=path):
                safe_path(self.root, path)
        self.assertEqual(safe_path(self.root, "src/ü file.txt"), "src/ü file.txt")

    def test_junction_escape(self):
        other = self.root.parent
        if os.name == "nt":
            subprocess.run(["cmd", "/c", "mklink", "/J", str(self.root / "junction"), str(other)],
                           check=True, capture_output=True)
        else:
            (self.root / "junction").symlink_to(other, target_is_directory=True)
        try:
            with self.assertRaises(ValueError):
                safe_path(self.root, "junction/escape")
        finally:
            (self.root / "junction").rmdir() if os.name == "nt" else (self.root / "junction").unlink()

    def test_atomic_claim_and_review_gate(self):
        run_id = self.state.claim(self.task, self.config)
        other = State(self.root)
        try:
            with self.assertRaises(ValueError):
                other.claim(self.task, self.config)
            self.state.finish(run_id, True)
            with self.assertRaises(ValueError):
                other.claim(self.task, self.config)
        finally:
            other.db.close()

    def test_simultaneous_claims_consume_one_launch(self):
        barrier = threading.Barrier(2)
        outcomes = []
        def claim():
            state = State(self.root)
            try:
                barrier.wait()
                state.claim(self.task, self.config)
                outcomes.append("claimed")
            except ValueError:
                outcomes.append("refused")
            finally:
                state.db.close()
        threads = [threading.Thread(target=claim) for _ in range(2)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertEqual(sorted(outcomes), ["claimed", "refused"])
        self.assertEqual(self.state.db.execute("SELECT used FROM budgets").fetchone()[0], 1)

    def test_blocked_predecessor_does_not_unlock_dependency(self):
        report = self.run_task()
        self.state.review(report["run_id"], "blocked", "external prerequisite")
        self.task.update(task_id="T002", previous_report_id=report["run_id"])
        with self.assertRaises(ValueError):
            self.run_task()

    def test_result_size_is_bounded(self):
        from agent_contract import load_json
        large = self.root / "large.json"
        large.write_bytes(b" " * 100000)
        with self.assertRaises(ValueError):
            load_json(large, 1000)

    def test_budget_attempts_and_dependency(self):
        self.task["attempt"] = 2
        with self.assertRaises(ValueError):
            self.state.claim(self.task, self.config)
        self.task["attempt"] = 1
        self.task["previous_report_id"] = "unreviewed"
        with self.assertRaises(ValueError):
            self.state.claim(self.task, self.config)
        self.task["previous_report_id"] = None
        self.state.db.execute("UPDATE budgets SET used=6")
        self.state.db.commit()
        with self.assertRaises(ValueError):
            self.state.claim(self.task, self.config)

    def test_retry_cannot_change_acceptance(self):
        report = self.run_task("fail")
        self.state.review(report["run_id"], "needs_followup", "retry")
        self.task.update(attempt=2, previous_report_id=report["run_id"], acceptance_criteria=["easier"])
        with self.assertRaises(ValueError):
            self.run_task()

    def test_no_progress_halts(self):
        for attempt in (1, 2):
            self.task["attempt"] = attempt
            report = self.run_task("fail")
            self.state.review(report["run_id"], "needs_followup", "failure diagnosis")
            self.task["previous_report_id"] = report["run_id"]
        self.task["attempt"] = 3
        with self.assertRaises(ValueError):
            self.run_task()

    def process(self, source, seconds=2, cap=10000, stdin=b"", cancelled=lambda: False):
        return run_process([sys.executable, "-c", source], self.root, seconds,
            Allowance(cap), self.root / "output.log", stdin, cancelled)

    def test_blocked_stdin_deadline(self):
        start = time.monotonic()
        outcome = self.process("import time; time.sleep(30)", seconds=0.4, stdin=b"x" * 2000000)
        self.assertEqual(outcome["reason"], "deadline")
        self.assertLess(time.monotonic() - start, 4)

    def test_stdout_stderr_combined_cap(self):
        outcome = self.process("import os; os.write(1,b'x'*100000); os.write(2,b'y'*100000)", cap=1000)
        self.assertEqual(outcome["reason"], "log allowance exceeded")
        self.assertLessEqual((self.root / "output.log").stat().st_size, 1000)

    def test_cancel_and_descendants(self):
        event = threading.Event()
        timer = threading.Timer(0.5, event.set)
        timer.start()
        source = ("import subprocess,sys,time,pathlib; p=subprocess.Popen([sys.executable,'-c',"
                  "'import time; time.sleep(30)']); pathlib.Path('child.pid').write_text(str(p.pid)); time.sleep(30)")
        outcome = self.process(source, cancelled=event.is_set)
        timer.join()
        self.assertEqual(outcome["reason"], "cancelled")
        pid = int((self.root / "child.pid").read_text())
        self.assertIsNone(identity(pid))

    def test_success_also_kills_descendants(self):
        self.process("import subprocess,sys,pathlib; p=subprocess.Popen([sys.executable,'-c',"
                     "'import time; time.sleep(30)']); pathlib.Path('child.pid').write_text(str(p.pid))")
        self.assertIsNone(identity(int((self.root / "child.pid").read_text())))

    def test_abrupt_runner_death_kills_owned_children(self):
        helper = ("import sys,pathlib; sys.path.insert(0,sys.argv[1]); from agent_process import OwnedProcess; "
            "p=OwnedProcess([sys.executable,'-c','import time; time.sleep(30)'],sys.argv[2],None); "
            "pathlib.Path(sys.argv[2],'orphan.pid').write_text(str(p.proc.pid)); import time; time.sleep(30)")
        owner = subprocess.Popen([sys.executable, "-c", helper, str(ROOT / "tools"), str(self.root)])
        try:
            deadline = time.monotonic() + 5
            while not (self.root / "orphan.pid").exists() and time.monotonic() < deadline:
                time.sleep(0.05)
            pid = int((self.root / "orphan.pid").read_text())
            owner.kill()
            owner.wait()
            deadline = time.monotonic() + 3
            while identity(pid) is not None and time.monotonic() < deadline:
                time.sleep(0.05)
            self.assertIsNone(identity(pid))
        finally:
            if owner.poll() is None:
                owner.kill()
                owner.wait()


if __name__ == "__main__":
    unittest.main()
