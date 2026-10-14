// Owns: the exact export set and static release audits (§12, Decision 114).
// Failure behavior: report paths/rule names only; refuse links, personal content and unsafe exports.
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { credentialPath } from "../lib/security/credential-paths.ts";
import { findSecret } from "../lib/security/secrets.ts";
import { defaultSettings, SettingsSchema } from "../lib/store/settings.ts";
export const PRIVATE = ["data", "BUILD_PROMPT.md", "HANDOFF-CHAT.md", "HANDOFF.md", ".agent", ".e2e-sandbox", "node_modules", ".next", "test-results", "playwright-report", "check-ui-evidence", ".venv", "__pycache__"];
export function excluded(rel) {
  return PRIVATE.some(one => rel === one || rel.startsWith(`${one}/`)) || credentialPath(rel) !== null || /(?:^|\/)__pycache__(?:\/|$)|\.tsbuildinfo$/.test(rel);
}
export function exportFiles(names) { return names.filter(rel => !excluded(rel)); }
export async function readFiles(root, names) {
  const files = new Map();
  for (const rel of names) {
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(path.resolve(root) + path.sep) || (await lstat(abs)).isSymbolicLink()) throw new Error(`Unsafe export path: ${rel}`);
    files.set(rel, await readFile(abs));
  }
  return files;
}
export function dataLiterals(rel, text) {
  if (rel === "lib/store/paths.ts" || rel.startsWith("lib/testing/") || /-scripted\.ts$/.test(rel) || /\.test\.[cm]?[jt]sx?$/.test(rel) || !/^(app|components|lib|scripts)\//.test(rel) || !/\.[cm]?[jt]sx?$/.test(rel)) return [];
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
  const found = [];
  const visit = node => {
    const parent = node.parent;
    const namespace = parent && ((ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) && parent.expression.name.text === "startsWith") || (ts.isPropertyAccessExpression(parent) && parent.name.text === "length"));
    if (!namespace && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) && node.text.startsWith("data/")) found.push(`${rel}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: runtime data path literal`);
    ts.forEachChild(node, visit);
  };
  visit(source); return found;
}
const ATTRIBUTION = [new RegExp(["co", "authored", "by"].join("-"), "i"), new RegExp(["generated", "with"].join("\\s+"), "i")];
const APPROVED_LICENSE = "249152e583dbaeb5341bf0e7e0610b77d48fe2583b642bbd11e3c023488b3aea";
const FIXED_SEED = ["settings/settings.json", "history/actions.jsonl", "history/action-history.md", "files/index.md", "knowledge/index.md", ...["about-me", "habits", "preferences"].map(one => `knowledge/profile/${one}.md`), ...["courses", "tools", "projects", "people"].map(one => `knowledge/maps/${one}.md`)];
const EMPTY_SEED = ["tasks", "chats", "files/images", "files/docs", "files/other", "settings/themes", "knowledge/notes", "knowledge/collections", "knowledge/sessions", "history/blobs"];
export function seedProblems(files) {
  const errors = [];
  const expected = new Set([...FIXED_SEED, ...EMPTY_SEED.map(one => `${one}/.gitkeep`)].map(one => `seed/${one}`));
  for (const rel of expected) if (!files.has(rel)) errors.push(`Missing seed counterpart: ${rel}`);
  for (const rel of files.keys()) if (rel.startsWith("seed/") && !expected.has(rel)) errors.push(`Unexpected seed content: ${rel}`);
  try {
    const parsed = SettingsSchema.parse(JSON.parse(files.get("seed/settings/settings.json").toString("utf8")));
    if (JSON.stringify(parsed) !== JSON.stringify(defaultSettings())) errors.push("Seed settings must be the canonical empty defaults");
  } catch { errors.push("Seed settings cannot be validated"); }
  if (files.get("seed/history/actions.jsonl")?.length) errors.push("Seed history must be empty");
  for (const name of ["about-me", "habits", "preferences"]) {
    const rel = `seed/knowledge/profile/${name}.md`;
    const text = files.get(rel)?.toString("utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/^#[^\n]*$/gm, "").trim();
    if (text) errors.push(`Seed profile is not empty: ${rel}`);
  }
  return errors;
}
export function auditFiles(files, identity = []) {
  const errors = [...seedProblems(files)];
  const license = files.get("LICENSE");
  if (!license?.length || createHash("sha256").update(license).digest("hex") !== APPROVED_LICENSE || !/^Copyright \(c\) [0-9]{4} .+/m.test(license.toString("utf8"))) errors.push("LICENSE does not match the approved proprietary notice");
  const readme = files.get("README.md")?.toString("utf8") ?? "";
  if (!readme.includes("LICENSE") || !/proprietary/i.test(readme)) errors.push("README must link the proprietary LICENSE");
  for (const [rel, bytes] of files) {
    if (excluded(rel)) { errors.push(`Excluded path in export: ${rel}`); continue; }
    if (bytes.includes(0)) continue;
    const text = bytes.toString("utf8"), hit = findSecret(text);
    if (hit) errors.push(`${rel}: credential pattern ${hit}`);
    errors.push(...dataLiterals(rel, text));
    if (/^(app|components|lib|scripts|seed)\//.test(rel) && identity.filter(Boolean).some(needle => text.toLowerCase().includes(needle.toLowerCase()))) errors.push(`${rel}: personal identity/location value`);
    if (!["PROJECT.md", "AGENTS.md"].includes(rel) && ATTRIBUTION.some(pattern => pattern.test(text))) errors.push(`${rel}: attribution phrase`);
    if (bytes.includes(13)) errors.push(`${rel}: CR byte in tracked text`);
  }
  return errors;
}
