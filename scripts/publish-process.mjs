// Owns: bounded native commands and contained temporary clones for publication tooling.
// Failure behavior: stop owned subprocess trees on timeout/signal; never clean an unchecked directory.
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
export function git(cwd, args, input) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CEILING_DIRECTORIES: path.dirname(path.resolve(cwd)), GIT_DISCOVERY_ACROSS_FILESYSTEM: "0" };
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE"]) delete env[name];
  return execFileSync("git", args, { cwd, input, encoding: "utf8", windowsHide: true, maxBuffer: 128 * 1024 * 1024, timeout: 60000, env }).trim();
}
export function cleanEnv() {
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", CI: "1", GIT_TERMINAL_PROMPT: "0" };
  for (const name of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "ATTUNE_REPO_DIR", "ATTUNE_FAKE_PROVIDER"]) delete env[name];
  return env;
}
export function npmCli() {
  const candidates = [process.env.npm_execpath, path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js")];
  const found = candidates.find(one => one && one.endsWith("npm-cli.js") && existsSync(one));
  if (!found) throw new Error("Run this command through npm so its installed CLI can be resolved");
  return found;
}
export function stopTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 15000 }); } catch { child.kill(); }
  } else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill(); } }
}
export function start(args, cwd, env = cleanEnv()) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "inherit", "inherit"], detached: process.platform !== "win32", windowsHide: true });
  const cancel = () => stopTree(child);
  process.on("SIGINT", cancel); process.on("SIGTERM", cancel); process.on("exit", cancel);
  child.once("close", () => { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); process.removeListener("exit", cancel); });
  return child;
}
export async function command(args, cwd, seconds = 600) {
  const child = start(args, cwd); let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; stopTree(child); }, seconds * 1000);
  try {
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    if (timedOut || code !== 0) throw new Error(timedOut ? "Command deadline exceeded" : `Command failed (${code}): ${args.slice(0, 2).join(" ")}`);
  } finally { clearTimeout(timer); stopTree(child); }
}
export async function temporary() {
  return mkdtemp(path.join(os.tmpdir(), "attune-publish-"));
}
export async function removeTemporary(dir) {
  const resolved = await realpath(dir), root = await realpath(os.tmpdir());
  if (path.dirname(resolved).toLowerCase() !== root.toLowerCase() || !path.basename(resolved).startsWith("attune-publish-")) throw new Error("Refusing unchecked temporary cleanup path");
  await rm(resolved, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
export async function clone(root, dir) {
  git(root, ["clone", "--quiet", "--no-local", "--no-hardlinks", "--single-branch", root, dir]);
  git(dir, ["remote", "remove", "origin"]);
}
export function requireClean(root, excluded) {
  if (git(root, ["diff", "HEAD", "--name-only"])) throw new Error("Commit or preserve tracked changes before verifying the HEAD snapshot");
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean).filter(rel => !excluded(rel));
  if (untracked.length) throw new Error(`Uncommitted export files: ${untracked.join(", ")}`);
}
