// Owns: technical release readiness, without browser downloads or remote writes (§12).
// Failure behavior: any failed audit/check refuses; no manual/provider row is silently marked verified.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { DATA_DIR } from "../lib/store/paths.ts";
import { findSecret } from "../lib/security/secrets.ts";
import { auditFiles, excluded, exportFiles, readFiles } from "./publish-files.mjs";
import { command, git, requireClean } from "./publish-process.mjs";
import { freshClone } from "./publish-fresh.mjs";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function audit(root = ROOT) {
  if (path.resolve(git(root, ["rev-parse", "--show-toplevel"])) !== path.resolve(root)) throw new Error("Release audit must run in its own repository");
  if (path.resolve(path.dirname(DATA_DIR)) !== path.resolve(root)) throw new Error("Unset the application repository override before auditing this checkout");
  const names = git(root, ["ls-files", "-z"]).split("\0").filter(Boolean);
  if (names.some(rel => rel === "data" || rel.startsWith("data/"))) throw new Error("Personal data is tracked");
  execFileSync("git", ["check-ignore", "-q", ".env.local"], { cwd: root, stdio: "ignore" });
  let personal = {};
  try { personal = JSON.parse(await readFile(path.join(DATA_DIR, "settings/settings.json"), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw new Error("Current settings could not be audited read-only"); }
  const files = await readFiles(root, exportFiles(names));
  const errors = auditFiles(files, [personal.identity?.name, personal.weather?.label].filter(Boolean));
  if (names.some(rel => !exportFiles([rel]).length && !excluded(rel))) errors.push("Export selection is inconsistent");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`publish-check: ${files.size} exported files passed static audit`);
}
export function auditHistory(root = ROOT) {
  const patch = git(root, ["-c", "core.quotepath=false", "log", "--all", "--format=", "-p", "--no-ext-diff", "--no-textconv", "--no-renames", "--", ".", ":(glob,exclude)**/*.md"]);
  let rel = "unknown";
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ b/")) rel = line.slice(6);
    else if (line.startsWith("+") && !line.startsWith("+++")) {
      const hit = findSecret(line.slice(1)); if (hit) throw new Error(`Historical credential pattern ${hit} in ${rel}`);
    }
  }
  console.log("publish-check: historical source credential scan passed");
}
export async function publishCheck({ auditOnly = false } = {}) {
  await audit();
  if (auditOnly) return;
  requireClean(ROOT, excluded);
  await command(["scripts/check-secrets.mjs", "--all"], ROOT, 60);
  auditHistory();
  await command(["scripts/check-lib-imports.mjs"], ROOT, 60);
  await command(["node_modules/vitest/vitest.mjs", "run"], ROOT, 300);
  await command(["node_modules/typescript/bin/tsc", "--noEmit"], ROOT, 120);
  await freshClone(ROOT);
  console.log("publish-check: technical checks passed; see docs/CHECKLIST.md for manual/provider acceptance");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await publishCheck({ auditOnly: process.argv.includes("--audit-only") }); }
  catch (error) { console.error(`publish-check: ${error.message}`); process.exitCode = 1; }
}
