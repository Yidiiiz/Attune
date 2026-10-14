// Owns: Build's git observations. Failure behavior: repository containment is checked before every call.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertOwnRepository, gitOptions } from "./repository.ts";
import { codePath } from "../store/code.ts";
const exec = promisify(execFile);

export async function buildGit(...args: string[]): Promise<string> {
  await assertOwnRepository();
  try {
    const { stdout } = await exec("git", args, { ...gitOptions(), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    if (args[0] === "diff" && (err as { code?: number }).code === 1) return (err as { stdout: string }).stdout;
    throw err;
  }
}

export async function projectFiles(): Promise<string[]> {
  const names = (await buildGit("ls-files", "--cached", "--others", "--exclude-standard", "-z")).split("\0").filter(Boolean);
  return [...new Set(names)].filter((rel) => { try { codePath(rel); return true; } catch { return false; } });
}

export async function buildDiff(paths: string[], before: Set<string>): Promise<string> {
  let diff = await buildGit("diff", "--binary", "HEAD", "--", ...paths);
  for (const rel of paths.filter((one) => !before.has(one))) {
    diff += await buildGit("diff", "--no-index", "--binary", "--", "/dev/null", rel);
  }
  return diff;
}

export async function dirtyCode(): Promise<Set<string>> {
  const text = await buildGit("status", "--porcelain=v1", "--untracked-files=all", "-z");
  const entries = text.split("\0"), paths = new Set<string>();
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry) continue;
    paths.add(entry.slice(3));
    // Porcelain -z emits destination first, then the unprefixed original path.
    if (/[RC]/.test(entry.slice(0, 2))) paths.add(entries[++index]);
  }
  return paths;
}
