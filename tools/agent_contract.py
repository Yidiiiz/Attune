"""Owns strict task/result validation and repository accountability.

Failure behavior: reject malformed contracts, escaped paths and unreadable files.
Scope checks are accountability for trusted workers, not OS isolation.
"""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess


def load_json(path, limit=65536):
    raw = Path(path).read_bytes()
    if len(raw) > limit:
        raise ValueError(f"JSON exceeds {limit} bytes")
    return json.loads(raw)


def validate(value, schema):
    """Validate the small, explicit JSON Schema subset used by both contracts."""
    types = schema.get("type", [])
    types = [types] if isinstance(types, str) else types
    matches = {"object": isinstance(value, dict), "array": isinstance(value, list),
               "string": isinstance(value, str), "integer": type(value) is int,
               "null": value is None}
    if types and not any(matches.get(t, False) for t in types):
        raise ValueError("contract type mismatch")
    if "enum" in schema and value not in schema["enum"]:
        raise ValueError("invalid contract enum")
    if isinstance(value, dict):
        props = schema["properties"]
        if set(schema.get("required", [])) - value.keys():
            raise ValueError("missing contract fields")
        if schema.get("additionalProperties") is False and value.keys() - props.keys():
            raise ValueError("unknown contract fields")
        for key, child in value.items():
            validate(child, props[key])
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            raise ValueError("empty required list")
        for child in value:
            validate(child, schema["items"])
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            raise ValueError("empty required string")
        if "pattern" in schema and not re.fullmatch(schema["pattern"], value):
            raise ValueError("invalid contract identifier")
    if type(value) is int:
        if value < schema.get("minimum", value) or value > schema.get("maximum", value):
            raise ValueError("integer outside contract bounds")


PROTECTED = (".git", ".agent", ".codex", ".claude", "data", "node_modules",
             "AGENTS.md", "CLAUDE.md", "PROJECT.md", "AUTOMATION_WORKFLOW.md",
             "agent-config.json", "agent-task.schema.json", "agent-worker-result.schema.json",
             "tools/agent_", "tools/test_agent_", ".githooks", ".env")


def safe_path(root, rel):
    if not isinstance(rel, str) or not rel or "\\" in rel or ":" in rel:
        raise ValueError("path must be normalized and relative")
    parts = PurePosixPath(rel).parts
    if rel.startswith("/") or any(p in ("", ".", "..") for p in rel.rstrip("/").split("/")):
        raise ValueError("path traversal or non-normalized path")
    if not parts or not (root / rel).resolve().is_relative_to(root.resolve()):
        raise ValueError("path escapes repository through a link")
    return rel


def protected(rel):
    return any(rel == p or rel.startswith(p + "/") or
               (p.endswith(("_", ".env")) and rel.startswith(p)) for p in PROTECTED)


def validate_task(root, task, config):
    validate(task, load_json(root / "agent-task.schema.json"))
    for scope in task["scope_paths"]:
        safe_path(root, scope)
        if protected(scope.rstrip("/")):
            raise ValueError(f"protected scope: {scope}")
    if any(c not in config["checks"] for c in task["check_ids"]):
        raise ValueError("unknown trusted check")


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args], timeout=30)


def baseline(root):
    paths = git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard")
    files = {}
    for raw in paths.split(b"\0"):
        if not raw:
            continue
        rel = raw.decode("utf-8")
        safe_path(root, rel)
        file = root / rel
        files[rel] = hashlib.sha256(file.read_bytes()).hexdigest() if file.is_file() else None
    return {"files": files, "head": git(root, "rev-parse", "HEAD").decode().strip(),
            "index": hashlib.sha256(git(root, "ls-files", "--stage", "-z")).hexdigest(),
            "status": git(root, "status", "--porcelain=v1", "--untracked-files=all", "-z").decode("utf-8")}


def changes(before, after, scopes):
    changed = sorted(p for p in before["files"].keys() | after["files"].keys()
                     if before["files"].get(p) != after["files"].get(p))
    violations = [p for p in changed if protected(p) or not any(
        p.startswith(s) if s.endswith("/") else p == s for s in scopes)]
    # A dirty baseline may be inspected, but never overwritten by a worker.
    dirty = {line[3:].split(" -> ")[-1] for line in before["status"].split("\0") if line}
    violations += [p for p in changed if p in dirty]
    if before["head"] != after["head"] or before["index"] != after["index"]:
        violations.append("git HEAD/index changed")
    return changed, sorted(set(violations))
