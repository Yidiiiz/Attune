// Owns: the sanitized orphan snapshot shared by prepare, publication and fresh-clone verification.
// Failure behavior: preserve the source checkout and clean only the checked temporary clone.
import { appendFile, lstat, rm } from "node:fs/promises";
import path from "node:path";
import { excluded, exportFiles, readFiles } from "./publish-files.mjs";
import { clone, git, temporary, removeTemporary } from "./publish-process.mjs";
export async function prepareExport(root, revision = git(root, ["rev-parse", "HEAD"])) {
  const dir = await temporary();
  try {
    await clone(root, dir);
    git(dir, ["checkout", "--quiet", "--detach", revision]);
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
