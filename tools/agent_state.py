"""Owns atomic launch budgets, attempt history and separate supervisor reviews.

Failure behavior: SQLite transactions reject concurrent dispatch and never reset
a budget automatically. Interrupted runs block until their owner is proven dead.
"""
import json
import os
import sqlite3
import time
import uuid
from agent_process import identity


class State:
    def __init__(self, root):
        self.root = root
        runtime = root / ".agent"
        runtime.mkdir(exist_ok=True)
        self.db = sqlite3.connect(runtime / "state.sqlite3", timeout=10)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS budgets (
              id INTEGER PRIMARY KEY, used INTEGER NOT NULL, reason TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS runs (
              id TEXT PRIMARY KEY, task TEXT NOT NULL, attempt INTEGER NOT NULL,
              state TEXT NOT NULL, owner INTEGER NOT NULL, birth TEXT NOT NULL,
              budget INTEGER NOT NULL, cancel INTEGER NOT NULL DEFAULT 0,
              progress INTEGER, created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS reviews (
              run TEXT PRIMARY KEY, decision TEXT NOT NULL, note TEXT NOT NULL, at REAL NOT NULL);
            INSERT OR IGNORE INTO budgets VALUES(1, 0, 'initial user-authorized budget');
        """)
        self.db.commit()

    def claim(self, task, config):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            if self.db.execute("SELECT 1 FROM runs WHERE state IN ('running','awaiting_review')").fetchone():
                raise ValueError("another run is active or awaiting review")
            latest = self.db.execute("SELECT * FROM runs ORDER BY created DESC LIMIT 2").fetchall()
            if len(latest) == 2 and all(r["progress"] == 0 for r in latest):
                raise ValueError("two attempts made no progress; halt and diagnose")
            previous = self.db.execute("SELECT * FROM runs WHERE task=? ORDER BY attempt DESC LIMIT 1",
                                       (task["task_id"],)).fetchone()
            expected = previous["attempt"] + 1 if previous else 1
            if task["attempt"] != expected or expected > config["max_attempts"]:
                raise ValueError("attempt out of sequence or exhausted")
            if previous:
                if task["previous_report_id"] != previous["id"]:
                    raise ValueError("retry must cite previous report")
                old_task = json.loads((self.root / ".agent/runs" / previous["id"] / "task.json").read_text())
                if task["acceptance_criteria"] != old_task["acceptance_criteria"]:
                    raise ValueError("retry cannot weaken or change acceptance criteria")
            elif task["previous_report_id"]:
                dependency = self.db.execute("SELECT decision FROM reviews WHERE run=?",
                    (task["previous_report_id"],)).fetchone()
                if not dependency or dependency[0] != "accepted":
                    raise ValueError("dependent task requires an accepted report")
            budget = self.db.execute("SELECT * FROM budgets ORDER BY id DESC LIMIT 1").fetchone()
            if budget["used"] >= config["launch_budget"]:
                raise ValueError("worker budget exhausted")
            run_id = uuid.uuid4().hex
            birth = identity(os.getpid())
            if birth is None:
                raise ValueError("could not identify runner owner")
            self.db.execute("UPDATE budgets SET used=used+1 WHERE id=?", (budget["id"],))
            self.db.execute("INSERT INTO runs(id,task,attempt,state,owner,birth,budget,created) VALUES(?,?,?,?,?,?,?,?)",
                (run_id, task["task_id"], task["attempt"], "running", os.getpid(), birth, budget["id"], time.time()))
            self.db.commit()
            return run_id
        except BaseException:
            self.db.rollback()
            raise

    def get(self, run_id):
        row = self.db.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
        if not row:
            raise ValueError("unknown run")
        return row

    def finish(self, run_id, progress):
        self.db.execute("UPDATE runs SET state='awaiting_review', progress=? WHERE id=?", (int(progress), run_id))
        self.db.commit()

    def review(self, run_id, decision, note):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            if self.get(run_id)["state"] != "awaiting_review":
                raise ValueError("run is not awaiting review")
            if decision == "accepted":
                report = json.loads((self.root / ".agent/runs" / run_id / "report.json").read_text())
                if not report["eligible_for_acceptance"]:
                    raise ValueError("failed, malformed or out-of-scope run cannot be accepted")
            self.db.execute("INSERT INTO reviews VALUES(?,?,?,?)", (run_id, decision, note, time.time()))
            self.db.execute("UPDATE runs SET state='reviewed' WHERE id=?", (run_id,))
            self.db.commit()
        except BaseException:
            self.db.rollback()
            raise

    def reset(self, reason):
        self.db.execute("BEGIN IMMEDIATE")
        if self.db.execute("SELECT 1 FROM runs WHERE state IN ('running','awaiting_review')").fetchone():
            self.db.rollback()
            raise ValueError("reconcile active runs first")
        self.db.execute("INSERT INTO budgets(used,reason) VALUES(0,?)", (reason,))
        self.db.commit()
