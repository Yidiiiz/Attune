// Owns: what the file browser may list and open (PROJECT.md §10.2, §14's `/api/files/tree`, `read`
// and `raw`) — the tree under `data/`, the checkout's tracked files for "Whole repo", and the one read
// every one of those routes goes through. Writes are not here; they go through `runBatch`.
//
// **Three refusals, each independent of the others** (the Phase 8 approval, "Whole repo"):
//
//   - **Credential-shaped names** (`lib/security/credential-paths.ts`) are left out of every tree and
//     refused by every read, tracked or not, under `data/` or not.
//   - **"Whole repo" is git's tracked files, not the directory.** `.env.local` is untracked, so it is
//     not there to list; and a path that is not tracked is refused when asked for directly, not only
//     left out of the tree — a read route that trusted the tree to have hidden it would not be a guard.
//   - **A link is followed only if it stays home.** A read resolves the real path and refuses one
//     that lands outside its root — so a symlink in `data/`, or a tracked one in the checkout,
//     pointing at `.env.local` is refused — and applies the name rule to the real path as well.
//
// Failure behavior: every refusal is a `StoreError` naming the path and the reason; nothing here
// reads a refused file's bytes, so a refusal cannot leak what it guarded.

import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { credentialPath, credentialRefusal } from "../security/credential-paths.ts";
import { listTree, resolveWithin } from "./files.ts";
import { DATA_DIR, REPO_DIR, StoreError, resolveData } from "./paths.ts";
import type { TreeNode } from "./files.ts";

/** Larger than this is not opened in the browser; a text editor or the file manager still can. */
export const MAX_OPEN_BYTES = 8 * 1024 * 1024;

const toPosix = (rel: string): string => rel.split(path.sep).join("/");

/** Drop every credential-shaped node, and everything under one, from a tree. */
function withoutCredentials(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .filter((node) => credentialPath(node.path) === null)
    .map((node) => (node.children ? { ...node, children: withoutCredentials(node.children) } : node));
}

/** The tree under `data/` as the Files panel shows it. */
export async function dataTree(): Promise<TreeNode[]> {
  return withoutCredentials(await listTree(""));
}

/**
 * The checkout's tracked files as a tree, `data/` left out — it is the other tree — and credential
 * names dropped. Pure: `tracked` comes from `git ls-files`, which lives in `lib/history/git.ts`.
 */
export function repoTree(tracked: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };
  for (const rel of tracked) {
    if (rel === "data" || rel.startsWith("data/") || credentialPath(rel) !== null) continue;
    let dir = root;
    const parts = rel.split("/");
    parts.forEach((part, i) => {
      const at = parts.slice(0, i + 1).join("/");
      if (i === parts.length - 1) {
        dir.children?.push({ name: part, path: at, type: "file" });
        return;
      }
      let next = dir.children?.find((child) => child.type === "dir" && child.name === part);
      if (!next) {
        next = { name: part, path: at, type: "dir", children: [] };
        dir.children?.push(next);
      }
      dir = next;
    });
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .map((node) => (node.children ? { ...node, children: sort(node.children) } : node))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  return sort(root.children ?? []);
}

/**
 * A file's bytes for the browser, after every refusal above. `where` says which tree `rel` is in;
 * a repository read needs the tracked set, so the caller that can run git hands it in.
 */
export async function readForBrowser(rel: string, where: "data" | "repo", tracked?: ReadonlySet<string>): Promise<Buffer> {
  const refuse = (why: string): never => {
    throw new StoreError("forbidden_path", why);
  };
  const credential = credentialPath(rel);
  if (credential) refuse(credentialRefusal(rel, credential));

  const root = where === "data" ? DATA_DIR : REPO_DIR;
  const abs = where === "data" ? resolveData(rel) : resolveWithin(REPO_DIR, rel);
  if (where === "repo") {
    if (rel === "data" || rel.startsWith("data/")) refuse(`${rel} is under data/, which is opened from the data tree.`);
    if (!tracked?.has(rel)) refuse(`${rel} is not a file git tracks, and "Whole repo" shows only those.`);
  }

  let real: string;
  try {
    real = await realpath(abs);
  } catch {
    throw new StoreError("not_found", `no such file: ${rel}`);
  }
  const home = await realpath(root);
  if (!real.startsWith(home + path.sep)) refuse(`${rel} is a link to somewhere outside ${where === "data" ? "data/" : "the checkout"}, which is not followed.`);
  const realRel = toPosix(path.relative(home, real));
  const realCredential = credentialPath(realRel);
  if (realCredential) refuse(`${rel} leads to ${realRel}, which is ${realCredential}; it is not opened.`);

  const info = await lstat(real);
  if (!info.isFile()) throw new StoreError("invalid", `${rel} is not a file.`);
  if (info.size > MAX_OPEN_BYTES) {
    throw new StoreError("invalid", `${rel} is ${(info.size / 1024 / 1024).toFixed(1)} MB, more than the browser opens; use a text editor or the file manager.`);
  }
  return readFile(real);
}
