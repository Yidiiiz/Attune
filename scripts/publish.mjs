// Owns: local orphan export preparation and explicitly requested publication (§12).
// Failure behavior: refuse dirty/unsafe sources and failed checks; never push without the explicit flag.
import { appendFile, lstat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { excluded, exportFiles, readFiles } from "./publish-files.mjs";
import { clone, git, requireClean, temporary, removeTemporary } from "./publish-process.mjs";
import { audit, publishCheck, ROOT } from "./publish-check.mjs";
export async function prepareExport(root) {
  const dir = await temporary();
  try {
    await clone(root, dir);
    const names = git(dir, ["ls-files", "-z"]).split("\0").filter(Boolean);
    const exported = exportFiles(names); await readFiles(dir, exported);
    for (const rel of names.filter(one => excluded(one))) {
      const target = path.resolve(dir, rel);
      if (!target.startsWith(path.resolve(dir) + path.sep)) throw new Error("Unsafe export removal path");
      const stat = await lstat(target);
      await rm(target, { recursive: stat.isDirectory(), force: true });
    }
    await appendFile(path.join(dir, ".gitignore"), "\n# Private project handoffs\nBUILD_PROMPT.md\nHANDOFF-CHAT.md\nHANDOFF.md\n");
    git(dir, ["config", "user.name", git(root, ["config", "user.name"])]);
    git(dir, ["config", "user.email", git(root, ["config", "user.email"])]);
    git(dir, ["config", "commit.gpgsign", "false"]);
    git(dir, ["checkout", "--quiet", "--orphan", "publish-export"]);
    git(dir, ["read-tree", "--empty"]);
    git(dir, ["--literal-pathspecs", "add", "--pathspec-from-file=-", "--pathspec-file-nul"], exported.join("\0") + "\0");
    git(dir, ["commit", "--quiet", "--no-gpg-sign", "-m", "Publish"]);
    for (const ref of git(dir, ["for-each-ref", "--format=%(refname)"]).split("\n").filter(Boolean)) {
      if (ref !== "refs/heads/publish-export") git(dir, ["update-ref", "-d", ref]);
    }
    git(dir, ["reflog", "expire", "--expire=now", "--all"]); git(dir, ["gc", "--quiet", "--prune=now"]);
    if (git(dir, ["rev-list", "--all", "--count"]) !== "1") throw new Error("Export is not one isolated orphan commit");
    const actual = git(dir, ["ls-files", "-z"]).split("\0").filter(Boolean);
    if (actual.some(excluded) || !actual.includes("LICENSE")) throw new Error("Export contains a private path or lacks LICENSE");
    return dir;
  } catch (error) { await removeTemporary(dir); throw error; }
}
async function main() {
  const prepare = process.argv.includes("--prepare"), confirmed = process.argv.includes("--confirm-force-push");
  if (!prepare && !confirmed) throw new Error("Use --prepare for a local reviewable export, or explicitly --confirm-force-push to replace public/main");
  if (prepare && confirmed) throw new Error("Choose either local preparation or publication");
  requireClean(ROOT, excluded); await audit(ROOT);
  let remote;
  if (!prepare) {
    remote = git(ROOT, ["remote", "get-url", "--push", "public"]);
    try { const parsed = new URL(remote); if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("Use a credential helper; public remote must not contain URL credentials or parameters"); }
    catch (error) { if (!remote.includes("@") || remote.includes("://")) throw error; }
    await publishCheck();
  }
  const dir = await prepareExport(ROOT);
  if (prepare) { console.log(`publish: local orphan export ready at ${dir}; no remote write occurred`); return; }
  try {
    git(dir, ["remote", "add", "public", remote]);
    const observed = git(dir, ["ls-remote", "public", "refs/heads/main"]).split(/\s+/)[0] ?? "";
    git(dir, ["push", `--force-with-lease=refs/heads/main:${observed}`, "public", "HEAD:refs/heads/main"]);
    console.log("publish: replaced public/main with the verified orphan snapshot");
  } finally { await removeTemporary(dir); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(`publish: ${error.message}`); process.exitCode = 1; }
}
