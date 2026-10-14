// Owns: Build's mandatory tool gate, including auto-approved file edits (Decision 108).
// Failure behavior: unknown tools/paths and any uncertainty deny the invocation.
import path from "node:path";
import { codeFile } from "../store/code.ts";
import { REPO_DIR } from "../store/paths.ts";

const READ = new Set(["Read", "Glob", "Grep"]);
const WRITE = new Set(["Edit", "Write"]);

export async function buildToolRefusal(tool: string, input: unknown, plan: boolean, dirty: Set<string>): Promise<string | null> {
  if (!READ.has(tool) && !WRITE.has(tool)) return "Build uses project file tools only; no shells or workers";
  if (plan && WRITE.has(tool)) return "Planning cannot write files";
  if (input === null || typeof input !== "object") return "Tool input is missing";
  const fields = input as Record<string, unknown>;
  const file = fields.file_path ?? fields.path;
  if (file === undefined && tool === "Glob") return null; // names only, never file contents
  if (file === undefined && tool === "Grep") return "Search a project source folder explicitly; root searches can include personal files";
  if (typeof file !== "string") return "A project path is required";
  const rel = path.relative(REPO_DIR, path.resolve(REPO_DIR, file)).split(path.sep).join("/");
  if (READ.has(tool) && rel === "") return tool === "Glob" ? null : "Choose a project source folder or file explicitly";
  try { await codeFile(rel); }
  catch { return "Build cannot access that path; personal files, credentials and links are protected"; }
  if (WRITE.has(tool) && dirty.has(rel)) return `${rel} already had edits before this build; keep them intact`;
  return null;
}
