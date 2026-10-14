// Owns: Build mode's repository files, guarded separately from personal data (§13.4).
// Failure behavior: reject escaping/credential paths and every symlink before I/O;
// refuse stale captures rather than overwriting edits made after the diff was shown.
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { credentialPath } from "../security/credential-paths.ts";
import { REPO_DIR, StoreError } from "./paths.ts";
import { renameAtomic, resolveWithin } from "./files.ts";

const DENIED = /^(?:data|\.git|\.agent|\.codex|\.claude|node_modules|\.next|\.githooks)(?:\/|$)/i;
export function codePath(rel: string): string {
  if (!rel || rel.includes("\\") || rel.includes(":") || rel.split("/").some((part) => !part || part === ".." || /[. ]$/.test(part)) || DENIED.test(rel) || credentialPath(rel)) {
    throw new StoreError("forbidden_path", `${rel}: Build edits project files only`);
  }
  return resolveWithin(REPO_DIR, rel);
}

export async function codeFile(rel: string): Promise<string> {
  const abs = codePath(rel);
  let current = REPO_DIR;
  for (const part of path.relative(REPO_DIR, abs).split(path.sep)) {
    current = path.join(current, part);
    const info = await lstat(current).catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return null;
      throw err;
    });
    if (info?.isSymbolicLink()) throw new StoreError("forbidden_path", `${rel}: Build does not follow links`);
  }
  return abs;
}

export async function readCode(rel: string): Promise<Buffer | null> {
  try { return await readFile(await codeFile(rel)); }
  catch (err) { if ((err as NodeJS.ErrnoException).code === "ENOENT") return null; throw err; }
}

export async function writeCode(rel: string, bytes: Buffer | null): Promise<void> {
  const abs = await codeFile(rel);
  if (bytes === null) { await rm(abs, { force: true }); return; }
  const current = await readCode(rel);
  if (current?.equals(bytes)) return;
  await mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.attune-${process.pid}.tmp`;
  try { await writeFile(tmp, bytes); await renameAtomic(tmp, abs); }
  finally { await rm(tmp, { force: true }); }
}

export type CodeCapture = Map<string, Buffer | null>;
export const codeHash = (bytes: Buffer | null): string | null => bytes === null ? null : createHash("sha256").update(bytes).digest("hex");
export async function captureCode(paths: string[]): Promise<CodeCapture> {
  const captured: CodeCapture = new Map();
  for (const rel of paths) captured.set(rel, await readCode(rel));
  return captured;
}

export function changedCode(before: CodeCapture, after: CodeCapture): string[] {
  return [...new Set([...before.keys(), ...after.keys()])].filter((rel) => codeHash(before.get(rel) ?? null) !== codeHash(after.get(rel) ?? null)).sort();
}

export async function assertCode(capture: CodeCapture, paths: string[]): Promise<void> {
  for (const rel of paths) {
    if (codeHash(await readCode(rel)) !== codeHash(capture.get(rel) ?? null)) {
      throw new StoreError("conflict", `${rel} changed after the diff was captured; inspect it before continuing`);
    }
  }
}

export async function restoreCode(capture: CodeCapture, paths: string[]): Promise<void> {
  for (const rel of paths) await writeCode(rel, capture.get(rel) ?? null);
}
