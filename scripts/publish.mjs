// Owns: local orphan export preparation and explicitly requested publication (§12).
// Failure behavior: refuse dirty/unsafe sources and failed checks; never push without the explicit flag.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { excluded } from "./publish-files.mjs";
import { git, requireClean, removeTemporary } from "./publish-process.mjs";
import { prepareExport } from "./publish-export.mjs";
export { prepareExport };
import { audit, publishCheck, ROOT } from "./publish-check.mjs";
async function main() {
  const prepare = process.argv.includes("--prepare"), confirmed = process.argv.includes("--confirm-force-push");
  if (!prepare && !confirmed) throw new Error("Use --prepare for a local reviewable export, or explicitly --confirm-force-push to replace public/main");
  if (prepare && confirmed) throw new Error("Choose either local preparation or publication");
  requireClean(ROOT, excluded); const revision = git(ROOT, ["rev-parse", "HEAD"]); await audit(ROOT);
  let remote;
  if (!prepare) {
    remote = git(ROOT, ["remote", "get-url", "--push", "public"]);
    try { const parsed = new URL(remote); if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("Use a credential helper; public remote must not contain URL credentials or parameters"); }
    catch (error) { if (!remote.includes("@") || remote.includes("://")) throw error; }
    await publishCheck();
  }
  requireClean(ROOT, excluded);
  if (git(ROOT, ["rev-parse", "HEAD"]) !== revision) throw new Error("Source revision changed during verification");
  const dir = await prepareExport(ROOT, revision);
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
